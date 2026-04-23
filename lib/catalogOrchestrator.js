/**
 * GloveCubs Catalog Intelligence Orchestrator
 * 
 * Coordinates specialized agents, routes work, enforces quality gates,
 * and ensures nothing low-confidence goes live without review.
 */

const fs = require('fs');
const path = require('path');

// ==============================================================================
// AGENT REGISTRY
// ==============================================================================

const AGENTS = {
  supplier_discovery: {
    name: 'Supplier Discovery Agent',
    description: 'Find and validate new suppliers',
    triggers: ['new_company', 'supplier_search', 'vendor_onboarding'],
    module: null // Future: '../lib/supplierDiscovery.js'
  },
  product_intake: {
    name: 'Product Intake Agent',
    description: 'Normalize raw product data from feeds/files',
    triggers: ['new_file', 'new_feed', 'catalog_upload', 'raw_data'],
    module: '../lib/productNormalization.js'
  },
  product_matching: {
    name: 'Product Matching Agent',
    description: 'Match incoming products to canonical catalog',
    triggers: ['new_product', 'dedupe_request', 'variant_check'],
    module: '../lib/productMatching.js'
  },
  competitive_pricing: {
    name: 'Competitive Pricing Agent',
    description: 'Analyze competitor prices and recommend changes',
    triggers: ['price_event', 'competitor_update', 'margin_review'],
    module: '../lib/competitivePricing.js'
  },
  daily_price_guard: {
    name: 'Daily Price Guard Agent',
    description: 'Daily monitoring and action queue generation',
    triggers: ['scheduled_daily', 'price_guard', 'morning_review'],
    module: '../lib/dailyPriceGuard.js'
  }
};

// ==============================================================================
// ESCALATION RULES
// ==============================================================================

const ESCALATION_RULES = {
  low_confidence_parse: {
    threshold: 0.85,
    action: 'human_review',
    queue: 'intake_review',
    reason: 'Parsed product confidence below threshold'
  },
  ambiguous_match: {
    threshold: 0.75,
    action: 'human_review',
    queue: 'matching_review',
    reason: 'Product match is ambiguous'
  },
  major_price_swing: {
    threshold: 0.07, // 7%
    action: 'human_review',
    queue: 'pricing_review',
    reason: 'Price change exceeds safe threshold'
  },
  map_conflict: {
    action: 'human_review',
    queue: 'legal_review',
    reason: 'Potential MAP pricing violation'
  },
  supplier_concern: {
    action: 'human_review',
    queue: 'supplier_review',
    reason: 'Supplier legitimacy or quality concern'
  },
  thin_margin: {
    threshold: 0.15, // 15%
    action: 'human_review',
    queue: 'pricing_review',
    reason: 'Margin below minimum threshold'
  },
  duplicate_suspected: {
    action: 'human_review',
    queue: 'catalog_review',
    reason: 'Suspected duplicate product'
  }
};

// ==============================================================================
// WORK QUEUES
// ==============================================================================

class WorkQueue {
  constructor(name) {
    this.name = name;
    this.items = [];
    this.processed = [];
    this.created_at = new Date().toISOString();
  }

  add(item) {
    this.items.push({
      id: `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      added_at: new Date().toISOString(),
      status: 'pending',
      ...item
    });
  }

  getNext() {
    return this.items.find(i => i.status === 'pending');
  }

  getPending() {
    return this.items.filter(i => i.status === 'pending');
  }

  markProcessed(id, result) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.status = 'processed';
      item.processed_at = new Date().toISOString();
      item.result = result;
      this.processed.push(item);
    }
  }

  markFailed(id, error) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.status = 'failed';
      item.failed_at = new Date().toISOString();
      item.error = error;
    }
  }

  markEscalated(id, reason) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.status = 'escalated';
      item.escalated_at = new Date().toISOString();
      item.escalation_reason = reason;
    }
  }

  getStats() {
    return {
      name: this.name,
      total: this.items.length,
      pending: this.items.filter(i => i.status === 'pending').length,
      processed: this.items.filter(i => i.status === 'processed').length,
      failed: this.items.filter(i => i.status === 'failed').length,
      escalated: this.items.filter(i => i.status === 'escalated').length
    };
  }
}

// ==============================================================================
// ORCHESTRATOR
// ==============================================================================

class CatalogOrchestrator {
  constructor(options = {}) {
    this.options = {
      autoEscalate: true,
      dryRun: false,
      verbose: false,
      ...options
    };
    
    this.queues = {
      supplier_discovery: new WorkQueue('supplier_discovery'),
      product_intake: new WorkQueue('product_intake'),
      product_matching: new WorkQueue('product_matching'),
      competitive_pricing: new WorkQueue('competitive_pricing'),
      daily_actions: new WorkQueue('daily_actions'),
      // Review queues
      intake_review: new WorkQueue('intake_review'),
      matching_review: new WorkQueue('matching_review'),
      pricing_review: new WorkQueue('pricing_review'),
      catalog_review: new WorkQueue('catalog_review'),
      supplier_review: new WorkQueue('supplier_review'),
      legal_review: new WorkQueue('legal_review')
    };
    
    this.session = {
      started_at: new Date().toISOString(),
      events: [],
      completed: [],
      blocked: [],
      escalated: []
    };
    
    this.agents = {};
    this._loadAgents();
  }

  _loadAgents() {
    for (const [key, config] of Object.entries(AGENTS)) {
      if (config.module) {
        try {
          this.agents[key] = require(config.module);
          this._log('info', `Loaded agent: ${config.name}`);
        } catch (err) {
          this._log('warn', `Could not load agent ${key}: ${err.message}`);
        }
      }
    }
  }

  _log(level, message, data = null) {
    const event = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    this.session.events.push(event);
    if (this.options.verbose) {
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // ROUTING
  // ---------------------------------------------------------------------------

  route(workItem) {
    const { type, data, source } = workItem;
    
    this._log('info', `Routing work item: ${type}`, { source });
    
    // Determine target agent
    let targetAgent = null;
    for (const [key, config] of Object.entries(AGENTS)) {
      if (config.triggers.includes(type)) {
        targetAgent = key;
        break;
      }
    }
    
    if (!targetAgent) {
      this._log('warn', `No agent found for work type: ${type}`);
      return { routed: false, reason: 'no_matching_agent' };
    }
    
    // Add to appropriate queue
    this.queues[targetAgent].add({
      type,
      data,
      source,
      target_agent: targetAgent
    });
    
    this._log('info', `Routed to ${AGENTS[targetAgent].name}`);
    
    return {
      routed: true,
      agent: targetAgent,
      queue: targetAgent
    };
  }

  // ---------------------------------------------------------------------------
  // WORK PROCESSING
  // ---------------------------------------------------------------------------

  async processIntake(item) {
    if (!this.agents.product_intake) {
      return { success: false, error: 'Product intake agent not loaded' };
    }
    
    const { normalizeProduct } = this.agents.product_intake;
    const result = normalizeProduct(item.data);
    
    // Check for escalation
    if (result.parse_confidence < ESCALATION_RULES.low_confidence_parse.threshold) {
      this._escalate(item, 'low_confidence_parse', result);
      return { success: true, escalated: true, result };
    }
    
    if (result.review_required) {
      this._escalate(item, 'low_confidence_parse', result);
      return { success: true, escalated: true, result };
    }
    
    // Route to matching
    this.route({
      type: 'new_product',
      data: result,
      source: 'intake_pipeline'
    });
    
    return { success: true, result };
  }

  async processMatching(item, catalog = []) {
    if (!this.agents.product_matching) {
      return { success: false, error: 'Product matching agent not loaded' };
    }
    
    const { matchProducts, determineMatchResult, determineAction } = this.agents.product_matching;
    
    // Find best match in catalog
    let bestMatch = null;
    let bestScore = 0;
    
    for (const catalogProduct of catalog) {
      const matchResult = matchProducts(item.data, catalogProduct);
      if (matchResult.confidence > bestScore) {
        bestScore = matchResult.confidence;
        bestMatch = { catalogProduct, ...matchResult };
      }
    }
    
    // Determine result
    const matchType = bestMatch 
      ? determineMatchResult(bestMatch.confidence, bestMatch.criticalConflicts, bestMatch.variantFields)
      : 'new_product';
    
    // Check for escalation
    if (matchType === 'review' || 
        (bestMatch && bestMatch.confidence < ESCALATION_RULES.ambiguous_match.threshold && bestMatch.confidence > 0.5)) {
      this._escalate(item, 'ambiguous_match', { matchType, bestMatch });
      return { success: true, escalated: true, matchType, bestMatch };
    }
    
    if (matchType === 'duplicate') {
      this._escalate(item, 'duplicate_suspected', { matchType, bestMatch });
      return { success: true, escalated: true, matchType, bestMatch };
    }
    
    return {
      success: true,
      matchType,
      bestMatch,
      action: bestMatch ? determineAction(matchType) : 'create_new_canonical'
    };
  }

  async processPricing(item) {
    if (!this.agents.competitive_pricing) {
      return { success: false, error: 'Competitive pricing agent not loaded' };
    }
    
    const { generateRecommendation } = this.agents.competitive_pricing;
    const result = generateRecommendation(item.data);
    
    // Check for escalation conditions
    const priceChangePercent = Math.abs(result.recommended_price - result.current_price) / result.current_price;
    
    if (priceChangePercent > ESCALATION_RULES.major_price_swing.threshold) {
      this._escalate(item, 'major_price_swing', result);
      return { success: true, escalated: true, result };
    }
    
    if (result.estimated_margin_percent_after_change < ESCALATION_RULES.thin_margin.threshold) {
      this._escalate(item, 'thin_margin', result);
      return { success: true, escalated: true, result };
    }
    
    if (result.review_reasons.length > 0) {
      this._escalate(item, 'major_price_swing', result);
      return { success: true, escalated: true, result };
    }
    
    return { success: true, result };
  }

  async processDailyGuard(products) {
    if (!this.agents.daily_price_guard) {
      return { success: false, error: 'Daily price guard agent not loaded' };
    }
    
    const { runDailyPriceGuard } = this.agents.daily_price_guard;
    const result = runDailyPriceGuard(products);
    
    // Route actions to appropriate queues
    for (const action of result.actions) {
      if (action.action_type === 'auto_publish') {
        this.queues.daily_actions.add({
          type: 'auto_publish',
          data: action,
          source: 'daily_guard'
        });
      } else {
        // Escalate to review
        const reviewQueue = action.action_type === 'pricing_review' ? 'pricing_review'
          : action.action_type === 'supplier_review' ? 'supplier_review'
          : action.action_type === 'catalog_review' ? 'catalog_review'
          : 'pricing_review';
        
        this.queues[reviewQueue].add({
          type: action.action_type,
          data: action,
          source: 'daily_guard',
          priority: action.priority
        });
        
        this.session.escalated.push({
          item_id: action.product_id,
          queue: reviewQueue,
          reason: action.reason,
          escalated_at: new Date().toISOString()
        });
      }
    }
    
    return { success: true, result };
  }

  // ---------------------------------------------------------------------------
  // ESCALATION
  // ---------------------------------------------------------------------------

  _escalate(item, ruleKey, context) {
    const rule = ESCALATION_RULES[ruleKey];
    if (!rule) {
      this._log('error', `Unknown escalation rule: ${ruleKey}`);
      return;
    }
    
    const escalation = {
      item_id: item.id,
      rule: ruleKey,
      reason: rule.reason,
      queue: rule.queue,
      context,
      escalated_at: new Date().toISOString()
    };
    
    this.queues[rule.queue].add({
      type: 'escalated_item',
      data: item.data,
      escalation_reason: rule.reason,
      original_queue: item.target_agent,
      context
    });
    
    if (item.id) {
      this.queues[item.target_agent]?.markEscalated(item.id, rule.reason);
    }
    
    this.session.escalated.push(escalation);
    this._log('warn', `Escalated: ${rule.reason}`, { queue: rule.queue });
  }

  // ---------------------------------------------------------------------------
  // BATCH PROCESSING
  // ---------------------------------------------------------------------------

  async processQueue(queueName, processor, options = {}) {
    const queue = this.queues[queueName];
    if (!queue) {
      return { success: false, error: `Queue not found: ${queueName}` };
    }
    
    const pending = queue.getPending();
    const limit = options.limit || pending.length;
    const results = [];
    
    for (let i = 0; i < Math.min(limit, pending.length); i++) {
      const item = pending[i];
      try {
        const result = await processor(item);
        queue.markProcessed(item.id, result);
        results.push({ id: item.id, success: true, result });
        this.session.completed.push({ id: item.id, queue: queueName });
      } catch (err) {
        queue.markFailed(item.id, err.message);
        results.push({ id: item.id, success: false, error: err.message });
        this._log('error', `Failed processing: ${err.message}`, { item_id: item.id });
      }
    }
    
    return { success: true, processed: results.length, results };
  }

  // ---------------------------------------------------------------------------
  // REPORTING
  // ---------------------------------------------------------------------------

  getStatus() {
    const queueStats = {};
    for (const [name, queue] of Object.entries(this.queues)) {
      queueStats[name] = queue.getStats();
    }
    
    const reviewQueues = ['intake_review', 'matching_review', 'pricing_review', 
                          'catalog_review', 'supplier_review', 'legal_review'];
    const totalReviewItems = reviewQueues.reduce((sum, q) => 
      sum + (queueStats[q]?.pending || 0), 0);
    
    return {
      session_started: this.session.started_at,
      agents_loaded: Object.keys(this.agents),
      queues: queueStats,
      summary: {
        total_events: this.session.events.length,
        completed: this.session.completed.length,
        escalated: this.session.escalated.length,
        blocked: this.session.blocked.length,
        pending_review: totalReviewItems
      }
    };
  }

  generateReport() {
    const status = this.getStatus();
    let report = '';
    
    report += '\n' + '═'.repeat(70) + '\n';
    report += '     CATALOG INTELLIGENCE ORCHESTRATOR - STATUS REPORT\n';
    report += '═'.repeat(70) + '\n\n';
    
    // Session info
    report += `Session Started: ${status.session_started}\n`;
    report += `Agents Loaded: ${status.agents_loaded.join(', ') || 'None'}\n\n`;
    
    // Summary
    report += 'SUMMARY\n';
    report += '-'.repeat(40) + '\n';
    report += `Total Events:        ${status.summary.total_events}\n`;
    report += `Completed:           ${status.summary.completed}\n`;
    report += `Escalated:           ${status.summary.escalated}\n`;
    report += `Blocked:             ${status.summary.blocked}\n`;
    report += `Pending Review:      ${status.summary.pending_review}\n\n`;
    
    // Work queues
    report += 'WORK QUEUES\n';
    report += '-'.repeat(40) + '\n';
    const workQueues = ['supplier_discovery', 'product_intake', 'product_matching', 
                        'competitive_pricing', 'daily_actions'];
    for (const q of workQueues) {
      const s = status.queues[q];
      report += `${q}: ${s.pending} pending, ${s.processed} done, ${s.failed} failed\n`;
    }
    report += '\n';
    
    // Review queues
    report += 'REVIEW QUEUES (require human action)\n';
    report += '-'.repeat(40) + '\n';
    const reviewQueues = ['intake_review', 'matching_review', 'pricing_review',
                          'catalog_review', 'supplier_review', 'legal_review'];
    for (const q of reviewQueues) {
      const s = status.queues[q];
      if (s.pending > 0) {
        report += `⚠️  ${q}: ${s.pending} items waiting\n`;
      }
    }
    
    // Escalations
    if (this.session.escalated.length > 0) {
      report += '\nRECENT ESCALATIONS\n';
      report += '-'.repeat(40) + '\n';
      this.session.escalated.slice(-10).forEach(e => {
        report += `[${e.queue}] ${e.reason}\n`;
      });
    }
    
    report += '\n' + '═'.repeat(70) + '\n';
    
    return report;
  }

  // ---------------------------------------------------------------------------
  // ORCHESTRATION COMMANDS
  // ---------------------------------------------------------------------------

  async runMorningCycle(products) {
    this._log('info', '=== Starting Morning Cycle ===');
    
    const results = {
      daily_guard: null,
      next_actions: [],
      review_items: [],
      blocked: []
    };
    
    // Run daily price guard
    if (products && products.length > 0) {
      results.daily_guard = await this.processDailyGuard(products);
    }
    
    // Compile next actions from auto-publish queue
    const autoPublish = this.queues.daily_actions.getPending();
    results.next_actions = autoPublish.map(item => ({
      action: 'auto_publish',
      product_id: item.data.product_id,
      sku: item.data.sku,
      change: item.data.recommended_change
    }));
    
    // Compile review items
    const reviewQueues = ['intake_review', 'matching_review', 'pricing_review',
                          'catalog_review', 'supplier_review', 'legal_review'];
    for (const qName of reviewQueues) {
      const pending = this.queues[qName].getPending();
      for (const item of pending) {
        results.review_items.push({
          queue: qName,
          type: item.type,
          reason: item.escalation_reason || 'Manual review required',
          priority: item.priority || 'medium',
          data: item.data
        });
      }
    }
    
    this._log('info', '=== Morning Cycle Complete ===');
    
    return results;
  }

  async runIntakePipeline(rawProducts, catalog = []) {
    this._log('info', '=== Starting Intake Pipeline ===');
    
    const results = {
      intake_processed: 0,
      matching_processed: 0,
      escalated: 0,
      new_products: 0,
      matched_products: 0,
      errors: []
    };
    
    // Step 1: Intake normalization
    for (const raw of rawProducts) {
      this.route({ type: 'raw_data', data: raw, source: 'intake_pipeline' });
    }
    
    // Process intake queue
    await this.processQueue('product_intake', async (item) => {
      const result = await this.processIntake(item);
      results.intake_processed++;
      if (result.escalated) results.escalated++;
      return result;
    });
    
    // Step 2: Match normalized products
    await this.processQueue('product_matching', async (item) => {
      const result = await this.processMatching(item, catalog);
      results.matching_processed++;
      if (result.escalated) {
        results.escalated++;
      } else if (result.matchType === 'new_product') {
        results.new_products++;
      } else {
        results.matched_products++;
      }
      return result;
    });
    
    this._log('info', '=== Intake Pipeline Complete ===');
    
    return results;
  }

  getNextActions() {
    const actions = [];
    
    // Auto-publishable actions
    const autoPublish = this.queues.daily_actions.getPending();
    autoPublish.forEach(item => {
      actions.push({
        type: 'auto_publish',
        ready: true,
        ...item.data
      });
    });
    
    return actions;
  }

  getReviewQueue() {
    const reviewQueues = ['intake_review', 'matching_review', 'pricing_review',
                          'catalog_review', 'supplier_review', 'legal_review'];
    const allItems = [];
    
    for (const qName of reviewQueues) {
      const pending = this.queues[qName].getPending();
      pending.forEach(item => {
        allItems.push({
          queue: qName,
          id: item.id,
          added_at: item.added_at,
          reason: item.escalation_reason,
          priority: item.priority || 'medium',
          data: item.data
        });
      });
    }
    
    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    allItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    return allItems;
  }

  getBlockedItems() {
    return this.session.blocked;
  }

  toJSON() {
    return {
      status: this.getStatus(),
      next_actions: this.getNextActions(),
      review_items: this.getReviewQueue(),
      blocked: this.getBlockedItems(),
      session: this.session
    };
  }
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  CatalogOrchestrator,
  AGENTS,
  ESCALATION_RULES,
  WorkQueue
};

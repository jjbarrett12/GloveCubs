/**
 * GloveCubs Daily Price Guard Agent
 * 
 * Monitors top products daily and generates actionable pricing/catalog queues.
 * Prioritizes high-traffic, high-revenue, and price-sensitive SKUs.
 */

const { generateRecommendation, DEFAULT_CONFIG } = require('./competitivePricing');

// ==============================================================================
// CONFIGURATION
// ==============================================================================

const GUARD_CONFIG = {
  // Priority thresholds
  high_traffic_threshold: 100,      // Views/day to be "high traffic"
  high_revenue_threshold: 500,      // $/day to be "high revenue"
  price_sensitive_margin: 0.25,     // Below 25% margin = price sensitive
  
  // Staleness thresholds
  stale_pricing_days: 7,            // No competitor data in 7 days = stale
  very_stale_pricing_days: 14,      // 14+ days = very stale
  stale_cost_days: 30,              // Cost not updated in 30 days
  
  // Change detection thresholds
  cost_change_threshold: 0.02,      // 2% cost change = significant
  competitor_change_threshold: 0.05, // 5% competitor change = significant
  
  // Auto-publish rules
  max_auto_publish_change: 0.05,    // Max 5% change for auto-publish
  min_auto_publish_confidence: 0.90, // 90%+ confidence required
  
  // Long-tail rules
  long_tail_traffic_threshold: 10,  // Below 10 views/day = long-tail
  long_tail_check_day: 'sunday'     // Only check long-tail on Sundays
};

// ==============================================================================
// PRIORITY SCORING
// ==============================================================================

function calculatePriority(product, metrics = {}) {
  let score = 0;
  let factors = [];
  
  // Traffic score (0-40 points)
  const traffic = metrics.daily_views || 0;
  if (traffic >= GUARD_CONFIG.high_traffic_threshold) {
    score += 40;
    factors.push('high_traffic');
  } else if (traffic >= 50) {
    score += 25;
    factors.push('medium_traffic');
  } else if (traffic >= GUARD_CONFIG.long_tail_traffic_threshold) {
    score += 10;
    factors.push('low_traffic');
  }
  
  // Revenue score (0-30 points)
  const revenue = metrics.daily_revenue || 0;
  if (revenue >= GUARD_CONFIG.high_revenue_threshold) {
    score += 30;
    factors.push('high_revenue');
  } else if (revenue >= 100) {
    score += 20;
    factors.push('medium_revenue');
  } else if (revenue > 0) {
    score += 5;
    factors.push('low_revenue');
  }
  
  // Price sensitivity score (0-20 points)
  const margin = metrics.current_margin_percent || 0.30;
  if (margin < GUARD_CONFIG.price_sensitive_margin) {
    score += 20;
    factors.push('price_sensitive');
  } else if (margin < 0.30) {
    score += 10;
    factors.push('moderate_margin');
  }
  
  // Recency of last sale (0-10 points)
  const daysSinceLastSale = metrics.days_since_last_sale || 999;
  if (daysSinceLastSale <= 1) {
    score += 10;
    factors.push('recent_sale');
  } else if (daysSinceLastSale <= 7) {
    score += 5;
  }
  
  // Determine priority level
  let priority = 'low';
  if (score >= 60) priority = 'high';
  else if (score >= 30) priority = 'medium';
  
  return { score, priority, factors };
}

function isLongTailProduct(product, metrics = {}) {
  const traffic = metrics.daily_views || 0;
  return traffic < GUARD_CONFIG.long_tail_traffic_threshold;
}

function shouldCheckLongTail() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()];
  return today === GUARD_CONFIG.long_tail_check_day;
}

// ==============================================================================
// CHANGE DETECTION
// ==============================================================================

function detectCostChange(product, previousCost, currentCost) {
  if (!previousCost || !currentCost) return null;
  
  const change = (currentCost - previousCost) / previousCost;
  const changePercent = Math.abs(change);
  
  if (changePercent >= GUARD_CONFIG.cost_change_threshold) {
    return {
      type: change > 0 ? 'cost_increase' : 'cost_decrease',
      previous: previousCost,
      current: currentCost,
      change_percent: Math.round(change * 1000) / 10,
      significant: true
    };
  }
  
  return null;
}

function detectCompetitorPriceChange(product, previousLowest, currentLowest) {
  if (!previousLowest || !currentLowest) return null;
  
  const change = (currentLowest - previousLowest) / previousLowest;
  const changePercent = Math.abs(change);
  
  if (changePercent >= GUARD_CONFIG.competitor_change_threshold) {
    return {
      type: change > 0 ? 'competitor_increase' : 'competitor_decrease',
      previous: previousLowest,
      current: currentLowest,
      change_percent: Math.round(change * 1000) / 10,
      significant: true
    };
  }
  
  return null;
}

function detectStaleness(product, lastPricingUpdate, lastCostUpdate) {
  const now = new Date();
  const issues = [];
  
  if (lastPricingUpdate) {
    const pricingAge = Math.floor((now - new Date(lastPricingUpdate)) / (1000 * 60 * 60 * 24));
    if (pricingAge >= GUARD_CONFIG.very_stale_pricing_days) {
      issues.push({ type: 'very_stale_pricing', days: pricingAge });
    } else if (pricingAge >= GUARD_CONFIG.stale_pricing_days) {
      issues.push({ type: 'stale_pricing', days: pricingAge });
    }
  } else {
    issues.push({ type: 'no_pricing_data', days: null });
  }
  
  if (lastCostUpdate) {
    const costAge = Math.floor((now - new Date(lastCostUpdate)) / (1000 * 60 * 60 * 24));
    if (costAge >= GUARD_CONFIG.stale_cost_days) {
      issues.push({ type: 'stale_cost', days: costAge });
    }
  }
  
  return issues;
}

// ==============================================================================
// ACTION GENERATION
// ==============================================================================

function generateAction(product, pricingRec, changeDetection, staleness, priorityInfo) {
  const actions = [];
  
  // Handle pricing recommendation
  if (pricingRec) {
    const priceChange = pricingRec.recommended_price !== pricingRec.current_price;
    const changePercent = Math.abs(pricingRec.recommended_price - pricingRec.current_price) / pricingRec.current_price;
    
    if (priceChange) {
      const canAutoPublish = 
        pricingRec.auto_publish_eligible &&
        changePercent <= GUARD_CONFIG.max_auto_publish_change &&
        pricingRec.confidence >= GUARD_CONFIG.min_auto_publish_confidence &&
        pricingRec.review_reasons.length === 0;
      
      actions.push({
        product_id: product.id,
        sku: product.sku,
        title: product.name || product.canonical_title,
        action_type: canAutoPublish ? 'auto_publish' : 'pricing_review',
        recommended_change: `${pricingRec.action}: $${pricingRec.current_price.toFixed(2)} → $${pricingRec.recommended_price.toFixed(2)}`,
        reason: pricingRec.reason,
        priority: priorityInfo.priority,
        details: {
          current_price: pricingRec.current_price,
          recommended_price: pricingRec.recommended_price,
          margin_after: pricingRec.estimated_margin_percent_after_change,
          confidence: pricingRec.confidence,
          review_reasons: pricingRec.review_reasons
        }
      });
    }
  }
  
  // Handle cost changes
  if (changeDetection?.cost) {
    const costChange = changeDetection.cost;
    actions.push({
      product_id: product.id,
      sku: product.sku,
      title: product.name || product.canonical_title,
      action_type: 'supplier_review',
      recommended_change: `Cost ${costChange.type}: $${costChange.previous.toFixed(2)} → $${costChange.current.toFixed(2)} (${costChange.change_percent}%)`,
      reason: costChange.type === 'cost_increase' 
        ? 'Supplier cost increased - review pricing and margins'
        : 'Supplier cost decreased - opportunity to improve margin or competitiveness',
      priority: costChange.type === 'cost_increase' ? 'high' : 'medium',
      details: costChange
    });
  }
  
  // Handle competitor price changes
  if (changeDetection?.competitor) {
    const compChange = changeDetection.competitor;
    if (compChange.type === 'competitor_decrease') {
      actions.push({
        product_id: product.id,
        sku: product.sku,
        title: product.name || product.canonical_title,
        action_type: 'pricing_review',
        recommended_change: `Competitor price dropped: $${compChange.previous.toFixed(2)} → $${compChange.current.toFixed(2)} (${compChange.change_percent}%)`,
        reason: 'Competitors lowered prices - review competitive positioning',
        priority: priorityInfo.priority,
        details: compChange
      });
    }
  }
  
  // Handle staleness
  if (staleness && staleness.length > 0) {
    for (const issue of staleness) {
      if (issue.type === 'no_pricing_data' || issue.type === 'very_stale_pricing') {
        actions.push({
          product_id: product.id,
          sku: product.sku,
          title: product.name || product.canonical_title,
          action_type: 'catalog_review',
          recommended_change: 'Refresh competitor pricing data',
          reason: issue.days 
            ? `No competitor pricing update in ${issue.days} days`
            : 'No competitor pricing data available',
          priority: priorityInfo.priority === 'high' ? 'high' : 'medium',
          details: issue
        });
      } else if (issue.type === 'stale_cost') {
        actions.push({
          product_id: product.id,
          sku: product.sku,
          title: product.name || product.canonical_title,
          action_type: 'supplier_review',
          recommended_change: 'Verify current supplier cost',
          reason: `Cost not updated in ${issue.days} days`,
          priority: 'low',
          details: issue
        });
      }
    }
  }
  
  return actions;
}

// ==============================================================================
// DAILY RUN
// ==============================================================================

function runDailyPriceGuard(products, options = {}) {
  const runDate = new Date().toISOString().split('T')[0];
  const checkLongTail = options.includeLongTail || shouldCheckLongTail();
  
  const summary = {
    products_checked: 0,
    products_skipped: 0,
    cost_changes_detected: 0,
    competitor_price_changes_detected: 0,
    overpriced_detected: 0,
    underpriced_detected: 0,
    stale_pricing_detected: 0,
    auto_publish_candidates: 0,
    manual_review_count: 0
  };
  
  const allActions = [];
  
  for (const product of products) {
    const metrics = product.metrics || {};
    
    // Check if we should process this product today
    const isLongTail = isLongTailProduct(product, metrics);
    if (isLongTail && !checkLongTail) {
      summary.products_skipped++;
      continue;
    }
    
    summary.products_checked++;
    
    // Calculate priority
    const priorityInfo = calculatePriority(product, metrics);
    
    // Detect changes
    const changeDetection = {};
    
    // Cost change detection
    if (product.previous_cost && product.current_cost) {
      const costChange = detectCostChange(product, product.previous_cost, product.current_cost);
      if (costChange) {
        changeDetection.cost = costChange;
        summary.cost_changes_detected++;
      }
    }
    
    // Competitor price change detection
    if (product.previous_lowest_competitor && product.current_lowest_competitor) {
      const compChange = detectCompetitorPriceChange(
        product, 
        product.previous_lowest_competitor, 
        product.current_lowest_competitor
      );
      if (compChange) {
        changeDetection.competitor = compChange;
        summary.competitor_price_changes_detected++;
      }
    }
    
    // Staleness detection
    const staleness = detectStaleness(
      product,
      product.last_pricing_update,
      product.last_cost_update
    );
    if (staleness.length > 0) {
      summary.stale_pricing_detected++;
    }
    
    // Generate pricing recommendation if we have competitor data
    let pricingRec = null;
    if (product.competitor_offers && product.competitor_offers.length > 0) {
      pricingRec = generateRecommendation({
        canonical_product_id: product.id || product.sku,
        current_price: product.current_price || product.price,
        current_cost: product.current_cost || product.cost,
        map_price: product.map_price,
        shipping_cost_estimate: product.shipping_cost || 0,
        competitor_offers: product.competitor_offers
      });
      
      // Track overpriced/underpriced
      if (pricingRec.action === 'lower') {
        summary.overpriced_detected++;
      } else if (pricingRec.action === 'raise') {
        summary.underpriced_detected++;
      }
    }
    
    // Generate actions
    const actions = generateAction(product, pricingRec, changeDetection, staleness, priorityInfo);
    
    // Count action types
    for (const action of actions) {
      if (action.action_type === 'auto_publish') {
        summary.auto_publish_candidates++;
      } else {
        summary.manual_review_count++;
      }
      allActions.push(action);
    }
  }
  
  // Sort actions by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  allActions.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    // Within same priority, auto_publish first
    if (a.action_type === 'auto_publish' && b.action_type !== 'auto_publish') return -1;
    if (b.action_type === 'auto_publish' && a.action_type !== 'auto_publish') return 1;
    return 0;
  });
  
  return {
    run_date: runDate,
    run_timestamp: new Date().toISOString(),
    config: {
      included_long_tail: checkLongTail,
      ...GUARD_CONFIG
    },
    summary,
    actions: allActions
  };
}

// ==============================================================================
// REPORTING
// ==============================================================================

function generateDailyReport(results) {
  let report = '';
  report += '\n' + '═'.repeat(70) + '\n';
  report += `     DAILY PRICE GUARD REPORT - ${results.run_date}\n`;
  report += '═'.repeat(70) + '\n\n';
  
  // Summary
  report += 'SUMMARY\n';
  report += '-'.repeat(40) + '\n';
  report += `Products Checked:              ${results.summary.products_checked}\n`;
  report += `Products Skipped (long-tail):  ${results.summary.products_skipped}\n`;
  report += `Cost Changes Detected:         ${results.summary.cost_changes_detected}\n`;
  report += `Competitor Price Changes:      ${results.summary.competitor_price_changes_detected}\n`;
  report += `Overpriced Products:           ${results.summary.overpriced_detected}\n`;
  report += `Underpriced Products:          ${results.summary.underpriced_detected}\n`;
  report += `Stale Pricing Data:            ${results.summary.stale_pricing_detected}\n`;
  report += '\n';
  
  // Action counts
  report += 'ACTION QUEUE\n';
  report += '-'.repeat(40) + '\n';
  report += `Auto-Publish Candidates:       ${results.summary.auto_publish_candidates}\n`;
  report += `Manual Review Required:        ${results.summary.manual_review_count}\n`;
  report += '\n';
  
  // Group actions by type
  const byType = {};
  for (const action of results.actions) {
    if (!byType[action.action_type]) byType[action.action_type] = [];
    byType[action.action_type].push(action);
  }
  
  // Auto-publish section
  if (byType.auto_publish && byType.auto_publish.length > 0) {
    report += '\n✅ AUTO-PUBLISH READY\n';
    report += '-'.repeat(70) + '\n';
    byType.auto_publish.slice(0, 10).forEach(a => {
      report += `[${a.priority.toUpperCase()}] ${a.sku}\n`;
      report += `  ${a.recommended_change}\n`;
    });
    if (byType.auto_publish.length > 10) {
      report += `  ... and ${byType.auto_publish.length - 10} more\n`;
    }
  }
  
  // Pricing review section
  if (byType.pricing_review && byType.pricing_review.length > 0) {
    report += '\n💰 PRICING REVIEW NEEDED\n';
    report += '-'.repeat(70) + '\n';
    byType.pricing_review.slice(0, 10).forEach(a => {
      report += `[${a.priority.toUpperCase()}] ${a.sku}\n`;
      report += `  ${a.recommended_change}\n`;
      report += `  Reason: ${a.reason}\n`;
    });
    if (byType.pricing_review.length > 10) {
      report += `  ... and ${byType.pricing_review.length - 10} more\n`;
    }
  }
  
  // Supplier review section
  if (byType.supplier_review && byType.supplier_review.length > 0) {
    report += '\n📦 SUPPLIER REVIEW NEEDED\n';
    report += '-'.repeat(70) + '\n';
    byType.supplier_review.slice(0, 10).forEach(a => {
      report += `[${a.priority.toUpperCase()}] ${a.sku}\n`;
      report += `  ${a.recommended_change}\n`;
      report += `  Reason: ${a.reason}\n`;
    });
    if (byType.supplier_review.length > 10) {
      report += `  ... and ${byType.supplier_review.length - 10} more\n`;
    }
  }
  
  // Catalog review section
  if (byType.catalog_review && byType.catalog_review.length > 0) {
    report += '\n📋 CATALOG REVIEW NEEDED\n';
    report += '-'.repeat(70) + '\n';
    byType.catalog_review.slice(0, 10).forEach(a => {
      report += `[${a.priority.toUpperCase()}] ${a.sku}\n`;
      report += `  ${a.recommended_change}\n`;
      report += `  Reason: ${a.reason}\n`;
    });
    if (byType.catalog_review.length > 10) {
      report += `  ... and ${byType.catalog_review.length - 10} more\n`;
    }
  }
  
  report += '\n' + '═'.repeat(70) + '\n';
  report += `Report generated: ${results.run_timestamp}\n`;
  
  return report;
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  runDailyPriceGuard,
  generateDailyReport,
  calculatePriority,
  detectCostChange,
  detectCompetitorPriceChange,
  detectStaleness,
  isLongTailProduct,
  shouldCheckLongTail,
  GUARD_CONFIG
};

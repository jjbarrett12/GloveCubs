#!/usr/bin/env node
/**
 * GloveCubs Catalog Intelligence Orchestrator CLI
 * 
 * Coordinates all catalog agents and manages work queues.
 * 
 * Usage:
 *   node scripts/orchestrator.js status
 *   node scripts/orchestrator.js morning-cycle --demo
 *   node scripts/orchestrator.js intake --file products.json
 *   node scripts/orchestrator.js review-queue
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { CatalogOrchestrator, AGENTS, ESCALATION_RULES } = require('../lib/catalogOrchestrator');

// ==============================================================================
// DEMO DATA
// ==============================================================================

function generateDemoProducts() {
  return [
    {
      id: 'prod-001',
      sku: 'GLV-NIT-BLK-100',
      name: 'ProShield Black Nitrile Exam Gloves',
      current_price: 14.99,
      current_cost: 9.50,
      previous_cost: 9.50,
      current_lowest_competitor: 13.99,
      previous_lowest_competitor: 14.50,
      last_pricing_update: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      last_cost_update: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: { daily_views: 250, daily_revenue: 750, current_margin_percent: 0.37 },
      competitor_offers: [
        { source_name: 'Amazon', visible_price: 13.99, shipping_estimate: 0, offer_confidence: 0.95, same_brand: true, same_pack: true }
      ]
    },
    {
      id: 'prod-002',
      sku: 'GLV-VIN-CLR-100',
      name: 'SafeTouch Clear Vinyl Gloves',
      current_price: 8.99,
      current_cost: 5.75,
      previous_cost: 5.25, // Cost increase!
      current_lowest_competitor: 8.49,
      previous_lowest_competitor: 8.49,
      last_pricing_update: new Date().toISOString(),
      last_cost_update: new Date().toISOString(),
      metrics: { daily_views: 180, daily_revenue: 450, current_margin_percent: 0.36 },
      competitor_offers: [
        { source_name: 'Amazon', visible_price: 8.49, shipping_estimate: 0, offer_confidence: 0.92, same_brand: true, same_pack: true }
      ]
    },
    {
      id: 'prod-003',
      sku: 'GLV-NIT-6MIL-50',
      name: 'HeavyDuty Black Nitrile 6 Mil',
      current_price: 16.99,
      current_cost: 10.50,
      previous_cost: 10.50,
      map_price: 14.99,
      current_lowest_competitor: 21.99, // Underpriced!
      previous_lowest_competitor: 21.99,
      last_pricing_update: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: { daily_views: 120, daily_revenue: 340, current_margin_percent: 0.38 },
      competitor_offers: [
        { source_name: 'Grainger', visible_price: 21.99, shipping_estimate: 0, offer_confidence: 0.95, same_brand: true, same_pack: true }
      ]
    }
  ];
}

function generateDemoRawProducts() {
  return [
    {
      raw_name: 'BLK NITRILE GLOVES 5MIL 100CT MED',
      supplier: 'ACME Supply',
      supplier_sku: 'ACM-12345',
      cost: 8.50,
      brand: 'TuffGrip'
    },
    {
      raw_name: 'LATEX EXAM GLV NAT 100/BX',
      supplier: 'MedSource',
      supplier_sku: 'MS-LAT-100',
      cost: 7.25,
      brand: 'MediGrade',
      notes: 'Powder free'
    },
    {
      raw_name: 'vinyl food service gloves clear',
      supplier: 'FoodPro',
      supplier_sku: 'FP-VIN-500',
      cost: 6.00,
      pack_qty: 500
    }
  ];
}

// ==============================================================================
// COMMANDS
// ==============================================================================

function printHelp() {
  console.log(`
GloveCubs Catalog Intelligence Orchestrator

Usage:
  node scripts/orchestrator.js <command> [options]

Commands:
  status              Show orchestrator status and queue stats
  morning-cycle       Run daily morning cycle (price guard)
  intake              Process raw product intake
  review-queue        Show items pending human review
  next-actions        Show auto-publishable actions
  agents              List available agents
  rules               List escalation rules

Options:
  --demo              Use demo data
  --file <path>       Load data from file
  --output <path>     Save results to file
  --verbose, -v       Verbose output
  --help, -h          Show this help

Examples:
  node scripts/orchestrator.js status
  node scripts/orchestrator.js morning-cycle --demo
  node scripts/orchestrator.js intake --file raw-products.json
  node scripts/orchestrator.js review-queue
`);
}

function printAgents() {
  console.log('\nAvailable Agents\n' + '═'.repeat(50));
  for (const [key, agent] of Object.entries(AGENTS)) {
    console.log(`\n${agent.name} (${key})`);
    console.log(`  ${agent.description}`);
    console.log(`  Triggers: ${agent.triggers.join(', ')}`);
    console.log(`  Module: ${agent.module || 'Not implemented'}`);
  }
  console.log('');
}

function printRules() {
  console.log('\nEscalation Rules\n' + '═'.repeat(50));
  for (const [key, rule] of Object.entries(ESCALATION_RULES)) {
    console.log(`\n${key}`);
    console.log(`  Reason: ${rule.reason}`);
    console.log(`  Queue: ${rule.queue}`);
    if (rule.threshold !== undefined) {
      console.log(`  Threshold: ${rule.threshold}`);
    }
  }
  console.log('');
}

async function runStatus(orchestrator) {
  console.log(orchestrator.generateReport());
}

async function runMorningCycle(orchestrator, options) {
  let products;
  
  if (options.demo) {
    console.log('Running morning cycle with demo data...\n');
    products = generateDemoProducts();
  } else if (options.file) {
    const content = fs.readFileSync(options.file, 'utf8');
    products = JSON.parse(content);
  } else {
    console.error('Error: --demo or --file required');
    process.exit(1);
  }
  
  const results = await orchestrator.runMorningCycle(products);
  
  console.log('\n' + '═'.repeat(70));
  console.log('     MORNING CYCLE RESULTS');
  console.log('═'.repeat(70) + '\n');
  
  // Daily guard summary
  if (results.daily_guard?.result) {
    const dg = results.daily_guard.result;
    console.log('Daily Price Guard Summary:');
    console.log(`  Products Checked: ${dg.summary.products_checked}`);
    console.log(`  Cost Changes: ${dg.summary.cost_changes_detected}`);
    console.log(`  Overpriced: ${dg.summary.overpriced_detected}`);
    console.log(`  Underpriced: ${dg.summary.underpriced_detected}`);
    console.log(`  Stale Data: ${dg.summary.stale_pricing_detected}`);
    console.log('');
  }
  
  // Next actions
  console.log('NEXT ACTIONS (Ready for Auto-Publish):');
  console.log('-'.repeat(40));
  if (results.next_actions.length === 0) {
    console.log('  None - all changes require review\n');
  } else {
    results.next_actions.forEach(a => {
      console.log(`  ✅ ${a.sku}: ${a.change}`);
    });
    console.log('');
  }
  
  // Review items
  console.log('REVIEW ITEMS (Require Human Decision):');
  console.log('-'.repeat(40));
  if (results.review_items.length === 0) {
    console.log('  None\n');
  } else {
    const byQueue = {};
    results.review_items.forEach(r => {
      if (!byQueue[r.queue]) byQueue[r.queue] = [];
      byQueue[r.queue].push(r);
    });
    
    for (const [queue, items] of Object.entries(byQueue)) {
      console.log(`\n  ${queue.toUpperCase()}:`);
      items.forEach(item => {
        const sku = item.data?.sku || item.data?.product_id || 'Unknown';
        console.log(`    [${item.priority.toUpperCase()}] ${sku} - ${item.reason}`);
      });
    }
    console.log('');
  }
  
  // Blocked items
  if (results.blocked.length > 0) {
    console.log('BLOCKED ITEMS:');
    console.log('-'.repeat(40));
    results.blocked.forEach(b => {
      console.log(`  🚫 ${b.reason}`);
    });
    console.log('');
  }
  
  console.log('═'.repeat(70) + '\n');
  
  // Full report
  console.log(orchestrator.generateReport());
  
  if (options.output) {
    const output = orchestrator.toJSON();
    output.morning_cycle_results = results;
    fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
    console.log(`Results saved to: ${options.output}`);
  }
}

async function runIntake(orchestrator, options) {
  let rawProducts;
  
  if (options.demo) {
    console.log('Running intake pipeline with demo data...\n');
    rawProducts = generateDemoRawProducts();
  } else if (options.file) {
    const content = fs.readFileSync(options.file, 'utf8');
    rawProducts = JSON.parse(content);
    if (!Array.isArray(rawProducts)) rawProducts = [rawProducts];
  } else {
    console.error('Error: --demo or --file required');
    process.exit(1);
  }
  
  // Load existing catalog for matching
  let catalog = [];
  try {
    // In production, would load from database
    catalog = generateDemoProducts(); // Demo catalog
  } catch (err) {
    console.log('Note: No existing catalog found, treating all as new products');
  }
  
  const results = await orchestrator.runIntakePipeline(rawProducts, catalog);
  
  console.log('\n' + '═'.repeat(70));
  console.log('     INTAKE PIPELINE RESULTS');
  console.log('═'.repeat(70) + '\n');
  
  console.log(`Products Processed:    ${results.intake_processed}`);
  console.log(`Matching Processed:    ${results.matching_processed}`);
  console.log(`New Products:          ${results.new_products}`);
  console.log(`Matched to Existing:   ${results.matched_products}`);
  console.log(`Escalated to Review:   ${results.escalated}`);
  
  if (results.errors.length > 0) {
    console.log(`\nErrors: ${results.errors.length}`);
    results.errors.forEach(e => console.log(`  - ${e}`));
  }
  
  console.log('\n' + orchestrator.generateReport());
  
  if (options.output) {
    const output = orchestrator.toJSON();
    output.intake_results = results;
    fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
    console.log(`Results saved to: ${options.output}`);
  }
}

async function runReviewQueue(orchestrator) {
  const items = orchestrator.getReviewQueue();
  
  console.log('\n' + '═'.repeat(70));
  console.log('     REVIEW QUEUE');
  console.log('═'.repeat(70) + '\n');
  
  if (items.length === 0) {
    console.log('No items pending review.\n');
    return;
  }
  
  console.log(`Total Items: ${items.length}\n`);
  
  // Group by queue
  const byQueue = {};
  items.forEach(item => {
    if (!byQueue[item.queue]) byQueue[item.queue] = [];
    byQueue[item.queue].push(item);
  });
  
  for (const [queue, queueItems] of Object.entries(byQueue)) {
    console.log(`\n${queue.toUpperCase()} (${queueItems.length} items)`);
    console.log('-'.repeat(50));
    
    queueItems.forEach(item => {
      const priorityIcon = item.priority === 'high' ? '🔴' 
        : item.priority === 'medium' ? '🟡' : '🟢';
      console.log(`${priorityIcon} [${item.id}]`);
      console.log(`   Reason: ${item.reason || 'Manual review required'}`);
      if (item.data?.sku) console.log(`   SKU: ${item.data.sku}`);
      if (item.data?.recommended_change) console.log(`   Change: ${item.data.recommended_change}`);
    });
  }
  
  console.log('\n' + '═'.repeat(70) + '\n');
}

async function runNextActions(orchestrator) {
  const actions = orchestrator.getNextActions();
  
  console.log('\n' + '═'.repeat(70));
  console.log('     NEXT ACTIONS (Auto-Publish Ready)');
  console.log('═'.repeat(70) + '\n');
  
  if (actions.length === 0) {
    console.log('No actions ready for auto-publish.\n');
    console.log('All pending changes require human review.\n');
    return;
  }
  
  console.log(`Ready to publish: ${actions.length} actions\n`);
  
  actions.forEach((action, i) => {
    console.log(`${i + 1}. ${action.sku || action.product_id}`);
    console.log(`   ${action.recommended_change || action.change}`);
    console.log(`   Reason: ${action.reason || 'Safe automated change'}`);
    console.log('');
  });
  
  console.log('═'.repeat(70) + '\n');
}

// ==============================================================================
// MAIN
// ==============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Parse options
  const options = {
    demo: args.includes('--demo'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    file: null,
    output: null
  };
  
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    options.file = args[fileIdx + 1];
  }
  
  const outputIdx = args.indexOf('--output');
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    options.output = args[outputIdx + 1];
  }
  
  // Handle help and info commands
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  
  if (command === 'agents') {
    printAgents();
    return;
  }
  
  if (command === 'rules') {
    printRules();
    return;
  }
  
  // Initialize orchestrator
  const orchestrator = new CatalogOrchestrator({
    verbose: options.verbose
  });
  
  // Execute command
  switch (command) {
    case 'status':
      await runStatus(orchestrator);
      break;
      
    case 'morning-cycle':
      await runMorningCycle(orchestrator, options);
      break;
      
    case 'intake':
      await runIntake(orchestrator, options);
      break;
      
    case 'review-queue':
      await runReviewQueue(orchestrator);
      break;
      
    case 'next-actions':
      await runNextActions(orchestrator);
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});

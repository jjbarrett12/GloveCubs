#!/usr/bin/env node
/**
 * GloveCubs Admin Review Assistant CLI
 * 
 * Reviews flagged items and explains why each needs human approval.
 * 
 * Usage:
 *   node scripts/admin-review.js --demo
 *   node scripts/admin-review.js --file review-items.json
 *   node scripts/admin-review.js --from-orchestrator
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  processReviewQueue,
  generateReviewReport,
  generateCompactReport
} = require('../lib/adminReviewAssistant');

// ==============================================================================
// DEMO DATA
// ==============================================================================

function generateDemoReviewItems() {
  return [
    // Critical: MAP conflict
    {
      id: 'review-001',
      queue: 'legal_review',
      priority: 'high',
      type: 'map_conflict',
      escalation_reason: 'Potential MAP pricing violation',
      data: {
        sku: 'GLV-MED-EXAM-100',
        title: 'MediGrade Blue Nitrile Exam Gloves, 100/Box',
        current_price: 14.99,
        recommended_price: 11.99,
        map_price: 12.99
      }
    },
    
    // High: Cost increase
    {
      id: 'review-002',
      queue: 'supplier_review',
      priority: 'high',
      type: 'supplier_review',
      escalation_reason: 'Supplier cost increased - review pricing and margins',
      data: {
        sku: 'GLV-VIN-CLR-100',
        title: 'SafeTouch Clear Vinyl Gloves, 100/Box',
        current_price: 8.99,
        current_cost: 5.75,
        type: 'cost_increase',
        details: {
          previous: 5.25,
          current: 5.75,
          change_percent: 9.5
        }
      },
      details: {
        type: 'cost_increase',
        previous: 5.25,
        current: 5.75,
        change_percent: 9.5
      }
    },
    
    // High: Major price swing (underpriced)
    {
      id: 'review-003',
      queue: 'pricing_review',
      priority: 'high',
      type: 'pricing_review',
      escalation_reason: 'Priced 29% below competitors - opportunity to improve margin',
      data: {
        sku: 'GLV-NIT-6MIL-50',
        title: 'HeavyDuty Black Nitrile 6 Mil, 50/Box',
        current_price: 16.99,
        recommended_price: 18.69,
        lowest_trusted_comparable_price: 21.99,
        estimated_margin_percent_after_change: 0.44
      }
    },
    
    // Medium: Duplicate product
    {
      id: 'review-004',
      queue: 'catalog_review',
      priority: 'medium',
      type: 'duplicate_suspected',
      escalation_reason: 'Suspected duplicate product',
      data: {
        sku: 'GLV-NIT-BLK-100-DUP',
        title: 'Black Nitrile Gloves 100ct',
        existing_sku: 'GLV-NIT-BLK-100',
        matched_fields: ['brand', 'material', 'color', 'units_per_box'],
        conflicting_fields: ['supplier_sku']
      },
      context: {
        matched_fields: ['brand', 'material', 'color', 'units_per_box'],
        conflicting_fields: ['supplier_sku']
      }
    },
    
    // Medium: Low confidence parse
    {
      id: 'review-005',
      queue: 'intake_review',
      priority: 'medium',
      type: 'low_confidence_parse',
      escalation_reason: 'Parsed product confidence below threshold',
      data: {
        sku: 'NEW-IMPORT-001',
        title: 'BLK NIT GLV 5M 100CT MED ??',
        parse_confidence: 0.72,
        supplier: 'Unknown Supplier Co'
      },
      context: {
        parse_confidence: 0.72
      }
    },
    
    // Medium: Stale pricing
    {
      id: 'review-006',
      queue: 'pricing_review',
      priority: 'medium',
      type: 'stale_pricing_data',
      escalation_reason: 'No competitor pricing update in 12 days',
      data: {
        sku: 'GLV-LAT-NAT-100',
        title: 'MediGrade Natural Latex Exam Gloves, 100/Box',
        current_price: 12.49
      },
      details: {
        days: 12
      }
    },
    
    // Medium: Low margin risk
    {
      id: 'review-007',
      queue: 'pricing_review',
      priority: 'high',
      type: 'thin_margin',
      escalation_reason: 'Margin below minimum threshold',
      data: {
        sku: 'GLV-POLY-500',
        title: 'FoodHandler Clear Poly Gloves, 500/Box',
        current_price: 9.99,
        current_cost: 8.50,
        recommended_price: 9.49,
        estimated_margin_percent_after_change: 0.10
      },
      context: {
        estimated_margin_percent_after_change: 0.10
      }
    },
    
    // Medium: Missing case pack
    {
      id: 'review-008',
      queue: 'catalog_review',
      priority: 'medium',
      type: 'missing_case_pack',
      escalation_reason: 'Missing pack quantity data',
      data: {
        sku: 'GLV-NEW-IMPORT',
        title: 'Industrial Blue Nitrile Gloves',
        units_per_box: null,
        boxes_per_case: null
      }
    },
    
    // Low: Cost decrease (opportunity)
    {
      id: 'review-009',
      queue: 'supplier_review',
      priority: 'low',
      type: 'cost_decrease',
      escalation_reason: 'Supplier cost decreased',
      data: {
        sku: 'GLV-VIN-FOOD-100',
        title: 'FoodSafe Clear Vinyl Gloves, 100/Box',
        current_cost: 4.50
      },
      details: {
        type: 'cost_decrease',
        previous: 5.00,
        current: 4.50,
        change_percent: 10
      }
    }
  ];
}

// ==============================================================================
// MAIN
// ==============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  let inputPath = null;
  let outputPath = null;
  let runDemo = false;
  let compact = false;
  let fromOrchestrator = false;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
      case '-f':
        inputPath = args[++i];
        break;
      case '--output':
      case '-o':
        outputPath = args[++i];
        break;
      case '--demo':
        runDemo = true;
        break;
      case '--compact':
      case '-c':
        compact = true;
        break;
      case '--from-orchestrator':
        fromOrchestrator = true;
        break;
      case '--help':
      case '-h':
        console.log(`
GloveCubs Admin Review Assistant

Reviews flagged items and explains why each needs human approval.

Usage:
  node scripts/admin-review.js --demo
  node scripts/admin-review.js --file review-items.json
  node scripts/admin-review.js --from-orchestrator

Options:
  --demo                  Run with sample flagged items
  --file, -f <path>       Load review items from JSON file
  --from-orchestrator     Pull from orchestrator review queues
  --output, -o <path>     Save analysis to file
  --compact, -c           Show compact summary
  --help, -h              Show this help

Issue Categories:
  - Supplier legitimacy
  - Missing MOQ / case pack
  - Duplicate or near-duplicate product
  - Conflicting glove attributes
  - Suspicious competitor pricing
  - Low margin risk
  - MAP conflict
  - Stale or unreliable data
`);
        process.exit(0);
    }
  }
  
  // Load items
  let items;
  
  if (runDemo) {
    console.log('Loading demo review items...\n');
    items = generateDemoReviewItems();
  } else if (inputPath) {
    const content = fs.readFileSync(inputPath, 'utf8');
    items = JSON.parse(content);
    if (!Array.isArray(items)) items = [items];
  } else if (fromOrchestrator) {
    // Would integrate with orchestrator in production
    console.log('Note: Orchestrator integration - using demo data\n');
    items = generateDemoReviewItems();
  } else {
    console.error('Error: --demo, --file, or --from-orchestrator required');
    process.exit(1);
  }
  
  // Process queue
  const results = processReviewQueue(items);
  
  // Generate report
  const report = compact 
    ? generateCompactReport(results)
    : generateReviewReport(results);
  
  console.log(report);
  
  // Save output
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\nAnalysis saved to: ${outputPath}`);
  }
  
  // Exit code based on critical/high items
  const urgent = (results.by_severity.critical || 0) + (results.by_severity.high || 0);
  if (urgent > 0) {
    console.log(`\n⚠️  ${urgent} urgent items require immediate attention\n`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

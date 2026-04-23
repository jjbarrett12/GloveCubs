#!/usr/bin/env node
/**
 * GloveCubs QA Supervisor CLI (Advisory Mode)
 * 
 * Audits agent outputs and reports issues. Does NOT persist to database.
 * For production use with persistence, call the TypeScript service instead.
 * 
 * Usage:
 *   node scripts/qa-audit.js --demo
 *   node scripts/qa-audit.js --input audit-data.json
 *   node scripts/qa-audit.js --output report.json --demo
 * 
 * For production (with persistence):
 *   Use storefront/src/lib/qa/service.ts via job queue or API
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { runFullAudit, QA_CONFIG } = require('../lib/qaSupervisor');

// ==============================================================================
// DEMO DATA
// ==============================================================================

function generateDemoData() {
  return {
    suppliers: [
      {
        id: 'sup-001',
        name: '  Acme Glove Supply  ',
        type: 'wholsaler',
        website: 'https://acmegloves.com',
        contact_email: 'sales@acmegloves.com',
        trust_score: 0.85
      },
      {
        id: 'sup-002',
        name: 'Amazon Marketplace Seller',
        type: 'retailer',
        website: 'https://amazon.com/seller/xyz',
        trust_score: 0.40
      },
      {
        id: 'sup-003',
        name: 'MedSupply Direct',
        type: 'distributor',
        website: 'https://medsupplydirect.com',
        phone: '1-800-555-1234',
        trust_score: 0.78
      }
    ],
    
    products: [
      {
        id: 'prod-001',
        sku: 'GLV-NIT-BLK-100',
        brand: 'ProShield',
        material: 'nitril',
        color: 'blk',
        grade: 'exam',
        units_per_box: 100,
        boxes_per_case: 10,
        total_units_per_case: 1200, // Wrong math!
        thickness_mil: 5,
        canonical_title: 'ProShield Nitrile Gloves 100ct',
        parse_confidence: 0.95
      },
      {
        id: 'prod-002',
        sku: 'GLV-VIN-CLR-100',
        brand: '', // Missing!
        material: 'vinyl',
        color: 'clear',
        units_per_box: 100,
        boxes_per_case: 10,
        total_units_per_case: 1000,
        parse_confidence: 0.92 // Inflated!
      },
      {
        id: 'prod-003',
        sku: 'GLV-LAT-NAT-100',
        brand: 'MediGrade',
        material: 'latex',
        color: 'natural',
        grade: 'examination',
        units_per_box: 100,
        boxes_per_case: 10,
        thickness_mil: 25, // Suspicious!
        parse_confidence: 0.88
      }
    ],
    
    matches: [
      {
        incoming_supplier_product_id: 'sup-prod-001',
        match_result: 'exact_match',
        canonical_product_id: 'prod-001',
        match_confidence: 0.95,
        matched_fields: ['brand', 'material', 'color'],
        conflicting_fields: ['units_per_box'], // Critical conflict!
        reasoning: 'High similarity score'
      },
      {
        incoming_supplier_product_id: 'sup-prod-002',
        match_result: 'likely_match',
        canonical_product_id: 'prod-002',
        match_confidence: 0.72,
        matched_fields: ['material', 'color'],
        conflicting_fields: ['brand', 'grade'],
        reasoning: 'Partial match'
      },
      {
        incoming_supplier_product_id: 'sup-prod-003',
        match_result: 'exact_match',
        canonical_product_id: 'prod-003',
        match_confidence: 0.98,
        matched_fields: ['brand', 'material', 'color', 'grade', 'size', 'upc'],
        conflicting_fields: [],
        reasoning: 'UPC match'
      }
    ],
    
    pricing: [
      {
        canonical_product_id: 'prod-001',
        current_price: 14.99,
        recommended_price: 13.49,
        current_cost: 9.50,
        map_price: 12.99,
        estimated_margin_percent_after_change: 0.30,
        confidence: 0.92,
        auto_publish_eligible: true,
        review_reasons: [],
        competitor_offers: [
          { source_name: 'Amazon', visible_price: 13.49, shipping_estimate: 0, offer_confidence: 0.88, same_pack: true }
        ]
      },
      {
        canonical_product_id: 'prod-002',
        current_price: 8.99,
        recommended_price: 7.49,
        current_cost: 7.00,
        estimated_margin_percent_after_change: 0.07, // Below margin floor!
        confidence: 0.85,
        auto_publish_eligible: true,
        competitor_offers: [
          { source_name: 'Uline', visible_price: 7.49, offer_confidence: 0.60, same_pack: false }
        ]
      },
      {
        canonical_product_id: 'prod-003',
        current_price: 12.99,
        recommended_price: 15.99, // 23% swing!
        current_cost: 8.00,
        estimated_margin_percent_after_change: 0.50,
        confidence: 0.90,
        auto_publish_eligible: true,
        competitor_offers: [
          { source_name: 'Grainger', visible_price: 15.99, shipping_estimate: 0, offer_confidence: 0.92, same_pack: true }
        ]
      }
    ],
    
    actions: [
      {
        product_id: 'prod-001',
        sku: 'GLV-NIT-BLK-100',
        action_type: 'auto_publish',
        recommended_change: 'lower: $14.99 → $13.49',
        reason: 'Competitor price lower',
        priority: 'high',
        details: { confidence: 0.92, current_price: 14.99, recommended_price: 13.49 }
      },
      {
        product_id: 'prod-001',
        sku: 'GLV-NIT-BLK-100',
        action_type: 'auto_publish', // Duplicate!
        recommended_change: 'lower: $14.99 → $13.49',
        reason: 'Competitor price lower'
      },
      {
        product_id: 'prod-003',
        sku: 'GLV-LAT-NAT-100',
        action_type: 'pricing_review',
        recommended_change: 'raise: $12.99 → $15.99',
        priority: 'medium'
        // Missing reason!
      }
    ]
  };
}

// ==============================================================================
// REPORT GENERATION
// ==============================================================================

function generateReport(result) {
  let report = '';
  
  report += '\n' + '═'.repeat(70) + '\n';
  report += '     QA SUPERVISOR AUDIT REPORT\n';
  report += '═'.repeat(70) + '\n\n';
  
  // Summary
  report += 'SUMMARY\n';
  report += '-'.repeat(40) + '\n';
  report += `Records Audited:        ${result.summary.records_audited}\n`;
  report += `Issues Found:           ${result.summary.issues_found}\n`;
  report += `Auto-Fixes Applied:     ${result.summary.safe_auto_fixes_applied}\n`;
  report += `Sent to Review:         ${result.summary.items_sent_to_review}\n`;
  report += `Blocked:                ${result.summary.items_blocked}\n`;
  report += `Systemic Issues:        ${result.summary.systemic_issues_found}\n\n`;
  
  // Module results
  report += 'MODULE RESULTS\n';
  report += '-'.repeat(40) + '\n';
  for (const mod of result.module_results) {
    report += `\n${mod.module.toUpperCase()}\n`;
    report += `  Checked: ${mod.records_checked}, Issues: ${mod.issues_found}, `;
    report += `Fixes: ${mod.fixes_applied}, Review: ${mod.review_items_created}, Blocked: ${mod.blocked_items}\n`;
    if (mod.notes && mod.notes.length > 0) {
      mod.notes.forEach(n => report += `  Note: ${n}\n`);
    }
  }
  report += '\n';
  
  // Blocked actions (most critical)
  if (result.blocked_actions.length > 0) {
    report += '🛑 BLOCKED ACTIONS\n';
    report += '-'.repeat(40) + '\n';
    result.blocked_actions.forEach(b => {
      report += `[${b.priority.toUpperCase()}] ${b.record_id}\n`;
      report += `  ${b.reason_blocked}\n\n`;
    });
  }
  
  // Fixes applied
  if (result.fixes.length > 0) {
    report += '🔧 FIXES APPLIED\n';
    report += '-'.repeat(40) + '\n';
    result.fixes.slice(0, 10).forEach(f => {
      report += `${f.record_type}/${f.record_id}: ${f.issue}\n`;
      report += `  → ${f.fix_applied}\n`;
      if (f.audit_note) report += `  Note: ${f.audit_note}\n`;
      report += '\n';
    });
    if (result.fixes.length > 10) {
      report += `... and ${result.fixes.length - 10} more fixes\n\n`;
    }
  }
  
  // Review queue
  if (result.review_queue.length > 0) {
    report += '⚠️ REVIEW QUEUE\n';
    report += '-'.repeat(40) + '\n';
    
    const highPriority = result.review_queue.filter(r => r.priority === 'high');
    const mediumPriority = result.review_queue.filter(r => r.priority === 'medium');
    const lowPriority = result.review_queue.filter(r => r.priority === 'low');
    
    if (highPriority.length > 0) {
      report += '\nHIGH PRIORITY:\n';
      highPriority.forEach(r => {
        report += `🔴 ${r.record_id}: ${r.issue_summary}\n`;
        report += `   → ${r.recommended_action}\n`;
      });
    }
    
    if (mediumPriority.length > 0) {
      report += '\nMEDIUM PRIORITY:\n';
      mediumPriority.forEach(r => {
        report += `🟡 ${r.record_id}: ${r.issue_summary}\n`;
        report += `   → ${r.recommended_action}\n`;
      });
    }
    
    if (lowPriority.length > 0) {
      report += '\nLOW PRIORITY:\n';
      lowPriority.forEach(r => {
        report += `🟢 ${r.record_id}: ${r.issue_summary}\n`;
      });
    }
    report += '\n';
  }
  
  // Systemic issues
  if (result.systemic_issues.length > 0) {
    report += '🔍 SYSTEMIC ISSUES\n';
    report += '-'.repeat(40) + '\n';
    result.systemic_issues.forEach(s => {
      report += `Issue: ${s.issue}\n`;
      report += `Impact: ${s.impact}\n`;
      report += `Fix: ${s.recommended_fix}\n\n`;
    });
  }
  
  // Self-audit
  if (result.self_audit) {
    report += '🔒 SELF-AUDIT\n';
    report += '-'.repeat(40) + '\n';
    report += `Passed: ${result.self_audit.passed ? '✅ Yes' : '❌ No'}\n`;
    report += `Guessed anywhere: ${result.self_audit.guessed_anywhere ? '⚠️ Yes' : '✅ No'}\n`;
    report += `Allowed unsafe automation: ${result.self_audit.allowed_unsafe_automation ? '⚠️ Yes' : '✅ No'}\n`;
    
    if (result.self_audit.validation_notes.length > 0) {
      report += '\nValidation notes:\n';
      result.self_audit.validation_notes.forEach(n => {
        report += `  - ${n}\n`;
      });
    }
    report += '\n';
  }
  
  // Next steps
  if (result.next_steps.length > 0) {
    report += '📋 NEXT STEPS\n';
    report += '-'.repeat(40) + '\n';
    result.next_steps.forEach((step, i) => {
      report += `${i + 1}. ${step}\n`;
    });
    report += '\n';
  }
  
  report += '═'.repeat(70) + '\n';
  report += `Audit completed: ${result.run_timestamp}\n`;
  
  return report;
}

// ==============================================================================
// MAIN
// ==============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  let inputPath = null;
  let outputPath = null;
  let runDemo = false;
  let verbose = false;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
      case '-i':
        inputPath = args[++i];
        break;
      case '--output':
      case '-o':
        outputPath = args[++i];
        break;
      case '--demo':
        runDemo = true;
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--config':
        console.log('Current QA Configuration:\n');
        console.log(JSON.stringify(QA_CONFIG, null, 2));
        process.exit(0);
      case '--help':
      case '-h':
        console.log(`
GloveCubs QA Supervisor (CLI - Advisory Mode)

Audits agent outputs and reports issues. Does NOT persist to database.
For production use, call the TypeScript service instead.

Usage:
  node scripts/qa-audit.js --demo
  node scripts/qa-audit.js --input audit-data.json
  node scripts/qa-audit.js --output report.json --demo

Options:
  --demo              Run with sample data
  --input, -i <file>  Load audit data from JSON file
  --output, -o <file> Save JSON results to file
  --verbose, -v       Show detailed JSON output
  --config            Show QA configuration
  --help, -h          Show this help

Limitations of CLI mode:
  - Does NOT persist to database (advisory only)
  - Does NOT apply fixes to source tables
  - Does NOT create review queue items
  - For production: use storefront/src/lib/qa/service.ts

Audit Modules:
  - Supplier Discovery: Legitimacy, duplicates, classification
  - Product Intake: Fields, math, normalization, confidence
  - Product Matching: False matches, conflicts, confidence
  - Competitive Pricing: Margin, MAP, comparability, safety
  - Daily Price Guard: Duplicates, safety, missing reasons
`);
        process.exit(0);
    }
  }
  
  // Load data
  let data;
  if (runDemo) {
    console.log('Running QA audit with demo data...\n');
    data = generateDemoData();
  } else if (inputPath) {
    const content = fs.readFileSync(inputPath, 'utf8');
    data = JSON.parse(content);
  } else {
    console.error('Error: --demo or --input required');
    process.exit(1);
  }
  
  // Run audit
  const result = runFullAudit(data);
  
  // Generate and display report
  const report = generateReport(result);
  console.log(report);
  
  // Verbose output
  if (verbose) {
    console.log('\nFull Audit Result:\n');
    console.log(JSON.stringify(result, null, 2));
  }
  
  // Save output
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);
  }
  
  // Exit code based on blocked items
  if (result.summary.items_blocked > 0) {
    console.log(`\n🛑 ${result.summary.items_blocked} items blocked - require immediate attention`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

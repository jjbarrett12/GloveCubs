#!/usr/bin/env node
/**
 * GloveCubs Daily Price Guard CLI
 * 
 * Runs daily monitoring of products and generates action queues.
 * 
 * Usage:
 *   node scripts/daily-price-guard.js --demo
 *   node scripts/daily-price-guard.js --from-db
 *   node scripts/daily-price-guard.js --input products.json --output actions.json
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  runDailyPriceGuard,
  generateDailyReport
} = require('../lib/dailyPriceGuard');

// ==============================================================================
// DEMO DATA
// ==============================================================================

function generateDemoProducts() {
  return [
    // High traffic, high revenue - priority product
    {
      id: 'prod-001',
      sku: 'GLV-NIT-EXAM-BLU-100',
      name: 'ProShield Blue Nitrile Exam Gloves, 100/Box',
      current_price: 14.99,
      current_cost: 9.50,
      previous_cost: 9.50, // No change
      map_price: 12.99,
      current_lowest_competitor: 13.99,
      previous_lowest_competitor: 14.50, // Competitor dropped price!
      last_pricing_update: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      last_cost_update: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: {
        daily_views: 250,
        daily_revenue: 750,
        current_margin_percent: 0.37,
        days_since_last_sale: 0
      },
      competitor_offers: [
        { source_name: 'Amazon.com', visible_price: 13.99, shipping_estimate: 0, offer_confidence: 0.95, same_brand: true, same_pack: true },
        { source_name: 'Uline.com', visible_price: 15.50, shipping_estimate: 0, offer_confidence: 0.90, same_brand: true, same_pack: true }
      ]
    },
    // Cost increase detected
    {
      id: 'prod-002',
      sku: 'GLV-VIN-CLR-100',
      name: 'SafeTouch Clear Vinyl Gloves, 100/Box',
      current_price: 8.99,
      current_cost: 5.75, // Increased from 5.25
      previous_cost: 5.25,
      map_price: 0,
      current_lowest_competitor: 8.49,
      previous_lowest_competitor: 8.49,
      last_pricing_update: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      last_cost_update: new Date().toISOString(),
      metrics: {
        daily_views: 180,
        daily_revenue: 450,
        current_margin_percent: 0.36,
        days_since_last_sale: 0
      },
      competitor_offers: [
        { source_name: 'Amazon.com', visible_price: 8.49, shipping_estimate: 0, offer_confidence: 0.92, same_brand: true, same_pack: true }
      ]
    },
    // Underpriced - opportunity to raise
    {
      id: 'prod-003',
      sku: 'GLV-NIT-BLK-6MIL',
      name: 'HeavyDuty Black Nitrile 6 Mil, 50/Box',
      current_price: 16.99,
      current_cost: 10.50,
      previous_cost: 10.50,
      map_price: 14.99,
      current_lowest_competitor: 21.99,
      previous_lowest_competitor: 21.99,
      last_pricing_update: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      last_cost_update: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: {
        daily_views: 120,
        daily_revenue: 340,
        current_margin_percent: 0.38,
        days_since_last_sale: 1
      },
      competitor_offers: [
        { source_name: 'Grainger.com', visible_price: 21.99, shipping_estimate: 0, offer_confidence: 0.95, same_brand: true, same_pack: true },
        { source_name: 'Zoro.com', visible_price: 22.50, shipping_estimate: 0, offer_confidence: 0.88, same_brand: true, same_pack: true }
      ]
    },
    // Stale pricing data
    {
      id: 'prod-004',
      sku: 'GLV-LAT-NAT-100',
      name: 'MediGrade Natural Latex Exam Gloves, 100/Box',
      current_price: 12.49,
      current_cost: 7.80,
      previous_cost: 7.80,
      map_price: 0,
      current_lowest_competitor: null,
      previous_lowest_competitor: 11.99,
      last_pricing_update: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 days - stale!
      last_cost_update: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: {
        daily_views: 85,
        daily_revenue: 200,
        current_margin_percent: 0.38,
        days_since_last_sale: 2
      },
      competitor_offers: [] // No recent data
    },
    // Small price adjustment - auto-publish candidate
    {
      id: 'prod-005',
      sku: 'GLV-NIT-FOOD-PUR',
      name: 'FoodSafe Purple Nitrile Gloves, 100/Box',
      current_price: 12.99,
      current_cost: 8.00,
      previous_cost: 8.00,
      map_price: 11.99,
      current_lowest_competitor: 12.49,
      previous_lowest_competitor: 12.49,
      last_pricing_update: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      last_cost_update: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: {
        daily_views: 95,
        daily_revenue: 260,
        current_margin_percent: 0.38,
        days_since_last_sale: 1
      },
      competitor_offers: [
        { source_name: 'Webstaurantstore.com', visible_price: 12.49, shipping_estimate: 0, offer_confidence: 0.92, same_brand: true, same_pack: true }
      ]
    },
    // Low traffic - long tail (may be skipped)
    {
      id: 'prod-006',
      sku: 'GLV-CHEMO-8MIL',
      name: 'BioShield Chemo-Rated Nitrile 8 Mil, 50/Box',
      current_price: 32.99,
      current_cost: 24.00,
      previous_cost: 24.00,
      map_price: 29.99,
      current_lowest_competitor: 34.99,
      previous_lowest_competitor: 34.99,
      last_pricing_update: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      last_cost_update: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      metrics: {
        daily_views: 8, // Long tail!
        daily_revenue: 33,
        current_margin_percent: 0.27,
        days_since_last_sale: 5
      },
      competitor_offers: [
        { source_name: 'Medline.com', visible_price: 34.99, shipping_estimate: 0, offer_confidence: 0.95, same_brand: true, same_pack: true }
      ]
    },
    // Price sensitive - thin margins
    {
      id: 'prod-007',
      sku: 'GLV-POLY-CLR-500',
      name: 'FoodHandler Clear Poly Gloves, 500/Box',
      current_price: 9.99,
      current_cost: 7.50,
      previous_cost: 7.25, // Small cost increase
      map_price: 0,
      current_lowest_competitor: 9.49,
      previous_lowest_competitor: 9.49,
      last_pricing_update: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      last_cost_update: new Date().toISOString(),
      metrics: {
        daily_views: 150,
        daily_revenue: 300,
        current_margin_percent: 0.25, // Price sensitive!
        days_since_last_sale: 0
      },
      competitor_offers: [
        { source_name: 'Amazon.com', visible_price: 9.49, shipping_estimate: 0, offer_confidence: 0.90, same_brand: true, same_pack: true }
      ]
    },
    // Very stale cost data
    {
      id: 'prod-008',
      sku: 'GLV-CUT-A4-12PK',
      name: 'CutShield A4 Cut-Resistant Gloves, 12/Pack',
      current_price: 89.99,
      current_cost: 62.00,
      previous_cost: 62.00,
      map_price: 79.99,
      current_lowest_competitor: 94.50,
      previous_lowest_competitor: 94.50,
      last_pricing_update: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      last_cost_update: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days - very stale!
      metrics: {
        daily_views: 45,
        daily_revenue: 180,
        current_margin_percent: 0.31,
        days_since_last_sale: 3
      },
      competitor_offers: [
        { source_name: 'Fastenal.com', visible_price: 94.50, shipping_estimate: 0, offer_confidence: 0.92, same_brand: true, same_pack: true }
      ]
    }
  ];
}

// ==============================================================================
// DATABASE LOADER
// ==============================================================================

async function loadProductsFromDB() {
  const { createClient } = require('@supabase/supabase-js');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: Supabase credentials required for --from-db');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data, error } = await supabase.from('products').select('*');
  
  if (error) {
    console.error('Error loading products:', error.message);
    process.exit(1);
  }
  
  // Transform to price guard format
  // In production, you'd join with pricing history, competitor data, and metrics tables
  return data.map(p => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    current_price: p.price || 0,
    current_cost: p.cost || 0,
    previous_cost: p.cost || 0, // Would come from history
    map_price: 0,
    current_lowest_competitor: null, // Would come from competitor data
    previous_lowest_competitor: null,
    last_pricing_update: null,
    last_cost_update: p.updated_at,
    metrics: {
      daily_views: Math.floor(Math.random() * 100), // Simulated
      daily_revenue: Math.floor(Math.random() * 500),
      current_margin_percent: p.cost && p.price ? (p.price - p.cost) / p.price : 0.3,
      days_since_last_sale: Math.floor(Math.random() * 7)
    },
    competitor_offers: [] // Would come from competitor monitoring
  }));
}

// ==============================================================================
// MAIN
// ==============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  let inputPath = null;
  let outputPath = null;
  let runDemo = false;
  let fromDB = false;
  let includeLongTail = false;
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
      case '--from-db':
        fromDB = true;
        break;
      case '--include-long-tail':
        includeLongTail = true;
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
GloveCubs Daily Price Guard CLI

Usage:
  node scripts/daily-price-guard.js --demo
  node scripts/daily-price-guard.js --from-db
  node scripts/daily-price-guard.js --input products.json --output actions.json

Options:
  --demo                  Run with sample demo data
  --from-db               Load products from Supabase
  --input, -i <file>      Input products file (JSON)
  --output, -o <file>     Output actions to file (JSON)
  --include-long-tail     Include long-tail products (normally weekly)
  --verbose, -v           Show detailed output
  --help, -h              Show this help

The Daily Price Guard:
  1. Reviews top priority SKUs
  2. Detects cost changes from suppliers
  3. Detects competitor price changes
  4. Identifies over/underpriced products
  5. Flags stale pricing data
  6. Creates prioritized action queues
`);
        process.exit(0);
    }
  }
  
  // Load products
  let products;
  if (runDemo) {
    console.log('Running Daily Price Guard with demo data...\n');
    products = generateDemoProducts();
  } else if (fromDB) {
    console.log('Loading products from database...');
    products = await loadProductsFromDB();
  } else if (inputPath) {
    const content = fs.readFileSync(inputPath, 'utf8');
    products = JSON.parse(content);
    if (!Array.isArray(products)) products = [products];
  } else {
    console.error('Error: --demo, --from-db, or --input required');
    process.exit(1);
  }
  
  console.log(`Monitoring ${products.length} products...\n`);
  
  // Run the price guard
  const results = runDailyPriceGuard(products, { includeLongTail });
  
  // Generate and display report
  const report = generateDailyReport(results);
  console.log(report);
  
  // Verbose output
  if (verbose && results.actions.length > 0) {
    console.log('\nDetailed Action Queue:\n');
    console.log(JSON.stringify(results.actions, null, 2));
  }
  
  // Save output
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);
  }
  
  // Exit code based on manual review count
  if (results.summary.manual_review_count > 0) {
    console.log(`\n⚠️  ${results.summary.manual_review_count} items require manual review`);
  }
  if (results.summary.auto_publish_candidates > 0) {
    console.log(`\n✅ ${results.summary.auto_publish_candidates} items ready for auto-publish`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

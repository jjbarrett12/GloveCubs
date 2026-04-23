#!/usr/bin/env node
/**
 * GloveCubs Competitive Pricing Analysis CLI
 * 
 * Usage:
 *   node scripts/analyze-pricing.js --input pricing-data.json
 *   node scripts/analyze-pricing.js --product SKU-123 --competitors comp.json
 *   node scripts/analyze-pricing.js --demo
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  generateRecommendation,
  processPricingBatch,
  generatePricingReport,
  createPricingInput,
  DEFAULT_CONFIG
} = require('../lib/competitivePricing');

// ==============================================================================
// DEMO DATA
// ==============================================================================

function generateDemoData() {
  return [
    {
      canonical_product_id: 'GLV-NIT-EXAM-BLU-100',
      current_price: 14.99,
      current_cost: 9.50,
      map_price: 12.99,
      minimum_margin_percent: 0.22,
      minimum_margin_dollars: 1.50,
      shipping_cost_estimate: 0.50,
      competitor_offers: [
        {
          source_name: 'Amazon.com',
          source_url: 'https://amazon.com/dp/B123456',
          visible_price: 13.99,
          shipping_estimate: 0,
          availability: 'in_stock',
          offer_confidence: 0.95,
          same_brand: true,
          same_pack: true,
          notes: 'Prime eligible'
        },
        {
          source_name: 'Uline.com',
          source_url: 'https://uline.com/product/s-12345',
          visible_price: 14.50,
          shipping_estimate: 3.50,
          availability: 'in_stock',
          offer_confidence: 0.90,
          same_brand: true,
          same_pack: true,
          notes: ''
        },
        {
          source_name: 'Grainger.com',
          source_url: 'https://grainger.com/product/123',
          visible_price: 15.99,
          shipping_estimate: 0,
          availability: 'in_stock',
          offer_confidence: 0.92,
          same_brand: true,
          same_pack: true,
          notes: ''
        }
      ]
    },
    {
      canonical_product_id: 'GLV-VIN-CLR-100',
      current_price: 8.99,
      current_cost: 5.25,
      map_price: 0,
      minimum_margin_percent: 0.22,
      minimum_margin_dollars: 1.50,
      shipping_cost_estimate: 0.50,
      competitor_offers: [
        {
          source_name: 'Amazon.com',
          visible_price: 7.49,
          shipping_estimate: 0,
          availability: 'in_stock',
          offer_confidence: 0.90,
          same_brand: true,
          same_pack: true
        },
        {
          source_name: 'Webstaurantstore.com',
          visible_price: 6.99,
          shipping_estimate: 4.50,
          availability: 'in_stock',
          offer_confidence: 0.85,
          same_brand: true,
          same_pack: true
        }
      ]
    },
    {
      canonical_product_id: 'GLV-NIT-BLK-6MIL-50',
      current_price: 18.99,
      current_cost: 11.00,
      map_price: 16.99,
      minimum_margin_percent: 0.22,
      minimum_margin_dollars: 2.00,
      shipping_cost_estimate: 0.75,
      competitor_offers: [
        {
          source_name: 'Grainger.com',
          visible_price: 22.50,
          shipping_estimate: 0,
          availability: 'in_stock',
          offer_confidence: 0.95,
          same_brand: true,
          same_pack: true
        },
        {
          source_name: 'Zoro.com',
          visible_price: 21.99,
          shipping_estimate: 0,
          availability: 'in_stock',
          offer_confidence: 0.88,
          same_brand: true,
          same_pack: true
        }
      ]
    },
    {
      canonical_product_id: 'GLV-LAT-NAT-100',
      current_price: 12.49,
      current_cost: 7.80,
      map_price: 0,
      minimum_margin_percent: 0.22,
      minimum_margin_dollars: 1.50,
      shipping_cost_estimate: 0.50,
      competitor_offers: [
        {
          source_name: 'eBay.com',
          visible_price: 6.99,
          shipping_estimate: 2.00,
          availability: 'unknown',
          offer_confidence: 0.40,
          same_brand: false,
          same_pack: true,
          notes: 'Untrusted seller'
        },
        {
          source_name: 'Amazon.com',
          visible_price: 11.99,
          shipping_estimate: 0,
          availability: 'in_stock',
          offer_confidence: 0.88,
          same_brand: true,
          same_pack: true
        }
      ]
    },
    {
      canonical_product_id: 'GLV-CUT-A4-12PK',
      current_price: 89.99,
      current_cost: 62.00,
      map_price: 79.99,
      minimum_margin_percent: 0.22,
      minimum_margin_dollars: 15.00,
      shipping_cost_estimate: 2.50,
      competitor_offers: [
        {
          source_name: 'Fastenal.com',
          visible_price: 94.50,
          shipping_estimate: 0,
          availability: 'in_stock',
          offer_confidence: 0.92,
          same_brand: true,
          same_pack: true
        }
      ]
    },
    {
      canonical_product_id: 'GLV-CHEMO-8MIL-50',
      current_price: 32.99,
      current_cost: 24.00,
      map_price: 29.99,
      minimum_margin_percent: 0.25,
      minimum_margin_dollars: 5.00,
      shipping_cost_estimate: 1.00,
      competitor_offers: [
        {
          source_name: 'Medline.com',
          visible_price: 34.99,
          shipping_estimate: 0,
          availability: 'in_stock',
          offer_confidence: 0.95,
          same_brand: true,
          same_pack: true
        },
        {
          source_name: 'Amazon.com',
          visible_price: 31.49,
          shipping_estimate: 0,
          availability: 'low_stock',
          offer_confidence: 0.85,
          same_brand: true,
          same_pack: true
        }
      ]
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
      case '--help':
      case '-h':
        console.log(`
GloveCubs Competitive Pricing Analysis CLI

Usage:
  node scripts/analyze-pricing.js --input <file>
  node scripts/analyze-pricing.js --demo

Options:
  --input, -i <file>    Input pricing data file (JSON)
  --output, -o <file>   Output results to file (JSON)
  --demo                Run with sample demo data
  --verbose, -v         Show detailed output
  --help, -h            Show this help

Input Format (JSON):
{
  "canonical_product_id": "SKU-123",
  "current_price": 14.99,
  "current_cost": 9.50,
  "map_price": 12.99,
  "competitor_offers": [
    {
      "source_name": "Amazon.com",
      "visible_price": 13.99,
      "shipping_estimate": 0,
      "same_brand": true,
      "same_pack": true
    }
  ]
}

Examples:
  node scripts/analyze-pricing.js --demo
  node scripts/analyze-pricing.js -i pricing-data.json -o recommendations.json
`);
        process.exit(0);
    }
  }
  
  // Load pricing data
  let pricingData;
  if (runDemo) {
    console.log('Running with demo data...\n');
    pricingData = generateDemoData();
  } else if (inputPath) {
    const content = fs.readFileSync(inputPath, 'utf8');
    const parsed = JSON.parse(content);
    pricingData = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    console.error('Error: --input or --demo required');
    process.exit(1);
  }
  
  console.log(`Analyzing ${pricingData.length} products...\n`);
  
  // Process batch
  const results = processPricingBatch(pricingData);
  
  // Generate report
  const report = generatePricingReport(results);
  console.log(report);
  
  // Detailed output
  if (verbose) {
    console.log('\nDetailed Recommendations:\n');
    console.log(JSON.stringify(results.recommendations, null, 2));
  }
  
  // Save output
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Results written to: ${outputPath}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

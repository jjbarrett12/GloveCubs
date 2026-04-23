#!/usr/bin/env node
/**
 * GloveCubs Product Matching CLI
 * 
 * Usage:
 *   node scripts/match-products.js --incoming data/new-products.json --catalog data/catalog.json
 *   node scripts/match-products.js --incoming new.json --from-db
 *   node scripts/match-products.js --find-duplicates --from-db
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  matchProductBatch,
  generateMatchingReport,
  findDuplicatesInCatalog,
  matchSingleProduct
} = require('../lib/productMatching');

// ==============================================================================
// DATABASE HELPERS
// ==============================================================================

async function loadCatalogFromDB() {
  const { createClient } = require('@supabase/supabase-js');
  
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --from-db');
    process.exit(1);
  }
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data, error } = await supabase.from('products').select('*');
  
  if (error) {
    console.error('Error loading catalog:', error.message);
    process.exit(1);
  }
  
  // Transform to matching format
  return data.map(p => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    manufacturer: p.brand,
    manufacturer_part_number: p.sku, // Using SKU as MPN if no separate field
    upc: null,
    material: p.material?.toLowerCase(),
    color: p.color?.toLowerCase(),
    grade: inferGrade(p),
    thickness_mil: parseThickness(p.thickness),
    size: null,
    units_per_box: p.pack_qty,
    boxes_per_case: p.case_qty ? Math.round(p.case_qty / (p.pack_qty || 100)) : null,
    total_units_per_case: p.case_qty,
    powder_free: p.powder?.toLowerCase().includes('free'),
    latex_free: p.material?.toLowerCase() !== 'latex'
  }));
}

function inferGrade(product) {
  const text = [product.name, product.description, product.category, product.subcategory]
    .filter(Boolean).join(' ').toLowerCase();
  
  if (text.includes('exam') || text.includes('medical')) return 'exam';
  if (text.includes('industrial') || text.includes('work')) return 'industrial';
  if (text.includes('food')) return 'foodservice';
  return 'unknown';
}

function parseThickness(thickness) {
  if (!thickness) return null;
  const match = String(thickness).match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

// ==============================================================================
// FILE HELPERS
// ==============================================================================

function loadJSON(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  return Array.isArray(data) ? data : (data.products || [data]);
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i]?.trim() || null;
    });
    return obj;
  });
}

function loadFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.csv')) {
    return parseCSV(content);
  }
  return loadJSON(filePath);
}

// ==============================================================================
// OUTPUT FORMATTERS
// ==============================================================================

function formatMatchesTable(matches) {
  console.log('\nMatching Results:\n');
  console.log('SKU'.padEnd(20) + 'Result'.padEnd(15) + 'Conf'.padEnd(8) + 'Action'.padEnd(20) + 'Matched To');
  console.log('-'.repeat(90));
  
  for (const match of matches) {
    const sku = String(match.incoming_supplier_product_id || '').slice(0, 18).padEnd(20);
    const result = match.match_result.padEnd(15);
    const conf = String(match.match_confidence).padEnd(8);
    const action = match.recommended_action.slice(0, 18).padEnd(20);
    const matchedTo = match.canonical_product_id || '-';
    
    console.log(sku + result + conf + action + matchedTo);
  }
}

function formatDuplicatesReport(duplicates) {
  console.log('\n' + '═'.repeat(60));
  console.log('     DUPLICATE DETECTION REPORT');
  console.log('═'.repeat(60) + '\n');
  
  console.log(`Found ${duplicates.length} duplicate groups\n`);
  
  for (let i = 0; i < duplicates.length; i++) {
    const group = duplicates[i];
    console.log(`Group ${i + 1}: ${group.length} products`);
    console.log('-'.repeat(40));
    
    for (const item of group) {
      const p = item.product;
      const conf = item.confidence ? ` (${Math.round(item.confidence * 100)}% match)` : ' (primary)';
      console.log(`  [${p.sku || p.id}] ${p.name?.slice(0, 40) || 'unnamed'}${conf}`);
      
      if (item.conflicts && item.conflicts.length > 0) {
        item.conflicts.forEach(c => {
          console.log(`     ⚠ ${c.field}: ${c.incoming} vs ${c.catalog}`);
        });
      }
    }
    console.log('');
  }
}

// ==============================================================================
// MAIN
// ==============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  let incomingPath = null;
  let catalogPath = null;
  let outputPath = null;
  let fromDB = false;
  let findDuplicates = false;
  let verbose = false;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--incoming':
      case '-i':
        incomingPath = args[++i];
        break;
      case '--catalog':
      case '-c':
        catalogPath = args[++i];
        break;
      case '--output':
      case '-o':
        outputPath = args[++i];
        break;
      case '--from-db':
        fromDB = true;
        break;
      case '--find-duplicates':
        findDuplicates = true;
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
GloveCubs Product Matching CLI

Usage:
  node scripts/match-products.js --incoming <file> [--catalog <file> | --from-db]
  node scripts/match-products.js --find-duplicates --from-db

Options:
  --incoming, -i <file>   Incoming products file (JSON or CSV)
  --catalog, -c <file>    Catalog products file (JSON)
  --from-db               Load catalog from Supabase database
  --output, -o <file>     Output results to file (JSON)
  --find-duplicates       Find duplicates within catalog
  --verbose, -v           Show detailed output
  --help, -h              Show this help

Examples:
  node scripts/match-products.js -i new-supplier.json --from-db
  node scripts/match-products.js --find-duplicates --from-db
  node scripts/match-products.js -i incoming.csv -c catalog.json -o results.json
`);
        process.exit(0);
    }
  }
  
  // Find duplicates mode
  if (findDuplicates) {
    console.log('Loading catalog...');
    let catalog;
    if (fromDB) {
      catalog = await loadCatalogFromDB();
    } else if (catalogPath) {
      catalog = loadFile(catalogPath);
    } else {
      console.error('Error: Need --from-db or --catalog for duplicate detection');
      process.exit(1);
    }
    
    console.log(`Analyzing ${catalog.length} products for duplicates...`);
    const duplicates = findDuplicatesInCatalog(catalog);
    
    formatDuplicatesReport(duplicates);
    
    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(duplicates, null, 2));
      console.log(`Results written to: ${outputPath}`);
    }
    
    return;
  }
  
  // Matching mode
  if (!incomingPath) {
    console.error('Error: --incoming required');
    process.exit(1);
  }
  
  console.log('Loading incoming products...');
  const incoming = loadFile(incomingPath);
  console.log(`Loaded ${incoming.length} incoming products`);
  
  console.log('Loading catalog...');
  let catalog;
  if (fromDB) {
    catalog = await loadCatalogFromDB();
  } else if (catalogPath) {
    catalog = loadFile(catalogPath);
  } else {
    console.error('Error: Need --from-db or --catalog');
    process.exit(1);
  }
  console.log(`Loaded ${catalog.length} catalog products`);
  
  console.log('\nMatching products...');
  const results = matchProductBatch(incoming, catalog);
  
  // Output report
  console.log(generateMatchingReport(results));
  
  // Show table
  formatMatchesTable(results.matches);
  
  // Save results
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\nResults written to: ${outputPath}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Import products from products-import.csv to Supabase
 * Preserves manufacturer SKU numbers
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const obj = {};
    headers.forEach((header, i) => {
      obj[header.trim()] = values[i] || '';
    });
    return obj;
  });
}

function transformProduct(row) {
  return {
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory || null,
    description: row.description,
    material: row.material,
    sizes: row.sizes,
    color: row.color,
    pack_qty: row.pack_qty ? parseInt(row.pack_qty) : null,
    case_qty: row.case_qty ? parseInt(row.case_qty) : null,
    price: row.price ? parseFloat(row.price) : null,
    bulk_price: row.bulk_price ? parseFloat(row.bulk_price) : null,
    image_url: row.image_url,
    in_stock: row.in_stock === '1' || row.in_stock === 'true' ? 1 : 0,
    featured: row.featured === '1' || row.featured === 'true' ? 1 : 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

async function importProducts() {
  const csvPath = path.join(__dirname, '../products-import.csv');
  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(content);
  
  console.log('═'.repeat(50));
  console.log('     GLOVECUBS Products CSV Import');
  console.log('═'.repeat(50));
  console.log(`\nLoaded ${rows.length} products from CSV\n`);
  
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  for (const row of rows) {
    if (!row.sku || !row.name) {
      console.log(`  ⚠ Skipping invalid row: ${JSON.stringify(row).slice(0, 50)}...`);
      continue;
    }
    
    const product = transformProduct(row);
    
    try {
      // Check if exists
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('sku', product.sku)
        .single();
      
      if (existing) {
        const { error } = await supabase
          .from('products')
          .update({ ...product, updated_at: new Date().toISOString() })
          .eq('sku', product.sku);
        
        if (error) throw error;
        updated++;
        console.log(`  ✓ Updated: ${product.sku}`);
      } else {
        const { error } = await supabase
          .from('products')
          .insert(product);
        
        if (error) throw error;
        inserted++;
        console.log(`  ✓ Inserted: ${product.sku}`);
      }
    } catch (err) {
      errors++;
      console.error(`  ✗ Error: ${product.sku} - ${err.message}`);
    }
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log(`✓ Inserted: ${inserted}`);
  console.log(`✓ Updated:  ${updated}`);
  if (errors > 0) console.log(`✗ Errors:   ${errors}`);
  console.log('═'.repeat(50));
}

importProducts().catch(console.error);

#!/usr/bin/env node
/**
 * GLOVECUBS Glove Catalog Import Script
 * 
 * Imports glove products from JSON into Supabase or outputs SQL/CSV.
 * 
 * Usage:
 *   node scripts/import-glove-catalog.js              # Imports to Supabase
 *   node scripts/import-glove-catalog.js --dry-run    # Preview without importing
 *   node scripts/import-glove-catalog.js --sql        # Output SQL INSERT statements
 *   node scripts/import-glove-catalog.js --csv        # Output CSV for bulk import
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const catalogPath = path.join(__dirname, '../data/glove-catalog-import.json');

function loadCatalog() {
  const data = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  return data.products;
}

function transformProduct(product) {
  // Map to existing GLOVECUBS products table schema
  return {
    name: product.name,
    sku: product.sku,
    slug: product.seo_slug,
    description: product.description,
    
    // Pricing
    price: product.price,
    bulk_price: product.case_price,
    
    // Classification
    category: product.category,
    material: product.material,
    color: product.color,
    
    // Quantities
    pack_qty: product.pack_qty,
    case_qty: product.case_qty,
    
    // Specifications
    thickness: product.thickness_mil ? `${product.thickness_mil} mil` : null,
    powder: product.powder_free ? 'powder-free' : 'powdered',
    sizes: Array.isArray(product.sizes) ? product.sizes.join(', ') : product.sizes,
    
    // Industry tags
    industry_tags: product.industries || [],
    use_case: product.industries ? product.industries[0] : null,
    
    // Status
    image_url: product.image_url,
    in_stock: product.in_stock !== false ? 1 : 0,
    featured: 0,
    
    // Store extra data in attributes
    attributes: {
      latex_free: product.latex_free,
      features: product.features,
      keywords: product.keywords,
      warnings: product.warnings,
      packs_per_case: product.packs_per_case || Math.round(product.case_qty / product.pack_qty)
    },
    
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function generateSQL(products) {
  const transformed = products.map(transformProduct);
  
  let sql = `-- GLOVECUBS Glove Catalog Import
-- Generated: ${new Date().toISOString()}
-- Total Products: ${products.length}

-- Create products table if not exists
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  price DECIMAL(10,2),
  case_price DECIMAL(10,2),
  category TEXT,
  material TEXT,
  color TEXT,
  pack_qty INTEGER,
  case_qty INTEGER,
  packs_per_case INTEGER,
  thickness_mil DECIMAL(4,1),
  powder_free BOOLEAN DEFAULT true,
  latex_free BOOLEAN DEFAULT true,
  sizes JSONB,
  industries JSONB,
  features JSONB,
  keywords JSONB,
  image_url TEXT,
  in_stock BOOLEAN DEFAULT true,
  min_order_qty INTEGER DEFAULT 1,
  warnings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_material ON products(material);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- Insert products
`;

  for (const p of transformed) {
    sql += `
INSERT INTO products (name, sku, slug, description, price, case_price, category, material, color, pack_qty, case_qty, packs_per_case, thickness_mil, powder_free, latex_free, sizes, industries, features, keywords, image_url, in_stock, min_order_qty, warnings)
VALUES (
  '${escapeSql(p.name)}',
  '${escapeSql(p.sku)}',
  '${escapeSql(p.slug)}',
  '${escapeSql(p.description)}',
  ${p.price},
  ${p.case_price},
  '${escapeSql(p.category)}',
  '${escapeSql(p.material)}',
  '${escapeSql(p.color)}',
  ${p.pack_qty},
  ${p.case_qty},
  ${p.packs_per_case},
  ${p.thickness_mil || 'NULL'},
  ${p.powder_free},
  ${p.latex_free},
  '${JSON.stringify(p.sizes)}'::jsonb,
  '${JSON.stringify(p.industries)}'::jsonb,
  '${JSON.stringify(p.features)}'::jsonb,
  '${JSON.stringify(p.keywords)}'::jsonb,
  '${escapeSql(p.image_url)}',
  ${p.in_stock},
  ${p.min_order_qty},
  ${p.warnings ? `'${JSON.stringify(p.warnings)}'::jsonb` : 'NULL'}
) ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  case_price = EXCLUDED.case_price,
  updated_at = NOW();
`;
  }

  return sql;
}

function escapeSql(str) {
  if (!str) return '';
  return str.replace(/'/g, "''");
}

function generateCSV(products) {
  const transformed = products.map(transformProduct);
  
  const headers = [
    'name', 'sku', 'slug', 'description', 'price', 'case_price',
    'category', 'material', 'color', 'pack_qty', 'case_qty', 'packs_per_case',
    'thickness_mil', 'powder_free', 'latex_free', 'sizes', 'industries',
    'features', 'keywords', 'image_url', 'in_stock', 'min_order_qty', 'warnings'
  ];
  
  let csv = headers.join(',') + '\n';
  
  for (const p of transformed) {
    const row = [
      csvEscape(p.name),
      csvEscape(p.sku),
      csvEscape(p.slug),
      csvEscape(p.description),
      p.price,
      p.case_price,
      csvEscape(p.category),
      csvEscape(p.material),
      csvEscape(p.color),
      p.pack_qty,
      p.case_qty,
      p.packs_per_case,
      p.thickness_mil || '',
      p.powder_free,
      p.latex_free,
      csvEscape(JSON.stringify(p.sizes)),
      csvEscape(JSON.stringify(p.industries)),
      csvEscape(JSON.stringify(p.features)),
      csvEscape(JSON.stringify(p.keywords)),
      csvEscape(p.image_url),
      p.in_stock,
      p.min_order_qty,
      p.warnings ? csvEscape(JSON.stringify(p.warnings)) : ''
    ];
    csv += row.join(',') + '\n';
  }
  
  return csv;
}

function csvEscape(str) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function importToSupabase(products, dryRun = false) {
  const { createClient } = require('@supabase/supabase-js');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    console.log('   Use --sql or --csv to export without Supabase connection');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const transformed = products.map(transformProduct);
  
  console.log(`\n📦 Importing ${transformed.length} products to Supabase...\n`);
  
  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be made\n');
    transformed.slice(0, 3).forEach(p => {
      console.log(`  ${p.sku}: ${p.name}`);
      console.log(`    Price: $${p.price} / ${p.pack_qty}ct | Case: $${p.case_price}`);
      console.log(`    Material: ${p.material} | Color: ${p.color}`);
      console.log('');
    });
    console.log(`  ... and ${transformed.length - 3} more products`);
    return;
  }
  
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  for (const product of transformed) {
    try {
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

async function main() {
  const args = process.argv.slice(2);
  const outputSql = args.includes('--sql');
  const outputCsv = args.includes('--csv');
  const dryRun = args.includes('--dry-run');
  
  console.log('═'.repeat(50));
  console.log('     GLOVECUBS Glove Catalog Import');
  console.log('═'.repeat(50));
  
  const products = loadCatalog();
  console.log(`\nLoaded ${products.length} products from catalog\n`);
  
  if (outputSql) {
    const sql = generateSQL(products);
    const sqlPath = path.join(__dirname, '../data/glove-catalog.sql');
    fs.writeFileSync(sqlPath, sql);
    console.log(`✓ SQL written to: ${sqlPath}`);
    console.log(`\n  To import: psql -d your_db -f ${sqlPath}`);
    console.log('  Or paste into Supabase SQL Editor\n');
    return;
  }
  
  if (outputCsv) {
    const csv = generateCSV(products);
    const csvPath = path.join(__dirname, '../data/glove-catalog.csv');
    fs.writeFileSync(csvPath, csv);
    console.log(`✓ CSV written to: ${csvPath}`);
    console.log('\n  Import via Supabase Table Editor > Import CSV\n');
    return;
  }
  
  await importToSupabase(products, dryRun);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});

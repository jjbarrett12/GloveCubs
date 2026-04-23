#!/usr/bin/env node
/**
 * Ingest supplier CSV through glove product pipeline.
 * Outputs normalized rows for products table.
 *
 * Usage:
 *   node scripts/ingest-supplier-csv.js <input.csv> [--dry-run] [--import]
 *
 * --dry-run: Print rows to stdout as JSON (default)
 * --import: Insert/update in Supabase products table
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { processCsv } = require('../lib/productIngestion/glovePipeline');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');

function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run') || !args.includes('--import');

  if (!inputPath) {
    console.error('Usage: node scripts/ingest-supplier-csv.js <input.csv> [--dry-run] [--import]');
    process.exit(1);
  }

  const fullPath = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
  if (!fs.existsSync(fullPath)) {
    console.error('File not found:', fullPath);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(fullPath, 'utf8');
  const { rows, errors } = processCsv(csvContent);

  if (errors.length) {
    console.error('Errors:', errors.length);
    errors.slice(0, 10).forEach((e) => console.error(`  Row ${e.row}: ${e.message}`));
  }

  console.log('Processed', rows.length, 'rows');

  if (dryRun) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for --import.');
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();
  const manufacturers = new Map();

  (async () => {
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const payload = {
        sku: row.sku,
        name: row.name,
        brand: row.brand,
        category: row.category,
        subcategory: row.subcategory,
        description: row.description,
        material: row.material,
        powder: row.powder,
        thickness: row.thickness,
        sizes: row.sizes,
        color: row.color,
        grade: row.grade,
        use_case: row.use_case,
        pack_qty: row.pack_qty,
        case_qty: row.case_qty,
        cost: row.cost,
        price: row.price,
        bulk_price: row.bulk_price,
        image_url: row.image_url,
        in_stock: row.in_stock,
        featured: row.featured,
        slug: row.slug,
        updated_at: new Date().toISOString(),
      };

      if (row.brand) {
        const b = row.brand.trim();
        if (!manufacturers.has(b)) {
          const { data: mfr } = await supabase.from('manufacturers').select('id').ilike('name', b).limit(1).maybeSingle();
          if (mfr) manufacturers.set(b, mfr.id);
          else {
            const { data: ins } = await supabase.from('manufacturers').insert({ name: b }).select('id').single();
            if (ins) manufacturers.set(b, ins.id);
          }
        }
        payload.manufacturer_id = manufacturers.get(b) || null;
      }

      const { data: existing } = await supabase.from('products').select('id').eq('sku', row.sku).maybeSingle();
      if (existing) {
        await supabase.from('products').update(payload).eq('id', existing.id);
        updated++;
      } else {
        payload.created_at = new Date().toISOString();
        await supabase.from('products').insert(payload);
        created++;
      }
    }
    console.log('Import complete:', created, 'created,', updated, 'updated');
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();

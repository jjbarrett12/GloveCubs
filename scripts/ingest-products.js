#!/usr/bin/env node
/**
 * Product ingestion CLI.
 * Processes supplier CSVs into normalized product records.
 * 
 * Usage:
 *   node scripts/ingest-products.js <file.csv> [options]
 * 
 * Options:
 *   --dry-run     Process and validate without inserting to database
 *   --no-ai       Disable AI enrichment (use heuristics only)
 *   --output      Output JSON file path for normalized products
 *   --verbose     Show detailed progress
 *   --review      Export products needing review to CSV
 */

const fs = require('fs');
const path = require('path');

const { processCSV, exportForReview } = require('../lib/ingestion/pipeline');
const { isConfigured } = require('../lib/ingestion/enricher');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Product Ingestion Pipeline — GLOVECUBS

Usage:
  node scripts/ingest-products.js <file.csv> [options]

Options:
  --dry-run       Process and validate without inserting to database
  --no-ai         Disable AI enrichment (use heuristics only)
  --output <path> Output JSON file path for normalized products
  --verbose       Show detailed progress and stats
  --review <path> Export products needing review to CSV
  --help, -h      Show this help message

Examples:
  node scripts/ingest-products.js products.csv --dry-run --verbose
  node scripts/ingest-products.js supplier-data.csv --output normalized.json
  node scripts/ingest-products.js bulk-import.csv --review needs-review.csv
`);
    process.exit(0);
  }
  
  const csvFile = args.find(a => !a.startsWith('--'));
  if (!csvFile) {
    console.error('Error: CSV file path required');
    process.exit(1);
  }
  
  const csvPath = path.resolve(csvFile);
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: File not found: ${csvPath}`);
    process.exit(1);
  }
  
  const dryRun = args.includes('--dry-run');
  const noAI = args.includes('--no-ai');
  const verbose = args.includes('--verbose');
  
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 && args[outputIdx + 1] ? args[outputIdx + 1] : null;
  
  const reviewIdx = args.indexOf('--review');
  const reviewPath = reviewIdx >= 0 && args[reviewIdx + 1] ? args[reviewIdx + 1] : null;
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           GLOVECUBS Product Ingestion Pipeline             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`📄 Input file: ${path.basename(csvPath)}`);
  console.log(`🤖 AI enrichment: ${noAI ? 'Disabled' : (isConfigured() ? 'Enabled' : 'Not configured (OPENAI_API_KEY missing)')}`);
  console.log(`💾 Mode: ${dryRun ? 'Dry run (no database writes)' : 'Full import'}`);
  console.log();
  
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  
  console.log('Processing...');
  const startTime = Date.now();
  
  const result = await processCSV(csvContent, {
    enableAI: !noAI,
    onProgress: verbose ? ({ stage, current, total }) => {
      process.stdout.write(`\r  ${stage}: ${current}/${total}`);
    } : null,
  });
  
  if (verbose) console.log();
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (!result.success) {
    console.error(`\n❌ Error: ${result.error}`);
    process.exit(1);
  }
  
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         RESULTS                                ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  console.log(`  Total rows processed:     ${result.stats.totalRows}`);
  console.log(`  Successful transforms:    ${result.stats.successfulTransforms}`);
  console.log(`  Failed transforms:        ${result.stats.failedTransforms}`);
  console.log();
  console.log(`  Ready for import:         ${result.stats.readyForImport}`);
  console.log(`  Needs review:             ${result.stats.needsReview}`);
  console.log(`  Average confidence:       ${(result.stats.avgConfidence * 100).toFixed(1)}%`);
  console.log();
  console.log(`  Processing time:          ${elapsed}s`);
  console.log();
  
  if (result.validation.summary.flagCounts && Object.keys(result.validation.summary.flagCounts).length > 0) {
    console.log('  Flag Summary:');
    for (const [flag, count] of Object.entries(result.validation.summary.flagCounts)) {
      console.log(`    - ${flag}: ${count}`);
    }
    console.log();
  }
  
  if (result.transformErrors.length > 0 && verbose) {
    console.log('  Transform Errors:');
    for (const err of result.transformErrors.slice(0, 10)) {
      console.log(`    Line ${err.line}: ${err.error}`);
    }
    if (result.transformErrors.length > 10) {
      console.log(`    ... and ${result.transformErrors.length - 10} more`);
    }
    console.log();
  }
  
  if (outputPath) {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const output = result.products.map(p => {
      const { _raw, _confidence, _flags, _enriched_fields, _validation, ...clean } = p;
      return {
        ...clean,
        _meta: {
          confidence: _validation?.overallConfidence,
          status: _validation?.status,
          flags: _flags?.map(f => ({ type: f.type, message: f.message })),
          enriched_fields: _enriched_fields,
        },
      };
    });
    
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`✅ Normalized products written to: ${outputPath}`);
  }
  
  if (reviewPath) {
    const needsReview = result.validation.results
      .filter(r => r.status === 'review_required')
      .map(r => r.product);
    
    if (needsReview.length > 0) {
      const reviewData = exportForReview(needsReview);
      const headers = Object.keys(reviewData[0]);
      const csv = [
        headers.join(','),
        ...reviewData.map(row => headers.map(h => {
          const val = row[h];
          if (val == null) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')),
      ].join('\n');
      
      fs.writeFileSync(reviewPath, csv);
      console.log(`✅ Review items written to: ${reviewPath}`);
    } else {
      console.log('✅ No items need review');
    }
  }
  
  if (verbose && result.products.length > 0) {
    console.log();
    console.log('Sample normalized product:');
    console.log('─────────────────────────────────────────────────────────────');
    const sample = result.products[0];
    console.log(JSON.stringify({
      supplier_sku: sample.supplier_sku,
      canonical_title: sample.canonical_title,
      brand: sample.brand,
      material: sample.material,
      color: sample.color,
      thickness_mil: sample.thickness_mil,
      powder: sample.powder,
      grade: sample.grade,
      pack_qty: sample.pack_qty,
      case_qty: sample.case_qty,
      supplier_cost: sample.supplier_cost,
      category: sample.category,
      short_description: sample.short_description?.substring(0, 100) + (sample.short_description?.length > 100 ? '...' : ''),
      search_keywords: sample.search_keywords?.slice(0, 5),
    }, null, 2));
  }
  
  if (!dryRun) {
    console.log();
    console.log('⚠️  Database import not yet implemented in this script.');
    console.log('   Use --output to export normalized JSON, then import via admin UI or service.');
  }
  
  console.log();
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

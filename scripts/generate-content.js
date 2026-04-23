#!/usr/bin/env node
/**
 * B2B Content Generator CLI
 * Generates ecommerce content for glove products.
 * 
 * Usage:
 *   node scripts/generate-content.js <input.json> [options]
 *   node scripts/generate-content.js --product "<product-json>" [options]
 * 
 * Options:
 *   --output <path>   Output JSON file path
 *   --no-ai           Use heuristic generation only
 *   --verbose         Show detailed output
 *   --format <type>   Output format: full | supabase | markdown
 */

const fs = require('fs');
const path = require('path');

const { generateFullContent, generateBatchContent, contentToSupabaseFields } = require('../lib/ingestion/content-generator');
const { isConfigured } = require('../lib/ingestion/enricher');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
B2B Content Generator — GLOVECUBS

Usage:
  node scripts/generate-content.js <input.json> [options]
  node scripts/generate-content.js --product '{"brand":"...", ...}' [options]

Options:
  --output <path>   Output JSON file path
  --no-ai           Disable AI, use heuristics only
  --verbose         Show detailed output
  --format <type>   Output format: full | supabase | markdown

Input JSON Format:
  {
    "supplier_sku": "ABC-123",
    "brand": "Ambitex",
    "material": "nitrile",
    "thickness_mil": "4",
    "color": "blue",
    "powder": "powder_free",
    "grade": "medical_exam",
    "pack_qty": 100,
    "case_qty": 1000,
    "size_range": ["S", "M", "L", "XL"]
  }

Examples:
  node scripts/generate-content.js products.json --output content.json
  node scripts/generate-content.js --product '{"brand":"Hospeco","material":"vinyl"}' --verbose
  node scripts/generate-content.js data.json --format markdown --output catalog.md
`);
    process.exit(0);
  }
  
  const noAI = args.includes('--no-ai');
  const verbose = args.includes('--verbose');
  
  const formatIdx = args.indexOf('--format');
  const format = formatIdx >= 0 && args[formatIdx + 1] ? args[formatIdx + 1] : 'full';
  
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 && args[outputIdx + 1] ? args[outputIdx + 1] : null;
  
  const productIdx = args.indexOf('--product');
  let products = [];
  
  if (productIdx >= 0 && args[productIdx + 1]) {
    try {
      const product = JSON.parse(args[productIdx + 1]);
      products = [product];
    } catch (e) {
      console.error('Error: Invalid JSON in --product argument');
      process.exit(1);
    }
  } else {
    const inputFile = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
    if (inputFile) {
      const inputPath = path.resolve(inputFile);
      if (!fs.existsSync(inputPath)) {
        console.error(`Error: File not found: ${inputPath}`);
        process.exit(1);
      }
      try {
        const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        products = Array.isArray(data) ? data : [data];
      } catch (e) {
        console.error('Error: Invalid JSON file');
        process.exit(1);
      }
    } else {
      console.error('Error: No input file or --product provided');
      process.exit(1);
    }
  }
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           GLOVECUBS B2B Content Generator                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`📦 Products to process: ${products.length}`);
  console.log(`🤖 AI generation: ${noAI ? 'Disabled' : (isConfigured() ? 'Enabled' : 'Not configured')}`);
  console.log(`📄 Output format: ${format}`);
  console.log();
  
  const startTime = Date.now();
  
  const results = await generateBatchContent(products, {
    enableAI: !noAI,
    onProgress: verbose ? ({ current, total }) => {
      process.stdout.write(`\r  Processing: ${current}/${total}`);
    } : null,
  });
  
  if (verbose) console.log();
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                         RESULTS                                ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  console.log(`  Products processed: ${results.length}`);
  console.log(`  AI used: ${results.filter(r => r.content._ai_used).length}`);
  console.log(`  Processing time: ${elapsed}s`);
  console.log();
  
  let output;
  if (format === 'supabase') {
    output = results.map(r => ({
      sku: r.sku,
      ...contentToSupabaseFields(r.content),
    }));
  } else if (format === 'markdown') {
    output = results.map(r => formatAsMarkdown(r)).join('\n\n---\n\n');
  } else {
    output = results;
  }
  
  if (outputPath) {
    const ext = path.extname(outputPath).toLowerCase();
    if (ext === '.md' || format === 'markdown') {
      fs.writeFileSync(outputPath, typeof output === 'string' ? output : JSON.stringify(output, null, 2));
    } else {
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    }
    console.log(`✅ Output written to: ${outputPath}`);
  } else if (verbose && results.length > 0) {
    console.log('Sample output:');
    console.log('─────────────────────────────────────────────────────────────');
    if (format === 'markdown') {
      console.log(formatAsMarkdown(results[0]));
    } else {
      const sample = results[0];
      console.log(JSON.stringify({
        sku: sample.sku,
        seo_title: sample.content.seo_title,
        subtitle: sample.content.subtitle,
        bullet_features: sample.content.bullet_features,
        meta_description: sample.content.meta_description,
        recommended_use_cases: sample.content.recommended_use_cases,
        keywords_count: sample.content.search_keywords?.length,
      }, null, 2));
    }
  }
  
  console.log();
  console.log('Done!');
}

function formatAsMarkdown(result) {
  const c = result.content;
  
  let md = `# ${c.seo_title}\n\n`;
  md += `**${c.subtitle}**\n\n`;
  
  md += `## Features\n\n`;
  for (const bullet of c.bullet_features || []) {
    md += `- ${bullet}\n`;
  }
  md += '\n';
  
  md += `## Description\n\n${c.long_description}\n\n`;
  
  md += `## Technical Specifications\n\n`;
  md += `| Specification | Value |\n`;
  md += `|--------------|-------|\n`;
  for (const [key, value] of Object.entries(c.technical_specs || {})) {
    md += `| ${key} | ${value} |\n`;
  }
  md += '\n';
  
  md += `## Recommended Use Cases\n\n`;
  for (const useCase of c.recommended_use_cases || []) {
    md += `- ${useCase}\n`;
  }
  md += '\n';
  
  md += `## Search Keywords\n\n`;
  md += (c.search_keywords || []).join(', ') + '\n\n';
  
  md += `## Meta Description\n\n`;
  md += `> ${c.meta_description}\n`;
  
  return md;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

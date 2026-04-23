#!/usr/bin/env node
/**
 * Batch product content generation CLI.
 * 
 * Usage:
 *   node scripts/generate-product-content.js <products.json> [options]
 * 
 * Options:
 *   --output, -o    Output file path (default: stdout)
 *   --ai            Use AI generation (requires OPENAI_API_KEY)
 *   --heuristic     Use heuristic generation only (default)
 *   --format        Output format: json, csv, markdown (default: json)
 *   --verbose       Show progress
 *   --template      AI template to use (default: full_content)
 */

const fs = require('fs');
const path = require('path');

const { generateAllContent, generateBatch } = require('../lib/productCopy/contentGenerator');
const { generateWithAI, generateBatchWithAI, TEMPLATES } = require('../lib/productCopy/promptTemplates');

function parseArgs(args) {
  const options = {
    inputFile: null,
    outputFile: null,
    useAI: false,
    format: 'json',
    verbose: false,
    template: 'full_content',
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--output' || arg === '-o') {
      options.outputFile = args[++i];
    } else if (arg === '--ai') {
      options.useAI = true;
    } else if (arg === '--heuristic') {
      options.useAI = false;
    } else if (arg === '--format') {
      options.format = args[++i];
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--template') {
      options.template = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('--') && !options.inputFile) {
      options.inputFile = arg;
    }
  }
  
  return options;
}

function printHelp() {
  console.log(`
Product Content Generator — GLOVECUBS

Generates SEO titles, descriptions, bullets, specs, and keywords for products.

Usage:
  node scripts/generate-product-content.js <products.json> [options]

Input:
  JSON file with array of product objects. Each product should have:
  - sku or supplier_sku
  - material (nitrile, latex, vinyl, etc.)
  - brand, color, thickness, powder (optional)
  - pack_qty, case_qty (optional)
  - grade, category, subcategory (optional)

Options:
  --output, -o <file>   Output file path (default: stdout)
  --ai                  Use OpenAI for generation (requires OPENAI_API_KEY)
  --heuristic           Use rule-based generation (default, no API needed)
  --format <type>       Output format: json, csv, markdown (default: json)
  --template <name>     AI template: ${Object.keys(TEMPLATES).join(', ')}
  --verbose             Show progress
  --help, -h            Show this help

Examples:
  # Generate content using heuristics
  node scripts/generate-product-content.js products.json -o content.json

  # Generate with AI
  node scripts/generate-product-content.js products.json --ai -o content.json --verbose

  # Generate only SEO titles with AI
  node scripts/generate-product-content.js products.json --ai --template seo_title

  # Output as markdown
  node scripts/generate-product-content.js products.json --format markdown -o catalog.md
`);
}

function formatAsMarkdown(results) {
  const lines = ['# Product Catalog Content\n'];
  
  for (const result of results) {
    lines.push(`## ${result.seoTitle || result.sku}`);
    lines.push('');
    
    if (result.subtitle) {
      lines.push(`*${result.subtitle}*`);
      lines.push('');
    }
    
    if (result.metaDescription) {
      lines.push(`> ${result.metaDescription}`);
      lines.push('');
    }
    
    if (result.bulletFeatures?.length > 0) {
      lines.push('### Features');
      for (const bullet of result.bulletFeatures) {
        lines.push(`- ${bullet}`);
      }
      lines.push('');
    }
    
    if (result.longDescription) {
      lines.push('### Description');
      lines.push(result.longDescription.replace(/\n\n/g, '\n\n'));
      lines.push('');
    }
    
    if (result.technicalSpecs && Object.keys(result.technicalSpecs).length > 0) {
      lines.push('### Technical Specifications');
      lines.push('| Specification | Value |');
      lines.push('|---------------|-------|');
      for (const [key, value] of Object.entries(result.technicalSpecs)) {
        lines.push(`| ${key} | ${value} |`);
      }
      lines.push('');
    }
    
    if (result.useCases?.length > 0) {
      lines.push('### Recommended Use Cases');
      lines.push(result.useCases.join(' • '));
      lines.push('');
    }
    
    if (result.searchKeywords?.length > 0) {
      lines.push('### Keywords');
      lines.push(`\`${result.searchKeywords.join(', ')}\``);
      lines.push('');
    }
    
    lines.push('---\n');
  }
  
  return lines.join('\n');
}

function formatAsCSV(results) {
  const headers = [
    'SKU', 'SEO Title', 'Subtitle', 'Meta Description',
    'Bullet 1', 'Bullet 2', 'Bullet 3', 'Bullet 4', 'Bullet 5',
    'Long Description', 'Use Cases', 'Keywords'
  ];
  
  const rows = [headers.join(',')];
  
  for (const result of results) {
    const bullets = result.bulletFeatures || [];
    const row = [
      escapeCSV(result.sku || ''),
      escapeCSV(result.seoTitle || ''),
      escapeCSV(result.subtitle || ''),
      escapeCSV(result.metaDescription || ''),
      escapeCSV(bullets[0] || ''),
      escapeCSV(bullets[1] || ''),
      escapeCSV(bullets[2] || ''),
      escapeCSV(bullets[3] || ''),
      escapeCSV(bullets[4] || ''),
      escapeCSV(result.longDescription || ''),
      escapeCSV((result.useCases || []).join('; ')),
      escapeCSV((result.searchKeywords || []).join(', ')),
    ];
    rows.push(row.join(','));
  }
  
  return rows.join('\n');
}

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  if (options.help || !options.inputFile) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }
  
  const inputPath = path.resolve(options.inputFile);
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }
  
  let products;
  try {
    const content = fs.readFileSync(inputPath, 'utf8');
    products = JSON.parse(content);
    if (!Array.isArray(products)) {
      products = [products];
    }
  } catch (err) {
    console.error(`Error parsing JSON: ${err.message}`);
    process.exit(1);
  }
  
  if (options.verbose) {
    console.log(`Processing ${products.length} products...`);
    console.log(`Mode: ${options.useAI ? 'AI' : 'Heuristic'}`);
    if (options.useAI) {
      console.log(`Template: ${options.template}`);
      if (!process.env.OPENAI_API_KEY) {
        console.error('Error: OPENAI_API_KEY not set');
        process.exit(1);
      }
    }
  }
  
  let results;
  
  if (options.useAI) {
    if (options.template === 'full_content') {
      results = await generateBatchWithAI(products, {
        onProgress: options.verbose ? ({ completed, total }) => {
          process.stdout.write(`\rProgress: ${completed}/${total}`);
        } : null,
      });
      if (options.verbose) console.log();
      
      results = results.map(r => {
        if (r.success) {
          return { sku: r.sku, ...r.content };
        } else {
          return { sku: r.sku, error: r.error };
        }
      });
    } else {
      results = [];
      for (let i = 0; i < products.length; i++) {
        try {
          const content = await generateWithAI(products[i], options.template);
          results.push({ sku: products[i].sku || products[i].supplier_sku, [options.template]: content });
          if (options.verbose) {
            process.stdout.write(`\rProgress: ${i + 1}/${products.length}`);
          }
        } catch (err) {
          results.push({ sku: products[i].sku || products[i].supplier_sku, error: err.message });
        }
      }
      if (options.verbose) console.log();
    }
  } else {
    results = generateBatch(products);
  }
  
  let output;
  switch (options.format) {
    case 'markdown':
    case 'md':
      output = formatAsMarkdown(results);
      break;
    case 'csv':
      output = formatAsCSV(results);
      break;
    case 'json':
    default:
      output = JSON.stringify(results, null, 2);
  }
  
  if (options.outputFile) {
    const outputPath = path.resolve(options.outputFile);
    fs.writeFileSync(outputPath, output);
    if (options.verbose) {
      console.log(`Output written to: ${outputPath}`);
    }
  } else {
    console.log(output);
  }
  
  if (options.verbose) {
    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    console.log(`\nComplete: ${successful} successful, ${failed} failed`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

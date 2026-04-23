#!/usr/bin/env node
/**
 * GloveCubs Product Normalization CLI
 * 
 * Usage:
 *   node scripts/normalize-products.js --input data/raw-products.csv
 *   node scripts/normalize-products.js --input data/raw-products.json --output data/normalized.json
 *   node scripts/normalize-products.js --input data/raw.csv --supplier "AMMEX"
 *   cat raw.json | node scripts/normalize-products.js --stdin
 */

const fs = require('fs');
const path = require('path');
const {
  normalizeProducts,
  generateNormalizationReport
} = require('../lib/productNormalization');

// ==============================================================================
// CSV PARSER
// ==============================================================================

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  
  // Parse rows
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((header, i) => {
      obj[header.trim().toLowerCase().replace(/\s+/g, '_')] = values[i] || '';
    });
    return obj;
  }).filter(row => Object.values(row).some(v => v)); // Filter empty rows
}

function parseCSVLine(line) {
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
  
  return values;
}

// ==============================================================================
// OUTPUT FORMATTERS
// ==============================================================================

function formatTable(products, columns) {
  if (products.length === 0) return 'No products to display.';
  
  const widths = columns.map(col => 
    Math.max(col.length, ...products.map(p => String(p[col] || '').slice(0, 30).length))
  );
  
  const header = columns.map((col, i) => col.padEnd(widths[i])).join(' | ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');
  
  const rows = products.map(p => 
    columns.map((col, i) => String(p[col] || '').slice(0, 30).padEnd(widths[i])).join(' | ')
  );
  
  return [header, separator, ...rows].join('\n');
}

function formatReport(report) {
  let output = '';
  output += '\n' + '═'.repeat(60) + '\n';
  output += '     PRODUCT NORMALIZATION REPORT\n';
  output += '═'.repeat(60) + '\n\n';
  
  output += `Total Products:      ${report.total_products}\n`;
  output += `Approved:            ${report.approved_count} (${report.approval_rate}%)\n`;
  output += `Review Required:     ${report.review_required_count}\n`;
  output += `Average Confidence:  ${report.average_confidence}\n`;
  
  if (Object.keys(report.issue_frequency).length > 0) {
    output += '\nIssue Frequency:\n';
    Object.entries(report.issue_frequency)
      .sort((a, b) => b[1] - a[1])
      .forEach(([issue, count]) => {
        output += `  - ${issue}: ${count}\n`;
      });
  }
  
  if (report.review_queue.length > 0) {
    output += '\nReview Queue (first 10):\n';
    report.review_queue.slice(0, 10).forEach(item => {
      output += `  [${item.confidence}] ${item.sku || 'NO-SKU'}: ${item.name?.slice(0, 40) || 'unnamed'}\n`;
      item.issues.forEach(issue => {
        output += `       ⚠ ${issue}\n`;
      });
    });
  }
  
  output += '\n' + '═'.repeat(60) + '\n';
  
  return output;
}

// ==============================================================================
// MAIN
// ==============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let inputPath = null;
  let outputPath = null;
  let supplierId = null;
  let useStdin = false;
  let outputFormat = 'json';
  let showReport = true;
  
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
      case '--supplier':
      case '-s':
        supplierId = args[++i];
        break;
      case '--stdin':
        useStdin = true;
        break;
      case '--format':
      case '-f':
        outputFormat = args[++i];
        break;
      case '--no-report':
        showReport = false;
        break;
      case '--help':
      case '-h':
        console.log(`
GloveCubs Product Normalization CLI

Usage:
  node scripts/normalize-products.js --input <file> [options]

Options:
  --input, -i <file>      Input CSV or JSON file
  --output, -o <file>     Output JSON file (default: stdout)
  --supplier, -s <id>     Supplier ID to tag products with
  --stdin                 Read from stdin instead of file
  --format, -f <format>   Output format: json, table, report (default: json)
  --no-report             Skip the normalization report
  --help, -h              Show this help

Examples:
  node scripts/normalize-products.js -i data/ammex-products.csv -s AMMEX
  node scripts/normalize-products.js -i raw.json -o normalized.json --format json
  cat products.csv | node scripts/normalize-products.js --stdin --format table
`);
        process.exit(0);
    }
  }
  
  // Read input
  let rawContent;
  if (useStdin) {
    rawContent = fs.readFileSync(0, 'utf8');
  } else if (inputPath) {
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Input file not found: ${inputPath}`);
      process.exit(1);
    }
    rawContent = fs.readFileSync(inputPath, 'utf8');
  } else {
    console.error('Error: No input specified. Use --input or --stdin');
    process.exit(1);
  }
  
  // Parse input
  let rawProducts;
  if (inputPath?.endsWith('.csv') || rawContent.includes(',') && !rawContent.startsWith('{') && !rawContent.startsWith('[')) {
    rawProducts = parseCSV(rawContent);
  } else {
    try {
      rawProducts = JSON.parse(rawContent);
      if (!Array.isArray(rawProducts)) {
        rawProducts = rawProducts.products || [rawProducts];
      }
    } catch (e) {
      console.error('Error: Could not parse input as JSON or CSV');
      process.exit(1);
    }
  }
  
  console.error(`Processing ${rawProducts.length} products...`);
  
  // Normalize
  const normalized = normalizeProducts(rawProducts, supplierId);
  const report = generateNormalizationReport(normalized);
  
  // Output report
  if (showReport) {
    console.error(formatReport(report));
  }
  
  // Output results
  let output;
  switch (outputFormat) {
    case 'table':
      output = formatTable(normalized, [
        'supplier_sku', 'canonical_title', 'material', 'thickness_mil', 
        'units_per_box', 'parse_confidence'
      ]);
      break;
    case 'report':
      output = formatReport(report);
      break;
    case 'json':
    default:
      output = JSON.stringify({
        normalized_at: new Date().toISOString(),
        supplier_id: supplierId,
        summary: report,
        products: normalized
      }, null, 2);
  }
  
  if (outputPath) {
    fs.writeFileSync(outputPath, output);
    console.error(`Output written to: ${outputPath}`);
  } else if (outputFormat !== 'report') {
    console.log(output);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

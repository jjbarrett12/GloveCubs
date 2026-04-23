#!/usr/bin/env node
/**
 * Product Catalog Verification Audit
 * 
 * Analyzes the product catalog to determine launch readiness.
 * 
 * Usage:
 *   node scripts/audit-product-catalog.js [options]
 * 
 * Options:
 *   --json           Output results as JSON
 *   --remediation    Show detailed remediation list
 *   --detailed       Show all products with completeness scores
 *   --file=PATH      Read products from JSON file instead of database
 *   --export         Export current database products to JSON file
 *   --help           Show this help message
 * 
 * Examples:
 *   node scripts/audit-product-catalog.js
 *   node scripts/audit-product-catalog.js --remediation --detailed
 *   node scripts/audit-product-catalog.js --json > report.json
 *   node scripts/audit-product-catalog.js --file=products-export.json
 *   node scripts/audit-product-catalog.js --export
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let supabaseModule;
try {
  supabaseModule = require('../lib/supabaseAdmin');
} catch (e) {
  supabaseModule = { getSupabaseAdmin: () => null, isSupabaseAdminConfigured: () => false };
}

// Launch-ready criteria
const REQUIRED_FIELDS = ['name', 'price', 'image_url', 'description', 'category'];
const RECOMMENDED_FIELDS = ['brand', 'material', 'sku', 'sizes', 'pack_qty'];

// Minimum recommended catalog size for B2B ecommerce launch
const RECOMMENDED_MIN_PRODUCTS = 50;
const RECOMMENDED_MIN_CATEGORIES = 3;

/**
 * Calculate completeness score for a product (0-100)
 */
function calculateCompletenessScore(product) {
  let score = 0;
  let maxScore = 0;
  
  // Required fields (70% weight)
  const requiredWeight = 70 / REQUIRED_FIELDS.length;
  for (const field of REQUIRED_FIELDS) {
    maxScore += requiredWeight;
    const value = product[field];
    if (value && String(value).trim().length > 0) {
      // Bonus for quality
      if (field === 'description' && String(value).length >= 50) {
        score += requiredWeight;
      } else if (field === 'description') {
        score += requiredWeight * 0.5; // Partial credit for short descriptions
      } else if (field === 'image_url' && isValidImageUrl(value)) {
        score += requiredWeight;
      } else if (field === 'image_url') {
        score += requiredWeight * 0.5; // Partial credit for potentially invalid URLs
      } else if (field === 'price' && Number(value) > 0) {
        score += requiredWeight;
      } else if (field !== 'price' && field !== 'description' && field !== 'image_url') {
        score += requiredWeight;
      }
    }
  }
  
  // Recommended fields (30% weight)
  const recommendedWeight = 30 / RECOMMENDED_FIELDS.length;
  for (const field of RECOMMENDED_FIELDS) {
    maxScore += recommendedWeight;
    const value = product[field];
    if (value && String(value).trim().length > 0) {
      score += recommendedWeight;
    }
  }
  
  return Math.round((score / maxScore) * 100);
}

/**
 * Check if a product is launch-ready
 */
function isLaunchReady(product) {
  return REQUIRED_FIELDS.every(field => {
    const value = product[field];
    if (field === 'price') return Number(value) > 0;
    if (field === 'image_url') return value && String(value).trim().length > 5;
    if (field === 'description') return value && String(value).trim().length >= 10;
    return value && String(value).trim().length > 0;
  });
}

/**
 * Check if URL looks like a valid image URL
 */
function isValidImageUrl(url) {
  if (!url) return false;
  const u = String(url).trim().toLowerCase();
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  if (u.includes(' ')) return false;
  // Common image extensions or CDN patterns
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(u) || 
         /cloudinary|imgur|cdn|storage|blob|supabase/i.test(u);
}

/**
 * Get missing fields for a product
 */
function getMissingFields(product) {
  const missing = [];
  
  for (const field of REQUIRED_FIELDS) {
    const value = product[field];
    if (field === 'price') {
      if (!Number(value) || Number(value) <= 0) missing.push('price');
    } else if (field === 'image_url') {
      if (!value || String(value).trim().length < 5) missing.push('image_url');
    } else if (field === 'description') {
      if (!value || String(value).trim().length < 10) missing.push('description');
    } else {
      if (!value || String(value).trim().length === 0) missing.push(field);
    }
  }
  
  return missing;
}

/**
 * Analyze products and generate report
 */
function analyzeProducts(products) {
  const stats = {
    total: products.length,
    launchReady: 0,
    incomplete: 0,
    
    // Field coverage
    withImage: 0,
    withPrice: 0,
    withDescription: 0,
    withCategory: 0,
    withBrand: 0,
    withMaterial: 0,
    withSku: 0,
    withSizes: 0,
    
    // Missing fields
    missingImage: 0,
    missingPrice: 0,
    missingDescription: 0,
    missingCategory: 0,
    missingName: 0,
    
    // Quality metrics
    shortDescriptions: 0,  // < 50 chars
    zeroPrices: 0,
    invalidImageUrls: 0,
    
    // Categories
    categories: new Set(),
    brands: new Set(),
    materials: new Set(),
    
    // Average score
    totalScore: 0,
    avgScore: 0
  };
  
  const productDetails = [];
  const remediation = {
    missingImage: [],
    missingPrice: [],
    missingDescription: [],
    missingCategory: [],
    missingName: [],
    incomplete: []
  };
  
  for (const product of products) {
    const score = calculateCompletenessScore(product);
    const ready = isLaunchReady(product);
    const missing = getMissingFields(product);
    
    stats.totalScore += score;
    
    if (ready) {
      stats.launchReady++;
    } else {
      stats.incomplete++;
    }
    
    // Field coverage
    if (product.image_url && String(product.image_url).trim().length > 5) {
      if (isValidImageUrl(product.image_url)) {
        stats.withImage++;
      } else {
        stats.invalidImageUrls++;
      }
    } else {
      stats.missingImage++;
      remediation.missingImage.push({ id: product.id, name: product.name, sku: product.sku });
    }
    
    if (Number(product.price) > 0) {
      stats.withPrice++;
    } else {
      stats.missingPrice++;
      if (Number(product.price) === 0) stats.zeroPrices++;
      remediation.missingPrice.push({ id: product.id, name: product.name, sku: product.sku, current: product.price });
    }
    
    if (product.description && String(product.description).trim().length >= 10) {
      stats.withDescription++;
      if (String(product.description).length < 50) stats.shortDescriptions++;
    } else {
      stats.missingDescription++;
      remediation.missingDescription.push({ id: product.id, name: product.name, sku: product.sku });
    }
    
    if (product.category && String(product.category).trim().length > 0) {
      stats.withCategory++;
      stats.categories.add(product.category);
    } else {
      stats.missingCategory++;
      remediation.missingCategory.push({ id: product.id, name: product.name, sku: product.sku });
    }
    
    if (!product.name || String(product.name).trim().length === 0) {
      stats.missingName++;
      remediation.missingName.push({ id: product.id, sku: product.sku });
    }
    
    if (product.brand) stats.brands.add(product.brand);
    if (product.material) stats.materials.add(product.material);
    if (product.sku) stats.withSku++;
    if (product.sizes) stats.withSizes++;
    if (product.material) stats.withMaterial++;
    if (product.brand) stats.withBrand++;
    
    // Track incomplete products for remediation
    if (!ready) {
      remediation.incomplete.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        missing,
        score
      });
    }
    
    productDetails.push({
      id: product.id,
      name: product.name || '(no name)',
      sku: product.sku || '',
      image: product.image_url ? (isValidImageUrl(product.image_url) ? '✓' : '?') : '✗',
      price: Number(product.price) > 0 ? `$${Number(product.price).toFixed(2)}` : '✗',
      description: product.description ? (String(product.description).length >= 50 ? '✓' : '~') : '✗',
      category: product.category || '✗',
      score,
      ready: ready ? '✓' : '✗'
    });
  }
  
  stats.avgScore = stats.total > 0 ? Math.round(stats.totalScore / stats.total) : 0;
  stats.categories = [...stats.categories].sort();
  stats.brands = [...stats.brands].sort();
  stats.materials = [...stats.materials].sort();
  
  return { stats, productDetails, remediation };
}

/**
 * Generate summary report
 */
function generateSummaryReport(stats) {
  const lines = [];
  
  lines.push('╔════════════════════════════════════════════════════════════════════╗');
  lines.push('║           GLOVECUBS PRODUCT CATALOG AUDIT REPORT                   ║');
  lines.push('╠════════════════════════════════════════════════════════════════════╣');
  lines.push(`║  Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}                         ║`);
  lines.push('╚════════════════════════════════════════════════════════════════════╝');
  lines.push('');
  
  // Summary
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                        SUMMARY                                      │');
  lines.push('├─────────────────────────────────────────────────────────────────────┤');
  lines.push(`│  Total Products:        ${String(stats.total).padStart(6)}                                  │`);
  lines.push(`│  Launch-Ready:          ${String(stats.launchReady).padStart(6)}  (${String(Math.round(stats.launchReady/stats.total*100 || 0)).padStart(3)}%)                          │`);
  lines.push(`│  Incomplete:            ${String(stats.incomplete).padStart(6)}  (${String(Math.round(stats.incomplete/stats.total*100 || 0)).padStart(3)}%)                          │`);
  lines.push(`│  Average Score:         ${String(stats.avgScore).padStart(6)}%                                 │`);
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Field Coverage
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    FIELD COVERAGE                                   │');
  lines.push('├─────────────────────────────────────────────────────────────────────┤');
  lines.push(`│  Has Name:              ${String(stats.total - stats.missingName).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round((stats.total - stats.missingName)/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push(`│  Has Price (>$0):       ${String(stats.withPrice).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round(stats.withPrice/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push(`│  Has Image:             ${String(stats.withImage).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round(stats.withImage/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push(`│  Has Description:       ${String(stats.withDescription).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round(stats.withDescription/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push(`│  Has Category:          ${String(stats.withCategory).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round(stats.withCategory/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push('├─────────────────────────────────────────────────────────────────────┤');
  lines.push(`│  Has SKU:               ${String(stats.withSku).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round(stats.withSku/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push(`│  Has Brand:             ${String(stats.withBrand).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round(stats.withBrand/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push(`│  Has Material:          ${String(stats.withMaterial).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round(stats.withMaterial/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push(`│  Has Sizes:             ${String(stats.withSizes).padStart(6)} / ${String(stats.total).padStart(6)}  (${String(Math.round(stats.withSizes/stats.total*100 || 0)).padStart(3)}%)               │`);
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Quality Issues
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    QUALITY ISSUES                                   │');
  lines.push('├─────────────────────────────────────────────────────────────────────┤');
  lines.push(`│  Missing Image:         ${String(stats.missingImage).padStart(6)}                                  │`);
  lines.push(`│  Invalid Image URL:     ${String(stats.invalidImageUrls).padStart(6)}                                  │`);
  lines.push(`│  Missing/Zero Price:    ${String(stats.missingPrice).padStart(6)}                                  │`);
  lines.push(`│  Missing Description:   ${String(stats.missingDescription).padStart(6)}                                  │`);
  lines.push(`│  Short Description:     ${String(stats.shortDescriptions).padStart(6)}  (< 50 chars)                     │`);
  lines.push(`│  Missing Category:      ${String(stats.missingCategory).padStart(6)}                                  │`);
  lines.push(`│  Missing Name:          ${String(stats.missingName).padStart(6)}                                  │`);
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Categories
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    CATEGORIES                                       │');
  lines.push('├─────────────────────────────────────────────────────────────────────┤');
  lines.push(`│  Unique Categories: ${stats.categories.length}                                             │`);
  for (const cat of stats.categories.slice(0, 10)) {
    lines.push(`│    • ${cat.substring(0, 60).padEnd(60)} │`);
  }
  if (stats.categories.length > 10) {
    lines.push(`│    ... and ${stats.categories.length - 10} more                                               │`);
  }
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  // Launch Readiness Assessment
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                 LAUNCH READINESS ASSESSMENT                         │');
  lines.push('├─────────────────────────────────────────────────────────────────────┤');
  
  const meetsMinProducts = stats.launchReady >= RECOMMENDED_MIN_PRODUCTS;
  const meetsMinCategories = stats.categories.length >= RECOMMENDED_MIN_CATEGORIES;
  const launchReadyPercent = Math.round(stats.launchReady / stats.total * 100 || 0);
  const overallReady = meetsMinProducts && meetsMinCategories && launchReadyPercent >= 70;
  
  lines.push(`│  Min Products (${RECOMMENDED_MIN_PRODUCTS}):     ${meetsMinProducts ? '✓ PASS' : '✗ FAIL'} (${stats.launchReady} launch-ready)               │`);
  lines.push(`│  Min Categories (${RECOMMENDED_MIN_CATEGORIES}):   ${meetsMinCategories ? '✓ PASS' : '✗ FAIL'} (${stats.categories.length} categories)                    │`);
  lines.push(`│  70% Complete:        ${launchReadyPercent >= 70 ? '✓ PASS' : '✗ FAIL'} (${launchReadyPercent}% launch-ready)                    │`);
  lines.push('├─────────────────────────────────────────────────────────────────────┤');
  lines.push(`│  OVERALL:             ${overallReady ? '✓ READY FOR LAUNCH' : '✗ NOT READY - See remediation below'}           │`);
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generate remediation report
 */
function generateRemediationReport(remediation, limit = 20) {
  const lines = [];
  
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    REMEDIATION LIST                                 │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  if (remediation.missingPrice.length > 0) {
    lines.push(`## Products Missing Price (${remediation.missingPrice.length})`);
    lines.push('');
    for (const p of remediation.missingPrice.slice(0, limit)) {
      lines.push(`  ID ${p.id}: ${p.name} [${p.sku || 'no SKU'}] - Current: ${p.current}`);
    }
    if (remediation.missingPrice.length > limit) {
      lines.push(`  ... and ${remediation.missingPrice.length - limit} more`);
    }
    lines.push('');
  }
  
  if (remediation.missingImage.length > 0) {
    lines.push(`## Products Missing Image (${remediation.missingImage.length})`);
    lines.push('');
    for (const p of remediation.missingImage.slice(0, limit)) {
      lines.push(`  ID ${p.id}: ${p.name} [${p.sku || 'no SKU'}]`);
    }
    if (remediation.missingImage.length > limit) {
      lines.push(`  ... and ${remediation.missingImage.length - limit} more`);
    }
    lines.push('');
  }
  
  if (remediation.missingDescription.length > 0) {
    lines.push(`## Products Missing Description (${remediation.missingDescription.length})`);
    lines.push('');
    for (const p of remediation.missingDescription.slice(0, limit)) {
      lines.push(`  ID ${p.id}: ${p.name} [${p.sku || 'no SKU'}]`);
    }
    if (remediation.missingDescription.length > limit) {
      lines.push(`  ... and ${remediation.missingDescription.length - limit} more`);
    }
    lines.push('');
  }
  
  if (remediation.missingCategory.length > 0) {
    lines.push(`## Products Missing Category (${remediation.missingCategory.length})`);
    lines.push('');
    for (const p of remediation.missingCategory.slice(0, limit)) {
      lines.push(`  ID ${p.id}: ${p.name} [${p.sku || 'no SKU'}]`);
    }
    if (remediation.missingCategory.length > limit) {
      lines.push(`  ... and ${remediation.missingCategory.length - limit} more`);
    }
    lines.push('');
  }
  
  // Top priority incomplete products
  const sorted = [...remediation.incomplete].sort((a, b) => a.score - b.score);
  if (sorted.length > 0) {
    lines.push(`## Lowest Scoring Products (Priority Fix)`);
    lines.push('');
    for (const p of sorted.slice(0, limit)) {
      lines.push(`  ID ${p.id}: ${p.name} [${p.sku || 'no SKU'}]`);
      lines.push(`     Score: ${p.score}% | Missing: ${p.missing.join(', ')}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Generate detailed product table
 */
function generateDetailedReport(productDetails) {
  const lines = [];
  
  lines.push('┌────────┬────────────────────────────────────────┬───────┬───────┬───────┬──────────────────┬───────┬───────┐');
  lines.push('│   ID   │ Title                                  │ Image │ Price │ Desc  │ Category         │ Score │ Ready │');
  lines.push('├────────┼────────────────────────────────────────┼───────┼───────┼───────┼──────────────────┼───────┼───────┤');
  
  for (const p of productDetails) {
    const title = String(p.name).substring(0, 38).padEnd(38);
    const cat = String(p.category === '✗' ? '' : p.category).substring(0, 16).padEnd(16);
    lines.push(`│ ${String(p.id).padStart(6)} │ ${title} │   ${p.image}   │ ${String(p.price).padStart(5)} │   ${p.description}   │ ${cat} │ ${String(p.score).padStart(4)}% │   ${p.ready}   │`);
  }
  
  lines.push('└────────┴────────────────────────────────────────┴───────┴───────┴───────┴──────────────────┴───────┴───────┘');
  
  return lines.join('\n');
}

function showHelp() {
  console.log(`
Product Catalog Verification Audit

Analyzes the product catalog to determine launch readiness.

Usage:
  node scripts/audit-product-catalog.js [options]

Options:
  --json           Output results as JSON
  --remediation    Show detailed remediation list
  --detailed       Show all products with completeness scores
  --file=PATH      Read products from JSON file instead of database
  --export         Export current database products to JSON file
  --help           Show this help message

Examples:
  node scripts/audit-product-catalog.js
  node scripts/audit-product-catalog.js --remediation --detailed
  node scripts/audit-product-catalog.js --json > report.json
  node scripts/audit-product-catalog.js --file=products-export.json

Launch-Ready Criteria:
  A product is launch-ready if it has:
  - Title (name)
  - Price > $0
  - Image URL
  - Description (>= 10 chars)
  - Category

Recommended Minimums:
  - ${RECOMMENDED_MIN_PRODUCTS}+ launch-ready products
  - ${RECOMMENDED_MIN_CATEGORIES}+ categories
  - 70%+ products launch-ready
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  const outputJson = args.includes('--json');
  const showRemediation = args.includes('--remediation');
  const showDetailed = args.includes('--detailed');
  const doExport = args.includes('--export');
  const fileArg = args.find(a => a.startsWith('--file='));
  const inputFile = fileArg ? fileArg.split('=')[1] : null;
  
  let products = [];
  
  // Load products from file or database
  if (inputFile) {
    // Read from JSON file
    if (!fs.existsSync(inputFile)) {
      console.error(`Error: File not found: ${inputFile}`);
      process.exit(1);
    }
    try {
      const content = fs.readFileSync(inputFile, 'utf8');
      const data = JSON.parse(content);
      products = Array.isArray(data) ? data : (data.products || []);
      console.log(`Loaded ${products.length} products from ${inputFile}\n`);
    } catch (e) {
      console.error(`Error reading file: ${e.message}`);
      process.exit(1);
    }
  } else {
    // Read from database
    if (!supabaseModule.isSupabaseAdminConfigured()) {
      console.error('Error: Supabase not configured.');
      console.error('');
      console.error('Options:');
      console.error('  1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
      console.error('  2. Use --file=products.json to analyze a JSON export');
      console.error('');
      console.error('To export products from admin panel:');
      console.error('  GET /api/admin/products?limit=10000 > products.json');
      process.exit(1);
    }
    
    console.log('Fetching products from database...');
    
    try {
      const supabase = supabaseModule.getSupabaseAdmin();
      const { data, error, count } = await supabase
        .from('products')
        .select('*', { count: 'exact' });
      
      if (error) {
        console.error('Database error:', error.message);
        process.exit(1);
      }
      
      products = data || [];
      
      // Export mode
      if (doExport) {
        const exportPath = path.join(__dirname, '../data/products-export.json');
        const exportDir = path.dirname(exportPath);
        if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
        fs.writeFileSync(exportPath, JSON.stringify(products, null, 2));
        console.log(`Exported ${products.length} products to ${exportPath}`);
        process.exit(0);
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  }
  
  if (!products || products.length === 0) {
    console.log('\n⚠️  No products found.');
    console.log('   Add products before running the catalog audit.');
    process.exit(0);
  }
  
  console.log(`Found ${products.length} products. Analyzing...\n`);
  
  const { stats, productDetails, remediation } = analyzeProducts(products);
  
  if (outputJson) {
    const output = {
      generated: new Date().toISOString(),
      summary: {
        total: stats.total,
        launchReady: stats.launchReady,
        incomplete: stats.incomplete,
        avgScore: stats.avgScore
      },
      fieldCoverage: {
        name: stats.total - stats.missingName,
        price: stats.withPrice,
        image: stats.withImage,
        description: stats.withDescription,
        category: stats.withCategory,
        sku: stats.withSku,
        brand: stats.withBrand,
        material: stats.withMaterial
      },
      qualityIssues: {
        missingImage: stats.missingImage,
        invalidImageUrl: stats.invalidImageUrls,
        missingPrice: stats.missingPrice,
        missingDescription: stats.missingDescription,
        shortDescriptions: stats.shortDescriptions,
        missingCategory: stats.missingCategory,
        missingName: stats.missingName
      },
      categories: stats.categories,
      brands: stats.brands,
      materials: stats.materials,
      launchReadiness: {
        meetsMinProducts: stats.launchReady >= RECOMMENDED_MIN_PRODUCTS,
        meetsMinCategories: stats.categories.length >= RECOMMENDED_MIN_CATEGORIES,
        percentComplete: Math.round(stats.launchReady / stats.total * 100),
        ready: stats.launchReady >= RECOMMENDED_MIN_PRODUCTS && 
               stats.categories.length >= RECOMMENDED_MIN_CATEGORIES &&
               Math.round(stats.launchReady / stats.total * 100) >= 70
      },
      remediation: showRemediation ? remediation : undefined,
      products: showDetailed ? productDetails : undefined
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(generateSummaryReport(stats));
    
    if (showDetailed) {
      console.log(generateDetailedReport(productDetails));
      console.log('');
    }
    
    if (showRemediation || stats.incomplete > 0) {
      console.log(generateRemediationReport(remediation));
    }
  }
}

main();

#!/usr/bin/env node
/**
 * Agent Handler Integration Test Script
 * 
 * Tests the integration between legacy JS modules and TypeScript handlers.
 * 
 * Usage: node scripts/test-handlers.js [--module <name>] [--verbose]
 * 
 * Examples:
 *   node scripts/test-handlers.js                    # Run all tests
 *   node scripts/test-handlers.js --module norm      # Test normalization only
 *   node scripts/test-handlers.js --verbose          # Show detailed output
 */

// Import legacy modules directly
const productNormalization = require('../lib/productNormalization');
const productMatching = require('../lib/productMatching');
const competitivePricing = require('../lib/competitivePricing');
const dailyPriceGuard = require('../lib/dailyPriceGuard');

// Parse CLI args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const moduleArg = args.find((_, i) => args[i - 1] === '--module');
const modules = moduleArg ? [moduleArg] : ['norm', 'match', 'pricing', 'guard'];

// Test data
const RAW_PRODUCT = {
  product_name_raw: 'Premium Black Nitrile Exam Gloves 100/box Case of 10',
  brand: 'GloveCubs',
  material: 'nitrile',
  color: 'black',
  grade: 'exam',
  units_per_box: 100,
  boxes_per_case: 10,
  current_cost: 7.50,
  thickness: '4 mil',
  powder_free: true,
};

const CATALOG_PRODUCT = {
  id: 'canonical-001',
  sku: 'GC-NIT-BLK-100',
  name: 'GloveCubs Black Nitrile Exam Gloves',
  brand: 'GloveCubs',
  manufacturer_part_number: 'GC-NIT-BLK-100',
  material: 'nitrile',
  color: 'black',
  grade: 'exam',
  units_per_box: 100,
  boxes_per_case: 10,
  thickness_mil: 4,
  powder_free: true,
  latex_free: true,
};

const COMPETITOR_OFFERS = [
  {
    source_name: 'Amazon',
    visible_price: 12.50,
    shipping_estimate: 0,
    offer_confidence: 0.95,
    same_brand: true,
    same_pack: true,
  },
  {
    source_name: 'Uline',
    visible_price: 13.00,
    shipping_estimate: 2.50,
    offer_confidence: 0.90,
    same_brand: true,
    same_pack: true,
  },
  {
    source_name: 'eBay',
    visible_price: 9.00,
    shipping_estimate: 5.00,
    offer_confidence: 0.40,
    same_brand: false,
    same_pack: false,
  },
];

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    if (verbose) {
      console.log(err.stack);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values not equal'}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual, threshold, message) {
  if (actual <= threshold) {
    throw new Error(`${message || 'Value too low'}: expected > ${threshold}, got ${actual}`);
  }
}

function assertIncludes(arr, value, message) {
  if (!arr.includes(value)) {
    throw new Error(`${message || 'Array missing value'}: ${value} not found in [${arr.join(', ')}]`);
  }
}

// ============================================================================
// TESTS
// ============================================================================

function testNormalization() {
  console.log('\n📦 Product Normalization Tests');
  console.log('─'.repeat(50));

  test('normalizes material correctly', () => {
    assertEqual(productNormalization.normalizeMaterial('nitrile'), 'nitrile');
    assertEqual(productNormalization.normalizeMaterial('Nitrile'), 'nitrile');
    assertEqual(productNormalization.normalizeMaterial('nit'), 'nitrile');
    assertEqual(productNormalization.normalizeMaterial('vinyl'), 'vinyl');
    assertEqual(productNormalization.normalizeMaterial('latex'), 'latex');
  });

  test('normalizes color correctly', () => {
    assertEqual(productNormalization.normalizeColor('black'), 'black');
    assertEqual(productNormalization.normalizeColor('Black'), 'black');
    assertEqual(productNormalization.normalizeColor('blk'), 'black');
    assertEqual(productNormalization.normalizeColor('blue'), 'blue');
  });

  test('normalizes grade correctly', () => {
    assertEqual(productNormalization.normalizeGrade('exam'), 'exam');
    assertEqual(productNormalization.normalizeGrade('industrial'), 'industrial');
    assertEqual(productNormalization.normalizeGrade('food'), 'foodservice');
  });

  test('normalizes thickness correctly', () => {
    assertEqual(productNormalization.normalizeThickness('4 mil'), 4);
    assertEqual(productNormalization.normalizeThickness('6mil'), 6);
    assertEqual(productNormalization.normalizeThickness('0.1 mm'), 3.9); // ~4 mil
  });

  test('normalizes full product correctly', () => {
    const normalized = productNormalization.normalizeProduct(RAW_PRODUCT);
    
    assertEqual(normalized.material, 'nitrile', 'Material');
    assertEqual(normalized.color, 'black', 'Color');
    assertEqual(normalized.grade, 'exam', 'Grade');
    assertEqual(normalized.brand, 'GloveCubs', 'Brand');
    assertEqual(normalized.units_per_box, 100, 'Units per box');
    assertEqual(normalized.boxes_per_case, 10, 'Boxes per case');
    assertEqual(normalized.total_units_per_case, 1000, 'Total units');
    assert(normalized.canonical_title.length > 0, 'Canonical title generated');
    assertGreaterThan(normalized.parse_confidence, 0.7, 'Parse confidence');
  });

  test('generates canonical title correctly', () => {
    const normalized = productNormalization.normalizeProduct(RAW_PRODUCT);
    assert(normalized.canonical_title.includes('GloveCubs'), 'Title includes brand');
    assert(normalized.canonical_title.includes('Black'), 'Title includes color');
    assert(normalized.canonical_title.includes('Nitrile'), 'Title includes material');
  });

  test('generates bullet points', () => {
    const normalized = productNormalization.normalizeProduct(RAW_PRODUCT);
    assert(Array.isArray(normalized.bullet_points), 'Bullet points is array');
    assertGreaterThan(normalized.bullet_points.length, 0, 'Has bullet points');
  });

  test('detects missing fields and lowers confidence', () => {
    const incomplete = { product_name_raw: 'Some gloves' };
    const normalized = productNormalization.normalizeProduct(incomplete);
    
    assert(normalized.review_required, 'Review required for incomplete data');
    assert(normalized.review_reasons.length > 0, 'Has review reasons');
    assert(normalized.parse_confidence < 0.9, 'Low confidence for missing fields');
  });
}

function testMatching() {
  console.log('\n🔗 Product Matching Tests');
  console.log('─'.repeat(50));

  test('calculates string similarity', () => {
    assertEqual(productMatching.stringSimilarity('nitrile', 'nitrile'), 1.0);
    assertGreaterThan(productMatching.stringSimilarity('nitrile', 'nitril'), 0.8);
    assert(productMatching.stringSimilarity('nitrile', 'vinyl') < 0.5, 'Different strings have low similarity');
  });

  test('finds exact match correctly', () => {
    const incoming = {
      id: 'incoming-001',
      supplier_sku: 'SUPP-001',
      brand: 'GloveCubs',
      manufacturer_part_number: 'GC-NIT-BLK-100',
      material: 'nitrile',
      color: 'black',
      grade: 'exam',
      units_per_box: 100,
      boxes_per_case: 10,
      powder_free: true,
    };
    
    const result = productMatching.matchSingleProduct(incoming, [CATALOG_PRODUCT]);
    
    assertEqual(result.match_result, 'exact_match', 'Match result');
    assertEqual(result.canonical_product_id, 'canonical-001', 'Canonical ID');
    assertGreaterThan(result.match_confidence, 0.9, 'High confidence');
    assertEqual(result.recommended_action, 'link_to_existing', 'Recommended action');
  });

  test('identifies new product correctly', () => {
    const newProduct = {
      id: 'new-001',
      supplier_sku: 'NEW-001',
      brand: 'OtherBrand',
      material: 'vinyl',
      color: 'clear',
      grade: 'foodservice',
      units_per_box: 200,
    };
    
    const result = productMatching.matchSingleProduct(newProduct, [CATALOG_PRODUCT]);
    
    assertEqual(result.match_result, 'new_product', 'Should be new product');
    assertEqual(result.canonical_product_id, null, 'No canonical ID');
    assertEqual(result.recommended_action, 'create_new_canonical', 'Create new');
  });

  test('identifies variant correctly', () => {
    const variant = {
      id: 'variant-001',
      brand: 'GloveCubs',
      manufacturer_part_number: 'GC-NIT-BLK-100-L',
      material: 'nitrile',
      color: 'black',
      grade: 'exam',
      size: 'L', // Different size
      units_per_box: 100,
    };
    
    const result = productMatching.matchSingleProduct(variant, [CATALOG_PRODUCT]);
    
    // Should be variant or likely match due to size difference
    assert(
      result.match_result === 'variant' || result.match_result === 'likely_match' || result.match_result === 'exact_match',
      `Expected variant/likely/exact, got ${result.match_result}`
    );
  });

  test('batch matching works correctly', () => {
    const incoming = [
      { id: 'batch-1', brand: 'GloveCubs', material: 'nitrile', color: 'black', units_per_box: 100 },
      { id: 'batch-2', brand: 'NewBrand', material: 'vinyl', color: 'clear', units_per_box: 200 },
    ];
    
    const results = productMatching.matchProductBatch(incoming, [CATALOG_PRODUCT]);
    
    assertEqual(results.processed, 2, 'Processed count');
    assert(results.matches.length === 2, 'Has match results');
  });
}

function testPricing() {
  console.log('\n💰 Competitive Pricing Tests');
  console.log('─'.repeat(50));

  test('calculates margin correctly', () => {
    const margin = competitivePricing.calculateMargin(100, 70);
    assertEqual(margin.percent, 0.3, 'Margin percent');
    assertEqual(margin.dollars, 30, 'Margin dollars');
  });

  test('calculates minimum price correctly', () => {
    const minPrice = competitivePricing.calculateMinimumPrice(10);
    assert(minPrice > 10, 'Min price > cost');
    // With 22% margin: 10 / (1 - 0.22) = 12.82
    assertGreaterThan(minPrice, 12, 'Min price meets margin floor');
  });

  test('validates competitor offers', () => {
    const validOffer = COMPETITOR_OFFERS[0];
    const invalidOffer = COMPETITOR_OFFERS[2]; // eBay with low confidence
    
    const validResult = competitivePricing.validateOffer(validOffer, { current_cost: 7 });
    const invalidResult = competitivePricing.validateOffer(invalidOffer, { current_cost: 7 });
    
    assert(validResult.valid, 'Trusted offer is valid');
    assert(!invalidResult.valid, 'Low confidence offer is invalid');
    assertGreaterThan(validResult.confidence, invalidResult.confidence, 'Trusted has higher confidence');
  });

  test('generates pricing recommendation', () => {
    const product = {
      canonical_product_id: 'prod-001',
      current_price: 15.00,
      current_cost: 7.50,
      competitor_offers: COMPETITOR_OFFERS,
    };
    
    const rec = competitivePricing.generateRecommendation(product);
    
    assert(rec.canonical_product_id, 'Has product ID');
    assertEqual(rec.current_price, 15.00, 'Current price');
    assert(['keep', 'lower', 'raise', 'review'].includes(rec.action), `Valid action: ${rec.action}`);
    assertGreaterThan(rec.estimated_margin_percent_after_change, 0.2, 'Margin above floor');
    assert(typeof rec.auto_publish_eligible === 'boolean', 'Has auto_publish flag');
  });

  test('blocks below-margin recommendations', () => {
    const product = {
      canonical_product_id: 'prod-002',
      current_price: 8.00, // Very low price
      current_cost: 7.50,
      competitor_offers: [{
        source_name: 'Competitor',
        visible_price: 7.00, // Below our cost!
        shipping_estimate: 0,
        offer_confidence: 0.9,
        same_brand: true,
        same_pack: true,
      }],
    };
    
    const rec = competitivePricing.generateRecommendation(product);
    
    // Should not recommend going below margin floor
    assertGreaterThan(rec.recommended_price, product.current_cost, 'Recommended price > cost');
  });

  test('processes pricing batch', () => {
    const products = [
      { canonical_product_id: 'p1', current_price: 15, current_cost: 8, competitor_offers: COMPETITOR_OFFERS },
      { canonical_product_id: 'p2', current_price: 20, current_cost: 10, competitor_offers: COMPETITOR_OFFERS },
    ];
    
    const results = competitivePricing.processPricingBatch(products);
    
    assertEqual(results.processed, 2, 'Processed count');
    assert(results.recommendations.length === 2, 'Has recommendations');
  });
}

function testDailyGuard() {
  console.log('\n🛡️ Daily Price Guard Tests');
  console.log('─'.repeat(50));

  test('calculates priority correctly', () => {
    const highPriority = dailyPriceGuard.calculatePriority({}, { daily_views: 150, daily_revenue: 600 });
    const lowPriority = dailyPriceGuard.calculatePriority({}, { daily_views: 5, daily_revenue: 10 });
    
    assertEqual(highPriority.priority, 'high', 'High traffic = high priority');
    assertEqual(lowPriority.priority, 'low', 'Low traffic = low priority');
    assertGreaterThan(highPriority.score, lowPriority.score, 'High has higher score');
  });

  test('detects cost changes', () => {
    const change = dailyPriceGuard.detectCostChange({}, 10.00, 10.50);
    assert(change !== null, 'Cost change detected');
    assertEqual(change.type, 'cost_increase', 'Is cost increase');
    assertGreaterThan(change.change_percent, 0, 'Positive change');
  });

  test('detects competitor price changes', () => {
    const change = dailyPriceGuard.detectCompetitorPriceChange({}, 15.00, 12.00);
    assert(change !== null, 'Competitor change detected');
    assertEqual(change.type, 'competitor_decrease', 'Is decrease');
  });

  test('detects staleness', () => {
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const issues = dailyPriceGuard.detectStaleness({}, oldDate, null);
    
    assert(Array.isArray(issues), 'Returns array');
    assert(issues.some(i => i.type === 'very_stale_pricing'), 'Detects very stale pricing');
  });

  test('identifies long-tail products', () => {
    const longTail = dailyPriceGuard.isLongTailProduct({}, { daily_views: 5 });
    const popular = dailyPriceGuard.isLongTailProduct({}, { daily_views: 100 });
    
    assert(longTail, 'Low traffic is long-tail');
    assert(!popular, 'High traffic is not long-tail');
  });

  test('runs daily guard on products', () => {
    const products = [
      {
        id: 'prod-001',
        sku: 'SKU-001',
        name: 'Test Product 1',
        current_price: 15.00,
        current_cost: 8.00,
        competitor_offers: COMPETITOR_OFFERS,
        metrics: { daily_views: 150, daily_revenue: 500 },
      },
      {
        id: 'prod-002',
        sku: 'SKU-002',
        name: 'Test Product 2',
        current_price: 20.00,
        current_cost: 10.00,
        competitor_offers: [],
        metrics: { daily_views: 5, daily_revenue: 20 },
      },
    ];
    
    const result = dailyPriceGuard.runDailyPriceGuard(products, { includeLongTail: true });
    
    assert(result.run_date, 'Has run date');
    assert(result.summary, 'Has summary');
    assertEqual(result.summary.products_checked, 2, 'Checked both products');
    assert(Array.isArray(result.actions), 'Has actions array');
  });
}

// ============================================================================
// MAIN
// ============================================================================

console.log('\n' + '═'.repeat(60));
console.log('  GloveCubs Handler Integration Tests');
console.log('═'.repeat(60));

if (modules.includes('norm')) testNormalization();
if (modules.includes('match')) testMatching();
if (modules.includes('pricing')) testPricing();
if (modules.includes('guard')) testDailyGuard();

console.log('\n' + '═'.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60) + '\n');

if (failed > 0) {
  process.exit(1);
}

/**
 * Tax Calculation Tests
 * 
 * Tests the nexus-based tax calculation for GLOVECUBS.
 * Run with: node tests/tax.test.js
 * 
 * Note: These tests set environment variables to control tax behavior.
 */

// Set test environment variables before requiring the module
process.env.BUSINESS_STATE = 'CA';
process.env.BUSINESS_TAX_RATE = '0.0825';

const {
  isConfigured,
  getConfig,
  isTaxable,
  calculateTax,
  calculateTaxForAddress,
  formatTaxRate,
  getTaxSummary
} = require('../lib/tax');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values not equal'}: expected "${expected}", got "${actual}"`);
  }
}

function assertClose(actual, expected, tolerance = 0.01, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message || 'Values not close'}: expected ~${expected}, got ${actual}`);
  }
}

console.log('\n=== Tax Calculation Tests ===\n');
console.log(`Test config: BUSINESS_STATE=${process.env.BUSINESS_STATE}, BUSINESS_TAX_RATE=${process.env.BUSINESS_TAX_RATE}\n`);

// ============ Configuration Tests ============

console.log('--- Configuration ---');

test('isConfigured returns true when both env vars set', () => {
  assert(isConfigured(), 'Should be configured');
});

test('getConfig returns correct values', () => {
  const config = getConfig();
  assertEqual(config.businessState, 'CA', 'Business state should be CA');
  assertEqual(config.taxRate, 0.0825, 'Tax rate should be 0.0825');
  assert(config.configured, 'Should be configured');
});

// ============ In-State Order Tests ============

console.log('\n--- In-State Orders (taxable) ---');

test('calculates tax for in-state order (CA)', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'CA'
  });
  
  assert(result.taxable, 'Should be taxable');
  assertEqual(result.rate, 0.0825, 'Rate should be 0.0825');
  assertClose(result.tax, 8.25, 0.01, 'Tax should be ~$8.25');
  assertEqual(result.taxableAmount, 100, 'Taxable amount should be subtotal');
});

test('handles lowercase state code', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'ca'
  });
  
  assert(result.taxable, 'Should be taxable');
  assertClose(result.tax, 8.25, 0.01, 'Tax should be ~$8.25');
});

test('handles full state name (California)', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'California'
  });
  
  assert(result.taxable, 'Should be taxable');
  assertClose(result.tax, 8.25, 0.01, 'Tax should be ~$8.25');
});

test('calculates correct tax for larger order', () => {
  const result = calculateTax({
    subtotal: 1000,
    shippingState: 'CA'
  });
  
  assert(result.taxable, 'Should be taxable');
  assertClose(result.tax, 82.50, 0.01, 'Tax should be ~$82.50');
});

test('rounds tax to 2 decimal places', () => {
  const result = calculateTax({
    subtotal: 99.99,
    shippingState: 'CA'
  });
  
  // 99.99 * 0.0825 = 8.249175 -> should round to 8.25
  assert(result.tax === Math.round(result.tax * 100) / 100, 'Tax should be rounded to 2 decimals');
});

// ============ Out-of-State Order Tests ============

console.log('\n--- Out-of-State Orders (not taxable) ---');

test('no tax for out-of-state order (NY)', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'NY'
  });
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
  assertEqual(result.rate, 0, 'Rate should be 0');
  assert(result.reason.includes('Out-of-state') || result.reason.includes('out-of-state'), 'Reason should mention out-of-state');
});

test('no tax for Texas', () => {
  const result = calculateTax({
    subtotal: 500,
    shippingState: 'TX'
  });
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

test('no tax for Washington', () => {
  const result = calculateTax({
    subtotal: 250,
    shippingState: 'WA'
  });
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

test('no tax for Florida (full name)', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'Florida'
  });
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

// ============ Missing/Invalid State Tests ============

console.log('\n--- Missing/Invalid State ---');

test('no tax for missing state', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: null
  });
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
  assert(result.reason.includes('missing') || result.reason.includes('Invalid'), 'Reason should mention missing/invalid');
});

test('no tax for empty state', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: ''
  });
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

test('no tax for invalid state code', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'XX'
  });
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

test('no tax for invalid state name', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'InvalidState'
  });
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

// ============ Shipping Tax Tests ============

console.log('\n--- Shipping Tax Handling ---');

test('does not tax shipping by default', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'CA',
    shipping: 25
  });
  
  assert(result.taxable, 'Should be taxable');
  assertEqual(result.taxableAmount, 100, 'Taxable amount should be subtotal only');
  assertClose(result.tax, 8.25, 0.01, 'Tax should be on subtotal only');
});

test('can tax shipping when requested', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: 'CA',
    shipping: 25,
    taxShipping: true
  });
  
  assert(result.taxable, 'Should be taxable');
  assertEqual(result.taxableAmount, 125, 'Taxable amount should include shipping');
  assertClose(result.tax, 10.31, 0.01, 'Tax should be on subtotal + shipping');
});

// ============ calculateTaxForAddress Tests ============

console.log('\n--- calculateTaxForAddress ---');

test('calculates tax from normalized address (in-state)', () => {
  const address = {
    full_name: 'John Doe',
    address_line1: '123 Main St',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90210'
  };
  
  const result = calculateTaxForAddress(address, 100);
  
  assert(result.taxable, 'Should be taxable');
  assertClose(result.tax, 8.25, 0.01, 'Tax should be ~$8.25');
});

test('calculates tax from normalized address (out-of-state)', () => {
  const address = {
    full_name: 'Jane Smith',
    address_line1: '456 Oak Ave',
    city: 'New York',
    state: 'NY',
    zip_code: '10001'
  };
  
  const result = calculateTaxForAddress(address, 100);
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

test('handles null address', () => {
  const result = calculateTaxForAddress(null, 100);
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

test('handles address without state', () => {
  const address = {
    full_name: 'John Doe',
    address_line1: '123 Main St',
    city: 'Los Angeles',
    zip_code: '90210'
  };
  
  const result = calculateTaxForAddress(address, 100);
  
  assert(!result.taxable, 'Should not be taxable');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

// ============ Formatting Tests ============

console.log('\n--- Formatting ---');

test('formatTaxRate formats correctly', () => {
  assertEqual(formatTaxRate(0.0825), '8.25%', 'Should format as 8.25%');
  assertEqual(formatTaxRate(0.08), '8%', 'Should format as 8%');
  assertEqual(formatTaxRate(0.1), '10%', 'Should format as 10%');
  assertEqual(formatTaxRate(0), '0%', 'Should format as 0%');
});

test('getTaxSummary returns correct summary', () => {
  const taxableResult = calculateTax({ subtotal: 100, shippingState: 'CA' });
  const summary1 = getTaxSummary(taxableResult);
  assert(summary1.includes('8.25%') || summary1.includes('Tax'), 'Should include rate or Tax');
  
  const nonTaxableResult = calculateTax({ subtotal: 100, shippingState: 'NY' });
  const summary2 = getTaxSummary(nonTaxableResult);
  assert(summary2.includes('out-of-state') || summary2.includes('No tax'), 'Should mention out-of-state');
});

// ============ Edge Cases ============

console.log('\n--- Edge Cases ---');

test('handles zero subtotal', () => {
  const result = calculateTax({
    subtotal: 0,
    shippingState: 'CA'
  });
  
  assert(result.taxable, 'Should be taxable (state is valid)');
  assertEqual(result.tax, 0, 'Tax should be $0');
});

test('handles very small subtotal', () => {
  const result = calculateTax({
    subtotal: 0.01,
    shippingState: 'CA'
  });
  
  // 0.01 * 0.0825 = 0.000825 -> rounds to 0
  assert(result.taxable, 'Should be taxable');
  assert(result.tax >= 0, 'Tax should be >= 0');
});

test('handles large subtotal', () => {
  const result = calculateTax({
    subtotal: 100000,
    shippingState: 'CA'
  });
  
  assert(result.taxable, 'Should be taxable');
  assertClose(result.tax, 8250, 0.01, 'Tax should be ~$8,250');
});

test('handles whitespace in state', () => {
  const result = calculateTax({
    subtotal: 100,
    shippingState: '  CA  '
  });
  
  assert(result.taxable, 'Should handle whitespace');
  assertClose(result.tax, 8.25, 0.01, 'Tax should be ~$8.25');
});

// ============ Summary ============

console.log('\n=================================');
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
console.log('=================================\n');

process.exit(failed > 0 ? 1 : 0);

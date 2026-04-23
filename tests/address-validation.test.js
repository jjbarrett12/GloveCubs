/**
 * Address Validation Tests
 * 
 * Tests the address validation library for GLOVECUBS checkout.
 * Run with: node tests/address-validation.test.js
 */

const {
  validateAddress,
  normalizeState,
  normalizeZip,
  normalizeAddress,
  parseAddressDisplay,
  getErrorMessage,
  getErrorsByField
} = require('../lib/address-validation');

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

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message || 'Objects not equal'}:\nExpected: ${expectedStr}\nActual: ${actualStr}`);
  }
}

console.log('\n=== Address Validation Tests ===\n');

// ============ validateAddress tests ============

console.log('--- validateAddress ---');

test('validates a complete valid address', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main Street',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90210'
  });
  assert(result.valid, 'Should be valid');
  assertEqual(result.errors.length, 0, 'Should have no errors');
});

test('rejects empty address object', () => {
  const result = validateAddress({});
  assert(!result.valid, 'Should be invalid');
  assert(result.errors.length >= 5, 'Should have multiple errors');
});

test('rejects null address', () => {
  const result = validateAddress(null);
  assert(!result.valid, 'Should be invalid');
});

test('rejects missing city', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main Street',
    state: 'CA',
    zip_code: '90210'
  });
  assert(!result.valid, 'Should be invalid');
  const cityError = result.errors.find(e => e.field === 'city');
  assert(cityError, 'Should have city error');
  assertEqual(cityError.message, 'City is required', 'Should have correct message');
});

test('rejects short city name', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main Street',
    city: 'X',
    state: 'CA',
    zip_code: '90210'
  });
  assert(!result.valid, 'Should be invalid');
  const cityError = result.errors.find(e => e.field === 'city');
  assert(cityError, 'Should have city error');
  assert(cityError.message.includes('at least 2'), 'Should mention minimum length');
});

test('rejects invalid ZIP code', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main Street',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '1234'
  });
  assert(!result.valid, 'Should be invalid');
  const zipError = result.errors.find(e => e.field === 'zip_code');
  assert(zipError, 'Should have ZIP error');
});

test('rejects empty address line', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90210'
  });
  assert(!result.valid, 'Should be invalid');
  const addrError = result.errors.find(e => e.field === 'address_line1');
  assert(addrError, 'Should have address error');
  assertEqual(addrError.message, 'Street address is required', 'Should have correct message');
});

test('rejects short address line', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '123',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90210'
  });
  assert(!result.valid, 'Should be invalid');
  const addrError = result.errors.find(e => e.field === 'address_line1');
  assert(addrError, 'Should have address error');
  assert(addrError.message.includes('at least 5'), 'Should mention minimum length');
});

test('rejects invalid state abbreviation', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main Street',
    city: 'Los Angeles',
    state: 'XX',
    zip_code: '90210'
  });
  assert(!result.valid, 'Should be invalid');
  const stateError = result.errors.find(e => e.field === 'state');
  assert(stateError, 'Should have state error');
});

test('accepts full state name', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main Street',
    city: 'Los Angeles',
    state: 'California',
    zip_code: '90210'
  });
  assert(result.valid, 'Should be valid with full state name');
});

test('accepts 9-digit ZIP code', () => {
  const result = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main Street',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90210-1234'
  });
  assert(result.valid, 'Should accept ZIP+4');
});

test('accepts alternate field names (contact_name, address)', () => {
  const result = validateAddress({
    contact_name: 'Jane Smith',
    address: '456 Oak Avenue',
    city: 'New York',
    state: 'NY',
    zip: '10001'
  });
  assert(result.valid, 'Should accept alternate field names');
});

// ============ normalizeState tests ============

console.log('\n--- normalizeState ---');

test('normalizes state abbreviation to uppercase', () => {
  const result = normalizeState('ca');
  assert(result.valid, 'Should be valid');
  assertEqual(result.value, 'CA', 'Should be uppercase');
});

test('accepts already uppercase abbreviation', () => {
  const result = normalizeState('TX');
  assert(result.valid, 'Should be valid');
  assertEqual(result.value, 'TX', 'Should remain TX');
});

test('converts full state name to abbreviation', () => {
  const result = normalizeState('New York');
  assert(result.valid, 'Should be valid');
  assertEqual(result.value, 'NY', 'Should convert to NY');
});

test('handles lowercase full state name', () => {
  const result = normalizeState('california');
  assert(result.valid, 'Should be valid');
  assertEqual(result.value, 'CA', 'Should convert to CA');
});

test('rejects invalid state', () => {
  const result = normalizeState('InvalidState');
  assert(!result.valid, 'Should be invalid');
  assert(result.error.includes('not a valid US state'), 'Should have error message');
});

test('rejects empty state', () => {
  const result = normalizeState('');
  assert(!result.valid, 'Should be invalid');
});

test('handles DC', () => {
  const result = normalizeState('dc');
  assert(result.valid, 'Should be valid');
  assertEqual(result.value, 'DC', 'Should normalize to DC');
});

test('handles Puerto Rico', () => {
  const result = normalizeState('PR');
  assert(result.valid, 'Should be valid');
  assertEqual(result.value, 'PR', 'Should be PR');
});

// ============ normalizeZip tests ============

console.log('\n--- normalizeZip ---');

test('normalizes 5-digit ZIP', () => {
  const result = normalizeZip('90210');
  assertEqual(result, '90210', 'Should return 5-digit ZIP');
});

test('normalizes 9-digit ZIP with dash', () => {
  const result = normalizeZip('90210-1234');
  assertEqual(result, '90210-1234', 'Should keep ZIP+4 format');
});

test('normalizes 9-digit ZIP without dash', () => {
  const result = normalizeZip('902101234');
  assertEqual(result, '90210-1234', 'Should add dash');
});

test('handles ZIP with spaces', () => {
  const result = normalizeZip(' 90210 ');
  assertEqual(result, '90210', 'Should trim spaces');
});

test('returns null for invalid ZIP', () => {
  const result = normalizeZip('invalid');
  assertEqual(result, null, 'Should return null');
});

// ============ normalizeAddress tests ============

console.log('\n--- normalizeAddress ---');

test('normalizes complete address', () => {
  const result = normalizeAddress({
    full_name: 'John Doe',
    company_name: 'Acme Corp',
    address_line1: '123 Main St',
    address_line2: 'Suite 100',
    city: 'Los Angeles',
    state: 'ca',
    zip_code: '90210',
    phone: '555-1234'
  });
  
  assertEqual(result.full_name, 'John Doe', 'Name should be preserved');
  assertEqual(result.company_name, 'Acme Corp', 'Company should be preserved');
  assertEqual(result.address_line1, '123 Main St', 'Address should be preserved');
  assertEqual(result.state, 'CA', 'State should be normalized to uppercase');
  assertEqual(result.country, 'US', 'Country should be US');
  assert(result.display.includes('John Doe'), 'Display should include name');
  assert(result.display.includes('Los Angeles'), 'Display should include city');
});

test('handles alternate field names', () => {
  const result = normalizeAddress({
    contact_name: 'Jane Smith',
    address: '456 Oak Ave',
    city: 'Chicago',
    state: 'IL',
    postal_code: '60601'
  });
  
  assertEqual(result.full_name, 'Jane Smith', 'Should use contact_name');
  assertEqual(result.address_line1, '456 Oak Ave', 'Should use address');
  assertEqual(result.zip_code, '60601', 'Should use postal_code');
});

test('builds correct display string', () => {
  const result = normalizeAddress({
    full_name: 'John Doe',
    address_line1: '123 Main St',
    city: 'Denver',
    state: 'CO',
    zip_code: '80202'
  });
  
  const lines = result.display.split('\n');
  assert(lines.length >= 3, 'Should have multiple lines');
  assert(lines.some(l => l.includes('Denver')), 'Should include city');
  assert(lines.some(l => l.includes('CO')), 'Should include state');
  assert(lines.some(l => l.includes('80202')), 'Should include ZIP');
});

// ============ parseAddressDisplay tests ============

console.log('\n--- parseAddressDisplay ---');

test('parses display string back to structured address', () => {
  const original = normalizeAddress({
    full_name: 'John Doe',
    address_line1: '123 Main St',
    city: 'Denver',
    state: 'CO',
    zip_code: '80202',
    phone: '555-1234'
  });
  
  const parsed = parseAddressDisplay(original.display);
  
  assertEqual(parsed.full_name, 'John Doe', 'Should parse name');
  assertEqual(parsed.city, 'Denver', 'Should parse city');
  assertEqual(parsed.state, 'CO', 'Should parse state');
  assertEqual(parsed.zip_code, '80202', 'Should parse ZIP');
  assertEqual(parsed.phone, '555-1234', 'Should parse phone');
});

test('handles null display string', () => {
  const result = parseAddressDisplay(null);
  assertEqual(result, null, 'Should return null');
});

// ============ getErrorMessage tests ============

console.log('\n--- getErrorMessage ---');

test('returns null for valid address', () => {
  const validation = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main St',
    city: 'Denver',
    state: 'CO',
    zip_code: '80202'
  });
  
  const msg = getErrorMessage(validation);
  assertEqual(msg, null, 'Should return null for valid');
});

test('returns combined error message', () => {
  const validation = validateAddress({
    full_name: '',
    address_line1: '',
    city: '',
    state: '',
    zip_code: ''
  });
  
  const msg = getErrorMessage(validation);
  assert(msg.includes('Contact name'), 'Should include name error');
  assert(msg.includes('Street address'), 'Should include address error');
  assert(msg.includes('City'), 'Should include city error');
});

// ============ getErrorsByField tests ============

console.log('\n--- getErrorsByField ---');

test('returns empty object for valid address', () => {
  const validation = validateAddress({
    full_name: 'John Doe',
    address_line1: '123 Main St',
    city: 'Denver',
    state: 'CO',
    zip_code: '80202'
  });
  
  const errors = getErrorsByField(validation);
  assertEqual(Object.keys(errors).length, 0, 'Should have no errors');
});

test('returns errors grouped by field', () => {
  const validation = validateAddress({
    full_name: '',
    address_line1: '123 Main St',
    city: '',
    state: 'CO',
    zip_code: '80202'
  });
  
  const errors = getErrorsByField(validation);
  assert(errors.full_name, 'Should have full_name error');
  assert(errors.city, 'Should have city error');
  assert(!errors.address_line1, 'Should not have address error');
  assert(!errors.state, 'Should not have state error');
});

// ============ Edge cases ============

console.log('\n--- Edge Cases ---');

test('trims whitespace from all fields', () => {
  const result = validateAddress({
    full_name: '  John Doe  ',
    address_line1: '  123 Main St  ',
    city: '  Denver  ',
    state: '  CO  ',
    zip_code: '  80202  '
  });
  assert(result.valid, 'Should accept addresses with extra whitespace');
});

test('handles mixed case state names', () => {
  const result = normalizeState('NEW YORK');
  assert(result.valid, 'Should handle all caps');
  assertEqual(result.value, 'NY', 'Should normalize');
});

test('validates minimum real-world address', () => {
  const result = validateAddress({
    full_name: 'Jo',
    address_line1: '1 A St',
    city: 'LA',
    state: 'CA',
    zip_code: '90001'
  });
  assert(result.valid, 'Should accept minimal but valid address');
});

// ============ Summary ============

console.log('\n=================================');
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
console.log('=================================\n');

process.exit(failed > 0 ? 1 : 0);

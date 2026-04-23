/**
 * Checkout Address API Tests
 * 
 * Tests the server-side address validation in checkout endpoints.
 * Run with: node tests/checkout-address-api.integration.js
 * (Not part of `npm test` — requires a running server.)
 * 
 * Note: Requires server to be running on localhost:3000
 */

const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
let authToken = null;
let testUserId = null;

async function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;
let skipped = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    if (err.message === 'SKIP') {
      skipped++;
      console.log(`○ ${name} (skipped)`);
    } else {
      failed++;
      console.error(`✗ ${name}`);
      console.error(`  ${err.message}`);
    }
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

async function setup() {
  console.log('\n=== Setup ===\n');
  
  // Check if server is running
  try {
    const { status } = await request('GET', '/api/config');
    if (status !== 200) throw new Error('Server not responding');
    console.log('✓ Server is running');
  } catch (err) {
    console.error('✗ Server not running at', BASE_URL);
    console.log('\nStart the server with: npm start');
    process.exit(1);
  }
  
  // Register test user
  const testEmail = `test-checkout-${Date.now()}@example.com`;
  const regResult = await request('POST', '/api/register', {
    email: testEmail,
    password: 'Test123!',
    company_name: 'Test Checkout Corp',
    contact_name: 'Test User',
    phone: '555-0100',
    address: '123 Test St',
    city: 'Testville',
    state: 'CA',
    zip: '90210'
  });
  
  if (regResult.status !== 200 && regResult.status !== 201) {
    console.error('Could not register test user:', regResult.data);
    throw new Error('Setup failed: Could not register user');
  }
  
  authToken = regResult.data.token;
  testUserId = regResult.data.user?.id;
  console.log('✓ Test user registered');
  
  // Add item to cart (find first available product)
  const productsRes = await request('GET', '/api/products?limit=1');
  if (productsRes.status !== 200 || !productsRes.data.products?.length) {
    console.log('○ No products available - some tests will be skipped');
    return;
  }
  
  const product = productsRes.data.products[0];
  const addCartRes = await request('POST', '/api/cart', {
    product_id: product.id,
    quantity: 1,
    size: 'M'
  }, authToken);
  
  if (addCartRes.status === 200) {
    console.log('✓ Item added to cart');
  } else {
    console.log('○ Could not add item to cart - some tests will be skipped');
  }
}

async function runTests() {
  console.log('\n=== Checkout Address API Tests ===\n');
  
  // Test 1: Missing shipping address
  await test('rejects order with no shipping_address', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      payment_method: 'net30',
      notes: 'Test order'
    }, authToken);
    
    assertEqual(res.status, 400, 'Should return 400');
    assert(res.data.error?.includes('address'), 'Error should mention address');
  });
  
  // Test 2: Empty address object
  await test('rejects empty address object', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      shipping_address: {},
      payment_method: 'net30'
    }, authToken);
    
    assertEqual(res.status, 400, 'Should return 400');
    assert(res.data.field_errors, 'Should have field_errors');
  });
  
  // Test 3: Missing city
  await test('rejects address missing city', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      shipping_address: {
        full_name: 'John Doe',
        address_line1: '123 Main Street',
        state: 'CA',
        zip_code: '90210'
      },
      payment_method: 'net30'
    }, authToken);
    
    assertEqual(res.status, 400, 'Should return 400');
    assert(res.data.field_errors?.city, 'Should have city error');
  });
  
  // Test 4: Invalid ZIP
  await test('rejects invalid ZIP code', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      shipping_address: {
        full_name: 'John Doe',
        address_line1: '123 Main Street',
        city: 'Los Angeles',
        state: 'CA',
        zip_code: 'INVALID'
      },
      payment_method: 'net30'
    }, authToken);
    
    assertEqual(res.status, 400, 'Should return 400');
    assert(res.data.field_errors?.zip_code, 'Should have zip_code error');
  });
  
  // Test 5: Empty address line
  await test('rejects empty address_line1', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      shipping_address: {
        full_name: 'John Doe',
        address_line1: '',
        city: 'Los Angeles',
        state: 'CA',
        zip_code: '90210'
      },
      payment_method: 'net30'
    }, authToken);
    
    assertEqual(res.status, 400, 'Should return 400');
    assert(res.data.field_errors?.address_line1, 'Should have address error');
  });
  
  // Test 6: Invalid state
  await test('rejects invalid state abbreviation', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      shipping_address: {
        full_name: 'John Doe',
        address_line1: '123 Main Street',
        city: 'Los Angeles',
        state: 'XX',
        zip_code: '90210'
      },
      payment_method: 'net30'
    }, authToken);
    
    assertEqual(res.status, 400, 'Should return 400');
    assert(res.data.field_errors?.state, 'Should have state error');
  });
  
  // Test 7: Valid address (may fail if no cart items)
  await test('accepts valid address with all required fields', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      shipping_address: {
        full_name: 'John Doe',
        address_line1: '123 Main Street',
        city: 'Los Angeles',
        state: 'CA',
        zip_code: '90210',
        phone: '555-1234'
      },
      payment_method: 'net30'
    }, authToken);
    
    // If cart is empty, we'll get a different error - that's OK, address passed
    if (res.status === 400 && res.data.error?.includes('Cart is empty')) {
      console.log('  (cart was empty, but address validation passed)');
      return;
    }
    if (res.status === 400 && res.data.error?.includes('Net 30')) {
      console.log('  (Net 30 not approved, but address validation passed)');
      return;
    }
    
    // Either success or an error NOT related to address
    assert(!res.data.field_errors, 'Should not have field validation errors');
  });
  
  // Test 8: Accepts full state name
  await test('accepts full state name (California)', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      shipping_address: {
        full_name: 'John Doe',
        address_line1: '123 Main Street',
        city: 'Los Angeles',
        state: 'California',
        zip_code: '90210'
      },
      payment_method: 'net30'
    }, authToken);
    
    // Should not have state validation error
    assert(!res.data.field_errors?.state, 'Should not have state error');
  });
  
  // Test 9: Accepts ZIP+4 format
  await test('accepts ZIP+4 format (90210-1234)', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders', {
      shipping_address: {
        full_name: 'John Doe',
        address_line1: '123 Main Street',
        city: 'Los Angeles',
        state: 'CA',
        zip_code: '90210-1234'
      },
      payment_method: 'net30'
    }, authToken);
    
    assert(!res.data.field_errors?.zip_code, 'Should not have ZIP error');
  });
  
  // Test 10: create-payment-intent endpoint validation
  await test('create-payment-intent also validates address', async () => {
    if (!authToken) throw new Error('SKIP');
    
    const res = await request('POST', '/api/orders/create-payment-intent', {
      shipping_address: {
        full_name: 'John Doe',
        address_line1: '123 Main Street',
        state: 'CA',
        zip_code: '90210'
        // missing city
      },
      payment_method: 'credit_card'
    }, authToken);
    
    // Should fail due to missing city (or Stripe not configured)
    if (res.status === 503) {
      console.log('  (Stripe not configured, skipping)');
      return;
    }
    
    assertEqual(res.status, 400, 'Should return 400');
    assert(res.data.field_errors?.city, 'Should have city error');
  });
}

async function cleanup() {
  // Cleanup could delete test user, but we'll let it expire naturally
  console.log('\n=== Cleanup ===\n');
  console.log('✓ Test complete (test user left for manual inspection)');
}

async function main() {
  try {
    await setup();
    await runTests();
    await cleanup();
  } catch (err) {
    console.error('\nTest suite error:', err.message);
    failed++;
  }
  
  console.log('\n=================================');
  console.log(`Tests: ${passed + failed + skipped} total, ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('=================================\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

main();

/**
 * Email Templates Tests
 * 
 * Tests the email template generation for GLOVECUBS.
 * Run with: node tests/email-templates.test.js
 */

const templates = require('../lib/email-templates');

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

function assertContains(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(`${message || 'String does not contain expected substring'}: "${substring}"`);
  }
}

// Sample data
const sampleOrder = {
  order_number: 'GC-TEST123',
  subtotal: 150.00,
  shipping: 0,
  tax: 12.38,
  total: 162.38,
  payment_method: 'credit_card',
  shipping_address: {
    full_name: 'John Doe',
    company_name: 'Test Corp',
    address_line1: '123 Main St',
    city: 'Los Angeles',
    state: 'CA',
    zip_code: '90210',
    display: 'John Doe\nTest Corp\n123 Main St\nLos Angeles, CA 90210'
  },
  items: [
    { product_name: 'Nitrile Gloves Large', sku: 'NGL-100', variant_sku: 'NGL-100-L', quantity: 2, unit_price: 45.00 },
    { product_name: 'Vinyl Gloves Medium', sku: 'VGL-200', quantity: 1, unit_price: 60.00 }
  ]
};

const sampleUser = {
  id: 1,
  email: 'john@testcorp.com',
  contact_name: 'John Doe',
  company_name: 'Test Corp',
  phone: '555-1234'
};

const sampleRfq = {
  id: 42,
  company_name: 'Test Corp',
  contact_name: 'John Doe',
  email: 'john@testcorp.com',
  quantity: '5000',
  type: 'Nitrile Gloves',
  use_case: 'Medical facility',
  notes: 'Need powder-free'
};

console.log('\n=== Email Templates Tests ===\n');

// ============ orderConfirmation ============

console.log('--- orderConfirmation ---');

test('generates order confirmation email', () => {
  const result = templates.orderConfirmation(sampleOrder, sampleUser);
  
  assert(result.subject, 'Should have subject');
  assert(result.html, 'Should have HTML');
  assert(result.text, 'Should have text');
  
  assertContains(result.subject, 'GC-TEST123', 'Subject should contain order number');
  assertContains(result.html, 'GC-TEST123', 'HTML should contain order number');
  assertContains(result.text, 'GC-TEST123', 'Text should contain order number');
});

test('includes order items in confirmation', () => {
  const result = templates.orderConfirmation(sampleOrder, sampleUser);
  
  assertContains(result.html, 'Nitrile Gloves Large', 'HTML should contain item name');
  assertContains(result.html, 'NGL-100-L', 'HTML should contain variant SKU');
  assertContains(result.text, 'Nitrile Gloves Large', 'Text should contain item name');
});

test('includes totals in confirmation', () => {
  const result = templates.orderConfirmation(sampleOrder, sampleUser);
  
  assertContains(result.html, '$150.00', 'HTML should contain subtotal');
  assertContains(result.html, '$162.38', 'HTML should contain persisted total');
  assertContains(result.html, 'FREE', 'HTML should show free shipping');
});

test('confirmation does not fabricate grand total when order.total missing', () => {
  const o = { ...sampleOrder };
  delete o.total;
  const result = templates.orderConfirmation(o, sampleUser);
  assertContains(result.html, 'no stored total', 'HTML should explain missing grand total');
  assertContains(result.text, 'not shown in this email', 'Text should not invent total');
  assert(!result.text.includes('Total: $162.38'), 'Text total line must not use computed math as grand total');
});

test('missing order.total logs EmailTotals and does not emit persisted-total table row', () => {
  const logs = [];
  const orig = console.error;
  console.error = function (...args) {
    logs.push(args.map(String).join(' '));
  };
  try {
    const o = { ...sampleOrder };
    delete o.total;
    const result = templates.orderConfirmation(o, sampleUser);
    assert(
      logs.some((l) => l.includes('[EmailTotals]') && l.includes('Missing persisted')),
      'Expected console.error for missing persisted total'
    );
    assert(
      !result.html.includes('<tr class="total-row">'),
      'Must not render emphasized grand-total row without persisted order.total'
    );
  } finally {
    console.error = orig;
  }
});

test('confirmation uses shipping_cost when shipping field missing', () => {
  const o = {
    ...sampleOrder,
    shipping: undefined,
    shipping_cost: 15,
    total: 177.38,
  };
  const result = templates.orderConfirmation(o, sampleUser);
  assertContains(result.html, '$15.00', 'HTML should show legacy shipping_cost as shipping');
});

test('includes shipping address in confirmation', () => {
  const result = templates.orderConfirmation(sampleOrder, sampleUser);
  
  assertContains(result.html, 'Los Angeles', 'HTML should contain city');
  assertContains(result.html, 'CA', 'HTML should contain state');
  assertContains(result.html, '90210', 'HTML should contain ZIP');
});

// ============ paymentSuccess ============

console.log('\n--- paymentSuccess ---');

test('generates payment success email', () => {
  const result = templates.paymentSuccess(sampleOrder, sampleUser);
  
  assert(result.subject, 'Should have subject');
  assertContains(result.subject, 'Payment Confirmed', 'Subject should mention payment confirmed');
  assertContains(result.html, 'Payment Confirmed', 'HTML should mention payment confirmed');
});

test('includes track order link', () => {
  const result = templates.paymentSuccess(sampleOrder, sampleUser);
  
  assertContains(result.html, 'Track Your Order', 'HTML should have track order button');
  assertContains(result.html, 'portal-orders', 'HTML should link to portal');
});

// ============ paymentFailed ============

console.log('\n--- paymentFailed ---');

test('generates payment failed email', () => {
  const result = templates.paymentFailed(sampleOrder, sampleUser);
  
  assert(result.subject, 'Should have subject');
  assertContains(result.subject, 'Payment Failed', 'Subject should mention payment failed');
  assertContains(result.subject, 'Action Required', 'Subject should indicate action needed');
});

test('includes retry instructions', () => {
  const result = templates.paymentFailed(sampleOrder, sampleUser);
  
  assertContains(result.html, 'Retry Payment', 'HTML should have retry button');
  assertContains(result.html, 'different payment method', 'HTML should suggest alternatives');
});

test('includes error message when provided', () => {
  const result = templates.paymentFailed(sampleOrder, sampleUser, 'Card declined');
  
  assertContains(result.html, 'Card declined', 'HTML should contain error message');
});

test('payment failed shows persisted total when present', () => {
  const result = templates.paymentFailed(sampleOrder, sampleUser);
  assertContains(result.html, 'Order total (on record)', 'HTML should label persisted total');
  assertContains(result.html, '$162.38', 'HTML should show persisted amount');
});

test('payment failed does not show $0.00 when order.total missing', () => {
  const o = { ...sampleOrder };
  delete o.total;
  const result = templates.paymentFailed(o, sampleUser);
  assert(!result.html.includes('$0.00'), 'Should not fabricate zero amount');
  assertContains(result.html, 'no stored total', 'Should direct customer to authoritative sources');
});

// ============ orderShipped ============

console.log('\n--- orderShipped ---');

test('generates order shipped email', () => {
  const trackingInfo = {
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://ups.com/track/1Z999AA10123456784'
  };
  const result = templates.orderShipped(sampleOrder, sampleUser, trackingInfo);
  
  assert(result.subject, 'Should have subject');
  assertContains(result.subject, 'Shipped', 'Subject should mention shipped');
  assertContains(result.html, 'Has Shipped', 'HTML should mention shipped');
});

test('includes tracking number', () => {
  const trackingInfo = {
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://ups.com/track/1Z999AA10123456784'
  };
  const result = templates.orderShipped(sampleOrder, sampleUser, trackingInfo);
  
  assertContains(result.html, '1Z999AA10123456784', 'HTML should contain tracking number');
  assertContains(result.text, '1Z999AA10123456784', 'Text should contain tracking number');
});

test('includes tracking link', () => {
  const trackingInfo = {
    tracking_number: '1Z999AA10123456784',
    tracking_url: 'https://ups.com/track/1Z999AA10123456784'
  };
  const result = templates.orderShipped(sampleOrder, sampleUser, trackingInfo);
  
  assertContains(result.html, 'Track Package', 'HTML should have track button');
  assertContains(result.html, 'https://ups.com', 'HTML should contain tracking URL');
});

test('handles missing tracking info', () => {
  const result = templates.orderShipped(sampleOrder, sampleUser, {});
  
  assert(result.subject, 'Should have subject');
  assertContains(result.html, 'Tracking information will be available soon', 'HTML should handle missing tracking');
});

// ============ rfqConfirmation ============

console.log('\n--- rfqConfirmation ---');

test('generates RFQ confirmation email', () => {
  const result = templates.rfqConfirmation(sampleRfq, sampleUser);
  
  assert(result.subject, 'Should have subject');
  assertContains(result.subject, 'Quote Request', 'Subject should mention quote request');
});

test('includes RFQ details', () => {
  const result = templates.rfqConfirmation(sampleRfq, sampleUser);
  
  assertContains(result.html, 'Test Corp', 'HTML should contain company name');
  assertContains(result.html, 'Nitrile Gloves', 'HTML should contain product type');
  assertContains(result.html, '5000', 'HTML should contain quantity');
  assertContains(result.html, 'Medical facility', 'HTML should contain use case');
});

// ============ adminNewOrder ============

console.log('\n--- adminNewOrder ---');

test('generates admin new order notification', () => {
  const result = templates.adminNewOrder(sampleOrder, sampleUser);
  
  assert(result.subject, 'Should have subject');
  assertContains(result.subject, '[Glovecubs]', 'Subject should have prefix');
  assertContains(result.subject, 'New Order', 'Subject should mention new order');
});

test('includes customer info in admin email', () => {
  const result = templates.adminNewOrder(sampleOrder, sampleUser);
  
  assertContains(result.html, 'Test Corp', 'HTML should contain company name');
  assertContains(result.html, 'john@testcorp.com', 'HTML should contain email');
});

test('admin new order subject omits amount when total missing', () => {
  const o = { ...sampleOrder };
  delete o.total;
  const result = templates.adminNewOrder(o, sampleUser);
  assertContains(result.subject, 'GC-TEST123', 'Subject should have order number');
  assert(!result.subject.includes('$'), 'Subject should not fabricate currency when total missing');
});

// ============ testEmail ============

console.log('\n--- testEmail ---');

test('generates test email', () => {
  const result = templates.testEmail('test@example.com');
  
  assert(result.subject, 'Should have subject');
  assertContains(result.subject, 'Test', 'Subject should mention test');
  assertContains(result.html, 'Configuration Test', 'HTML should mention test');
});

test('includes recipient in test email', () => {
  const result = templates.testEmail('admin@glovecubs.com');
  
  assertContains(result.html, 'admin@glovecubs.com', 'HTML should show recipient');
});

// ============ Utility Functions ============

console.log('\n--- Utility Functions ---');

test('formatCurrency formats correctly', () => {
  assert(templates.formatCurrency(100) === '$100.00', 'Should format 100');
  assert(templates.formatCurrency(99.5) === '$99.50', 'Should format 99.5');
  assert(templates.formatCurrency(0) === '$0.00', 'Should format 0');
});

test('formatShippingAddress handles string', () => {
  const result = templates.formatShippingAddress('123 Main St, LA, CA 90210');
  assert(result === '123 Main St, LA, CA 90210', 'Should return string as-is');
});

test('formatShippingAddress handles object', () => {
  const result = templates.formatShippingAddress(sampleOrder.shipping_address);
  assertContains(result, 'Los Angeles', 'Should contain city');
});

test('formatShippingAddress handles null', () => {
  const result = templates.formatShippingAddress(null);
  assert(result === 'Not specified', 'Should return default');
});

// ============ Edge Cases ============

console.log('\n--- Edge Cases ---');

test('handles order without items', () => {
  const emptyOrder = { ...sampleOrder, items: [] };
  const result = templates.orderConfirmation(emptyOrder, sampleUser);
  
  assert(result.html, 'Should generate HTML');
  assertContains(result.html, 'No items', 'Should indicate no items');
});

test('handles order without user', () => {
  const result = templates.orderConfirmation(sampleOrder, null);
  
  assert(result.html, 'Should generate HTML');
  assertContains(result.html, 'there', 'Should use fallback greeting');
});

test('handles Net 30 payment method', () => {
  const net30Order = { ...sampleOrder, payment_method: 'net30' };
  const result = templates.orderConfirmation(net30Order, sampleUser);
  
  assertContains(result.html, 'Net 30', 'Should show Net 30 payment');
});

// ============ Summary ============

console.log('\n=================================');
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
console.log('=================================\n');

process.exit(failed > 0 ? 1 : 0);

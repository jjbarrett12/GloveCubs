#!/usr/bin/env node
/**
 * GLOVECUBS Launch Readiness Audit
 * 
 * Comprehensive pre-launch checklist verification.
 * 
 * Usage:
 *   node scripts/launch-readiness-audit.js
 *   node scripts/launch-readiness-audit.js --json
 *   node scripts/launch-readiness-audit.js --fix (show remediation steps)
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Results tracking
const audit = {
  score: 0,
  maxScore: 0,
  categories: {},
  blockers: [],
  warnings: [],
  passed: [],
  timestamp: new Date().toISOString()
};

function check(category, name, condition, weight = 1, blockerIfFail = false, fix = null) {
  if (!audit.categories[category]) {
    audit.categories[category] = { score: 0, maxScore: 0, checks: [] };
  }
  
  audit.maxScore += weight;
  audit.categories[category].maxScore += weight;
  
  const passed = !!condition;
  const result = { name, passed, weight, fix };
  audit.categories[category].checks.push(result);
  
  if (passed) {
    audit.score += weight;
    audit.categories[category].score += weight;
    audit.passed.push(name);
  } else {
    if (blockerIfFail) {
      audit.blockers.push({ name, fix });
    } else {
      audit.warnings.push({ name, fix });
    }
  }
  
  return passed;
}

function getEnv(key) {
  return process.env[key];
}

function hasEnv(key) {
  const val = process.env[key];
  return val && val.trim().length > 0;
}

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

function auditEnvironment() {
  console.log('\n🔧 ENVIRONMENT CONFIGURATION\n');
  
  // Required
  check('Environment', 'NODE_ENV set', hasEnv('NODE_ENV'), 1, false,
    'Set NODE_ENV=production for production deployment');
  
  check('Environment', 'JWT_SECRET configured', 
    hasEnv('JWT_SECRET') && getEnv('JWT_SECRET') !== 'glovecubs-secret-key-2024',
    2, true, 'Set a strong random JWT_SECRET (not the default)');
  
  check('Environment', 'DOMAIN/BASE_URL set', hasEnv('DOMAIN') || hasEnv('BASE_URL'), 1, false,
    'Set DOMAIN or BASE_URL for email links');
  
  // Supabase
  check('Environment', 'SUPABASE_URL configured', hasEnv('SUPABASE_URL'), 3, true,
    'Set SUPABASE_URL to your Supabase project URL');
  
  check('Environment', 'SUPABASE_SERVICE_ROLE_KEY configured', hasEnv('SUPABASE_SERVICE_ROLE_KEY'), 3, true,
    'Set SUPABASE_SERVICE_ROLE_KEY for database access');
  
  // Stripe
  check('Environment', 'STRIPE_SECRET_KEY configured', hasEnv('STRIPE_SECRET_KEY'), 2, true,
    'Set STRIPE_SECRET_KEY for payment processing');
  
  check('Environment', 'STRIPE_PUBLISHABLE_KEY configured', hasEnv('STRIPE_PUBLISHABLE_KEY'), 2, true,
    'Set STRIPE_PUBLISHABLE_KEY for frontend Stripe.js');
  
  check('Environment', 'STRIPE_WEBHOOK_SECRET configured', hasEnv('STRIPE_WEBHOOK_SECRET'), 2, true,
    'Set STRIPE_WEBHOOK_SECRET for webhook verification');
  
  const isTestStripe = getEnv('STRIPE_SECRET_KEY')?.startsWith('sk_test_');
  if (hasEnv('STRIPE_SECRET_KEY') && isTestStripe) {
    audit.warnings.push({ 
      name: 'Stripe in test mode', 
      fix: 'Switch to live keys (sk_live_*) before processing real payments' 
    });
  }
  
  // Email
  check('Environment', 'SMTP_HOST configured', hasEnv('SMTP_HOST'), 1, false,
    'Set SMTP_HOST for transactional emails');
  
  check('Environment', 'SMTP_USER configured', hasEnv('SMTP_USER'), 1, false,
    'Set SMTP_USER for email authentication');
  
  check('Environment', 'SMTP_PASS configured', hasEnv('SMTP_PASS'), 1, false,
    'Set SMTP_PASS for email authentication');
  
  check('Environment', 'ADMIN_EMAIL configured', hasEnv('ADMIN_EMAIL'), 1, false,
    'Set ADMIN_EMAIL to receive order notifications');
  
  // Tax
  check('Environment', 'BUSINESS_STATE configured', hasEnv('BUSINESS_STATE'), 1, false,
    'Set BUSINESS_STATE for nexus-based tax calculation');
  
  check('Environment', 'BUSINESS_TAX_RATE configured', hasEnv('BUSINESS_TAX_RATE'), 1, false,
    'Set BUSINESS_TAX_RATE for sales tax');
}

// ============================================================================
// SECURITY CHECKS
// ============================================================================

function auditSecurity() {
  console.log('\n🔒 SECURITY CHECKS\n');
  
  // Check server.js for security features
  let serverCode = '';
  try {
    serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  } catch (e) {
    console.log('  ⚠ Could not read server.js');
  }
  
  // Rate limiting
  const hasRateLimit = serverCode.includes('rateLimit') || serverCode.includes('rate-limit');
  check('Security', 'Rate limiting enabled', hasRateLimit, 2, false,
    'Add rate limiting middleware (express-rate-limit)');
  
  // Admin route protection
  const hasAdminAuth = serverCode.includes('requireAdmin') || 
                       (serverCode.includes('authenticateToken') && serverCode.includes('isAdmin'));
  check('Security', 'Admin routes protected', hasAdminAuth, 3, true,
    'Ensure all /api/admin/* routes use requireAdmin middleware');
  
  // JWT authentication
  const hasJwtAuth = serverCode.includes('authenticateToken') && serverCode.includes('jwt');
  check('Security', 'JWT authentication implemented', hasJwtAuth, 3, true,
    'Implement JWT-based authentication');
  
  // Webhook signature verification
  const hasWebhookVerify = serverCode.includes('constructEvent') || 
                           serverCode.includes('STRIPE_WEBHOOK_SECRET');
  check('Security', 'Stripe webhook signature verification', hasWebhookVerify, 2, true,
    'Verify Stripe webhook signatures using constructEvent');
  
  // Input validation
  const hasAddressValidation = serverCode.includes('addressValidation') || 
                               serverCode.includes('validateAddress');
  check('Security', 'Address validation enabled', hasAddressValidation, 2, false,
    'Add server-side address validation');
  
  // CORS configuration
  const hasCors = serverCode.includes('cors(');
  check('Security', 'CORS configured', hasCors, 1, false,
    'Configure CORS for your allowed origins');
  
  // Password hashing
  const hasBcrypt = serverCode.includes('bcrypt') || serverCode.includes('argon2');
  check('Security', 'Password hashing enabled', hasBcrypt, 3, true,
    'Use bcrypt or argon2 for password hashing');
  
  // Strong JWT secret check (in production)
  const jwtSecret = getEnv('JWT_SECRET') || '';
  const isWeakSecret = jwtSecret.length < 32 || jwtSecret === 'glovecubs-secret-key-2024';
  check('Security', 'Strong JWT secret (32+ chars)', !isWeakSecret, 2, true,
    'Use a random 32+ character JWT_SECRET');
}

// ============================================================================
// DATABASE & DATA INTEGRITY
// ============================================================================

function auditDatabase() {
  console.log('\n💾 DATABASE & DATA INTEGRITY\n');
  
  const hasSupabase = hasEnv('SUPABASE_URL') && hasEnv('SUPABASE_SERVICE_ROLE_KEY');
  
  check('Database', 'Supabase credentials present', hasSupabase, 3, true,
    'Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  
  // Check for data service
  let hasDataService = false;
  try {
    // Check if the file exists and has required exports (without actually loading it to avoid env errors)
    const dataServicePath = path.join(__dirname, '../services/dataService.js');
    if (fs.existsSync(dataServicePath)) {
      const dataServiceCode = fs.readFileSync(dataServicePath, 'utf8');
      hasDataService = dataServiceCode.includes('getOrdersByCompanyId') || 
                       dataServiceCode.includes('getOrdersByUserId');
    }
  } catch (e) {
    // Service not available
  }
  check('Database', 'Data service available', hasDataService, 2, true,
    'Ensure services/dataService.js exports required functions');
  
  // Check for inventory service
  let hasInventory = false;
  try {
    const inventoryPath = path.join(__dirname, '../lib/inventory.js');
    if (fs.existsSync(inventoryPath)) {
      const inventoryCode = fs.readFileSync(inventoryPath, 'utf8');
      hasInventory = inventoryCode.includes('checkAvailability') &&
                     inventoryCode.includes('reserveStockForOrder');
    }
  } catch (e) {
    // Service not available
  }
  check('Database', 'Inventory service available', hasInventory, 2, true,
    'Ensure lib/inventory.js is properly configured');
  
  // Check for products service
  let hasProductsService = false;
  try {
    const productsPath = path.join(__dirname, '../services/productsService.js');
    if (fs.existsSync(productsPath)) {
      const productsCode = fs.readFileSync(productsPath, 'utf8');
      hasProductsService = productsCode.includes('getProducts') || 
                           productsCode.includes('getAllProducts');
    }
  } catch (e) {
    // Service not available
  }
  check('Database', 'Products service available', hasProductsService, 2, true,
    'Ensure services/productsService.js is properly configured');
}

// ============================================================================
// ORDER LIFECYCLE
// ============================================================================

function auditOrderLifecycle() {
  console.log('\n📦 ORDER LIFECYCLE\n');
  
  let serverCode = '';
  try {
    serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  } catch (e) {
    console.log('  ⚠ Could not read server.js');
    return;
  }
  
  // Order creation
  check('Orders', 'Order creation endpoint exists', 
    serverCode.includes("app.post('/api/orders'"), 2, true,
    'Implement POST /api/orders endpoint');
  
  // Payment intent creation
  check('Orders', 'PaymentIntent creation endpoint exists',
    serverCode.includes('create-payment-intent'), 2, true,
    'Implement POST /api/orders/create-payment-intent endpoint');
  
  // Webhook handling
  check('Orders', 'Stripe webhook endpoint exists',
    serverCode.includes('/api/webhooks/stripe'), 2, true,
    'Implement POST /api/webhooks/stripe endpoint');
  
  // Payment success handling
  check('Orders', 'payment_intent.succeeded handled',
    serverCode.includes('payment_intent.succeeded'), 2, true,
    'Handle payment_intent.succeeded webhook event');
  
  // Payment failure handling
  check('Orders', 'payment_intent.payment_failed handled',
    serverCode.includes('payment_intent.payment_failed') || serverCode.includes('payment_failed'), 2, false,
    'Handle payment_intent.payment_failed webhook event');
  
  // Order status update
  check('Orders', 'Order status update available',
    serverCode.includes('updateOrderStatus') || serverCode.includes("status: 'shipped'"), 2, true,
    'Implement order status update functionality');
  
  // Inventory reservation
  check('Orders', 'Inventory reservation on order',
    serverCode.includes('reserveStockForOrder'), 2, true,
    'Reserve inventory when order is created');
  
  // Inventory deduction on ship
  check('Orders', 'Inventory deduction on ship',
    serverCode.includes('deductStockForOrder'), 2, true,
    'Deduct inventory when order ships');
  
  // Webhook idempotency
  check('Orders', 'Webhook idempotency protection',
    serverCode.includes('isDuplicateEvent') || serverCode.includes('webhook_events'), 2, true,
    'Implement webhook idempotency to prevent duplicate processing');
}

// ============================================================================
// EMAIL SYSTEM
// ============================================================================

function auditEmail() {
  console.log('\n📧 EMAIL SYSTEM\n');
  
  const smtpConfigured = hasEnv('SMTP_HOST') && hasEnv('SMTP_USER') && hasEnv('SMTP_PASS');
  check('Email', 'SMTP fully configured', smtpConfigured, 2, false,
    'Configure SMTP_HOST, SMTP_USER, SMTP_PASS for transactional emails');
  
  // Check for email templates
  let hasTemplates = false;
  try {
    const templatesPath = path.join(__dirname, '../lib/email-templates.js');
    if (fs.existsSync(templatesPath)) {
      const templatesCode = fs.readFileSync(templatesPath, 'utf8');
      hasTemplates = templatesCode.includes('orderConfirmation') &&
                     templatesCode.includes('module.exports');
    }
  } catch (e) {
    // Templates not available
  }
  check('Email', 'Email templates available', hasTemplates, 1, false,
    'Create lib/email-templates.js with HTML email templates');
  
  // Check for email sending
  let hasEmailLib = false;
  try {
    const emailPath = path.join(__dirname, '../lib/email.js');
    if (fs.existsSync(emailPath)) {
      const emailCode = fs.readFileSync(emailPath, 'utf8');
      hasEmailLib = emailCode.includes('sendMail') && 
                    emailCode.includes('module.exports');
    }
  } catch (e) {
    // Email lib not available
  }
  check('Email', 'Email library available', hasEmailLib, 2, true,
    'Ensure lib/email.js exports sendMail function');
  
  let serverCode = '';
  try {
    serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  } catch (e) {}
  
  // Order confirmation email
  check('Email', 'Order confirmation email implemented',
    serverCode.includes('orderConfirmation') || serverCode.includes('Order confirmed'), 1, false,
    'Send order confirmation email on successful order');
  
  // Shipping notification
  check('Email', 'Shipping notification implemented',
    serverCode.includes('orderShipped') || serverCode.includes('shipping notification'), 1, false,
    'Send shipping notification when order ships');
}

// ============================================================================
// TAX CONFIGURATION
// ============================================================================

function auditTax() {
  console.log('\n💰 TAX CONFIGURATION\n');
  
  let hasTaxLib = false;
  try {
    const taxPath = path.join(__dirname, '../lib/tax.js');
    if (fs.existsSync(taxPath)) {
      const taxCode = fs.readFileSync(taxPath, 'utf8');
      hasTaxLib = taxCode.includes('calculateTax') && 
                  taxCode.includes('module.exports');
    }
  } catch (e) {
    // Tax lib not available
  }
  
  check('Tax', 'Tax calculation library exists', hasTaxLib, 2, true,
    'Create lib/tax.js with nexus-based tax calculation');
  
  check('Tax', 'BUSINESS_STATE configured', hasEnv('BUSINESS_STATE'), 1, false,
    'Set BUSINESS_STATE to your nexus state (e.g., CA)');
  
  check('Tax', 'BUSINESS_TAX_RATE configured', hasEnv('BUSINESS_TAX_RATE'), 1, false,
    'Set BUSINESS_TAX_RATE (e.g., 0.0825 for 8.25%)');
  
  let serverCode = '';
  try {
    serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  } catch (e) {}
  
  check('Tax', 'Tax applied in checkout',
    serverCode.includes('calculateTax') || serverCode.includes('taxLib'), 2, true,
    'Apply tax calculation in order creation');
}

// ============================================================================
// ADMIN FUNCTIONALITY
// ============================================================================

function auditAdmin() {
  console.log('\n👤 ADMIN FUNCTIONALITY\n');
  
  let serverCode = '';
  try {
    serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  } catch (e) {
    console.log('  ⚠ Could not read server.js');
    return;
  }
  
  // Admin order management
  check('Admin', 'Admin can view orders',
    serverCode.includes("'/api/admin/orders'") || serverCode.includes('getOrdersAdmin'), 2, true,
    'Implement GET /api/admin/orders endpoint');
  
  check('Admin', 'Admin can update orders',
    serverCode.includes("app.put('/api/admin/orders/") || serverCode.includes('updateOrder'), 2, true,
    'Implement PUT /api/admin/orders/:id endpoint');
  
  check('Admin', 'Admin can view inventory',
    serverCode.includes('/api/admin/inventory') || serverCode.includes('/api/inventory'), 1, false,
    'Implement inventory viewing endpoint');
  
  check('Admin', 'Admin can adjust inventory',
    serverCode.includes('adjustStock') || serverCode.includes('setStock'), 1, false,
    'Implement inventory adjustment endpoint');
  
  check('Admin', 'Admin can manage products',
    serverCode.includes('/api/admin/products'), 1, false,
    'Implement product management endpoints');
  
  check('Admin', 'Admin can view users',
    serverCode.includes('/api/admin/users'), 1, false,
    'Implement GET /api/admin/users endpoint');
}

// ============================================================================
// CUSTOMER PORTAL
// ============================================================================

function auditCustomerPortal() {
  console.log('\n🏠 CUSTOMER PORTAL\n');
  
  let serverCode = '';
  try {
    serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  } catch (e) {}
  
  check('Portal', 'Customer can view orders',
    serverCode.includes("app.get('/api/orders'") || serverCode.includes('getOrdersByCompanyId'), 2, true,
    'Implement GET /api/orders endpoint');
  
  check('Portal', 'Customer can view order details',
    serverCode.includes("/api/orders/:id") && serverCode.includes('getOrderById'), 2, true,
    'Implement GET /api/orders/:id endpoint');
  
  check('Portal', 'Customer can manage cart',
    serverCode.includes('/api/cart'), 2, true,
    'Implement cart management endpoints');
  
  check('Portal', 'Customer can manage addresses',
    serverCode.includes('/api/ship-to') || serverCode.includes('ship_to'), 1, false,
    'Implement address management endpoints');
  
  check('Portal', 'Customer registration available',
    serverCode.includes('/api/auth/register') || serverCode.includes('/api/register'), 2, true,
    'Implement POST /api/auth/register endpoint');
  
  check('Portal', 'Customer login available',
    serverCode.includes('/api/auth/login') || serverCode.includes('/api/login'), 2, true,
    'Implement POST /api/auth/login endpoint');
  
  check('Portal', 'Password reset available',
    serverCode.includes('password-reset') || serverCode.includes('forgot-password') || serverCode.includes('reset_token'), 1, false,
    'Implement password reset functionality');
}

// ============================================================================
// ERROR HANDLING & LOGGING
// ============================================================================

function auditErrorHandling() {
  console.log('\n📝 ERROR HANDLING & LOGGING\n');
  
  let serverCode = '';
  try {
    serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  } catch (e) {}
  
  // Error logging
  check('Logging', 'Console error logging present',
    serverCode.includes('console.error'), 1, false,
    'Add error logging throughout the application');
  
  // Structured logging for payments
  let hasPaymentLog = false;
  try {
    const paymentLogPath = path.join(__dirname, '../lib/payment-logger.js');
    if (fs.existsSync(paymentLogPath)) {
      const paymentLogCode = fs.readFileSync(paymentLogPath, 'utf8');
      hasPaymentLog = paymentLogCode.includes('log') && 
                      paymentLogCode.includes('module.exports');
    }
  } catch (e) {}
  
  check('Logging', 'Payment logging available', hasPaymentLog, 2, false,
    'Create lib/payment-logger.js for structured payment logs');
  
  // Try-catch in routes
  const hasTryCatch = (serverCode.match(/try\s*\{/g) || []).length >= 10;
  check('Logging', 'Try-catch error handling in routes', hasTryCatch, 2, false,
    'Wrap route handlers in try-catch blocks');
  
  // Error response standardization
  const hasErrorResponse = serverCode.includes('.status(500).json') || 
                          serverCode.includes('.status(400).json');
  check('Logging', 'Standardized error responses', hasErrorResponse, 1, false,
    'Return consistent JSON error responses');
}

// ============================================================================
// PRODUCT CATALOG
// ============================================================================

function auditCatalog() {
  console.log('\n🛍️ PRODUCT CATALOG\n');
  
  let serverCode = '';
  try {
    serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  } catch (e) {}
  
  check('Catalog', 'Products API available',
    serverCode.includes('/api/products'), 2, true,
    'Implement GET /api/products endpoint');
  
  check('Catalog', 'Product search implemented',
    serverCode.includes('search') && serverCode.includes('products'), 1, false,
    'Implement product search functionality');
  
  check('Catalog', 'Product filtering available',
    serverCode.includes('category') && serverCode.includes('material'), 1, false,
    'Implement product filtering by category, material, etc.');
  
  // Check if we have the audit script
  let hasAuditScript = false;
  try {
    hasAuditScript = fs.existsSync(path.join(__dirname, 'audit-product-catalog.js'));
  } catch (e) {}
  
  check('Catalog', 'Catalog audit script available', hasAuditScript, 1, false,
    'Run node scripts/audit-product-catalog.js to verify catalog completeness');
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

function generateReport(showFix = false) {
  const scorePercent = Math.round((audit.score / audit.maxScore) * 100);
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              GLOVECUBS LAUNCH READINESS AUDIT                      ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Audit Date: ${audit.timestamp.slice(0, 19).replace('T', ' ').padEnd(52)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Category scores
  console.log('┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                      CATEGORY SCORES                                │');
  console.log('├─────────────────────────────────────────────────────────────────────┤');
  
  for (const [category, data] of Object.entries(audit.categories)) {
    const catPercent = Math.round((data.score / data.maxScore) * 100);
    const bar = '█'.repeat(Math.floor(catPercent / 5)) + '░'.repeat(20 - Math.floor(catPercent / 5));
    const passedCount = data.checks.filter(c => c.passed).length;
    const totalCount = data.checks.length;
    
    console.log(`│  ${category.padEnd(15)} ${bar} ${String(catPercent).padStart(3)}%  (${passedCount}/${totalCount})   │`);
  }
  
  console.log('└─────────────────────────────────────────────────────────────────────┘');
  console.log('');
  
  // Overall score
  const scoreBar = '█'.repeat(Math.floor(scorePercent / 5)) + '░'.repeat(20 - Math.floor(scorePercent / 5));
  let scoreColor = '\x1b[31m'; // Red
  if (scorePercent >= 70) scoreColor = '\x1b[33m'; // Yellow
  if (scorePercent >= 85) scoreColor = '\x1b[32m'; // Green
  
  console.log('┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                    LAUNCH READINESS SCORE                           │');
  console.log('├─────────────────────────────────────────────────────────────────────┤');
  console.log(`│                                                                     │`);
  console.log(`│           ${scoreColor}${scoreBar} ${String(scorePercent).padStart(3)}%\x1b[0m                      │`);
  console.log(`│                                                                     │`);
  console.log(`│                  ${audit.score} / ${audit.maxScore} points                                   │`);
  console.log('└─────────────────────────────────────────────────────────────────────┘');
  console.log('');
  
  // Blockers
  if (audit.blockers.length > 0) {
    console.log('\x1b[31m┌─────────────────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('\x1b[31m│                    🚫 BLOCKERS (Must Fix)                           │\x1b[0m');
    console.log('\x1b[31m└─────────────────────────────────────────────────────────────────────┘\x1b[0m');
    console.log('');
    for (const blocker of audit.blockers) {
      console.log(`  \x1b[31m✗\x1b[0m ${blocker.name}`);
      if (showFix && blocker.fix) {
        console.log(`    \x1b[33m→ ${blocker.fix}\x1b[0m`);
      }
    }
    console.log('');
  }
  
  // Warnings
  if (audit.warnings.length > 0) {
    console.log('\x1b[33m┌─────────────────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('\x1b[33m│                    ⚠️ WARNINGS (Should Fix)                         │\x1b[0m');
    console.log('\x1b[33m└─────────────────────────────────────────────────────────────────────┘\x1b[0m');
    console.log('');
    for (const warning of audit.warnings) {
      console.log(`  \x1b[33m⚠\x1b[0m ${warning.name}`);
      if (showFix && warning.fix) {
        console.log(`    \x1b[90m→ ${warning.fix}\x1b[0m`);
      }
    }
    console.log('');
  }
  
  // Launch decision
  console.log('┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│                    LAUNCH DECISION                                  │');
  console.log('├─────────────────────────────────────────────────────────────────────┤');
  
  if (audit.blockers.length === 0 && scorePercent >= 85) {
    console.log('│                                                                     │');
    console.log('│    \x1b[32m✓ READY FOR LAUNCH\x1b[0m                                              │');
    console.log('│                                                                     │');
    console.log('│    The system can safely launch for early customers.               │');
    console.log('│    Address warnings before scaling.                                 │');
    console.log('│                                                                     │');
  } else if (audit.blockers.length === 0 && scorePercent >= 70) {
    console.log('│                                                                     │');
    console.log('│    \x1b[33m⚠ SOFT LAUNCH POSSIBLE\x1b[0m                                          │');
    console.log('│                                                                     │');
    console.log('│    Can launch with limited customers, but address warnings soon.   │');
    console.log('│    Not recommended for high-volume launch.                          │');
    console.log('│                                                                     │');
  } else if (audit.blockers.length > 0) {
    console.log('│                                                                     │');
    console.log('│    \x1b[31m✗ NOT READY - BLOCKERS FOUND\x1b[0m                                    │');
    console.log('│                                                                     │');
    console.log(`│    ${audit.blockers.length} critical issue(s) must be resolved before launch.          │`);
    console.log('│    Run with --fix to see remediation steps.                         │');
    console.log('│                                                                     │');
  } else {
    console.log('│                                                                     │');
    console.log('│    \x1b[31m✗ NOT READY - SCORE TOO LOW\x1b[0m                                     │');
    console.log('│                                                                     │');
    console.log('│    Address critical issues before launching.                        │');
    console.log('│                                                                     │');
  }
  
  console.log('└─────────────────────────────────────────────────────────────────────┘');
  console.log('');
  
  // Quick stats
  console.log(`Passed: ${audit.passed.length} | Blockers: ${audit.blockers.length} | Warnings: ${audit.warnings.length}`);
  console.log('');
}

function generateJson() {
  const output = {
    ...audit,
    scorePercent: Math.round((audit.score / audit.maxScore) * 100),
    launchReady: audit.blockers.length === 0 && (audit.score / audit.maxScore) >= 0.85,
    softLaunchPossible: audit.blockers.length === 0 && (audit.score / audit.maxScore) >= 0.70
  };
  console.log(JSON.stringify(output, null, 2));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  const showFix = args.includes('--fix');
  
  if (!outputJson) {
    console.log('\n🔍 Running GLOVECUBS Launch Readiness Audit...');
  }
  
  // Run all audits
  auditEnvironment();
  auditSecurity();
  auditDatabase();
  auditOrderLifecycle();
  auditEmail();
  auditTax();
  auditAdmin();
  auditCustomerPortal();
  auditErrorHandling();
  auditCatalog();
  
  // Generate report
  if (outputJson) {
    generateJson();
  } else {
    generateReport(showFix);
  }
  
  // Exit code based on blockers
  process.exit(audit.blockers.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});

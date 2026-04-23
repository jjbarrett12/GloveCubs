/**
 * Load Test Configuration
 *
 * Production-oriented k6 load test config.
 * Override via environment variables or k6 --env flag.
 *
 * Required seed data and setup: see README.md and scripts/setup-test-data.sql
 */

// Base URLs (main Express app = buyer/orders; storefront = Next.js admin/supplier/offers)
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3004';
export const STOREFRONT_URL = __ENV.STOREFRONT_URL || 'http://localhost:3005';

// Optional: override recommendation outcome write endpoint (if implemented)
export const OUTCOME_API_URL = __ENV.OUTCOME_API_URL || __ENV.STOREFRONT_URL || 'http://localhost:3005';

// Authentication (use real test users or pre-issued tokens)
export const TEST_USER_EMAIL = __ENV.TEST_USER_EMAIL || 'loadtest@glovecubs.com';
export const TEST_USER_PASSWORD = __ENV.TEST_USER_PASSWORD || 'LoadTest123!';
export const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@glovecubs.com';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'AdminTest123!';
export const SUPPLIER_EMAIL = __ENV.SUPPLIER_EMAIL || 'supplier@glovecubs.com';
export const SUPPLIER_PASSWORD = __ENV.SUPPLIER_PASSWORD || 'SupplierTest123!';

// Pre-configured auth tokens (skip login when set; useful for CI/production)
export const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
export const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || '';
export const SUPPLIER_TOKEN = __ENV.SUPPLIER_TOKEN || '';

// Test data IDs (must exist in DB; see setup-test-data.sql)
export const TEST_PRODUCT_IDS = (__ENV.TEST_PRODUCT_IDS || '1,2,3,4,5').split(',').map((s) => s.trim()).filter(Boolean);
export const TEST_SUPPLIER_ID = __ENV.TEST_SUPPLIER_ID || '1';
export const TEST_UPLOAD_ID = __ENV.TEST_UPLOAD_ID || '';

// Thresholds (p95 ms, error rate, duplicate-write count)
export const THRESHOLDS = {
  http_req_duration_p95: Number(__ENV.THRESHOLD_P95_MS) || 500,
  http_req_duration_p99: Number(__ENV.THRESHOLD_P99_MS) || 1000,
  http_req_failed_rate: Number(__ENV.THRESHOLD_ERROR_RATE) || 0.01,
  login_duration_p95: Number(__ENV.THRESHOLD_LOGIN_P95_MS) || 1000,
  search_duration_p95: 500,
  quote_duration_p95: 2000,
  dashboard_duration_p95: 800,
  admin_duration_p95: 1000,
  supplier_duration_p95: 800,
  outcome_duration_p95: 500,
  duplicate_write_max_count: Number(__ENV.THRESHOLD_DUPLICATE_WRITES) || 5,
};

// Profiles: smoke (light), normal (50–100 VU), stress (250–500 VU)
export const PROFILES = {
  smoke: {
    vus: 10,
    duration: '1m',
    description: 'Smoke – verify all endpoints respond',
  },
  normal: {
    vus: 50,
    duration: '5m',
    description: 'Normal – target production load',
  },
  stress: {
    vus: 100,
    duration: '10m',
    description: 'Stress – find limits',
  },
  stress_250: {
    vus: 250,
    duration: '5m',
    description: 'Stress 250 VUs',
  },
  stress_500: {
    vus: 500,
    duration: '3m',
    description: 'Stress 500 VUs',
  },
  spike: {
    stages: [
      { duration: '1m', target: 50 },
      { duration: '30s', target: 250 },
      { duration: '1m', target: 250 },
      { duration: '30s', target: 50 },
      { duration: '2m', target: 50 },
    ],
    description: 'Spike – sudden surge',
  },
  soak: {
    vus: 50,
    duration: '30m',
    description: 'Soak – sustained load',
  },
  breakpoint: {
    stages: [
      { duration: '2m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '2m', target: 250 },
      { duration: '2m', target: 500 },
      { duration: '2m', target: 100 },
    ],
    description: 'Breakpoint – ramp to 500 VUs',
  },
};

// Scenario weights (for mixed workload)
export const SCENARIO_WEIGHTS = {
  productSearch: 30,      // 30% of traffic
  productView: 25,        // 25% of traffic
  login: 10,              // 10% of traffic
  favorites: 10,          // 10% of traffic
  quoteSubmit: 5,         // 5% of traffic
  dashboardLoad: 10,      // 10% of traffic
  adminReview: 5,         // 5% of traffic
  supplierUpload: 5,      // 5% of traffic
};

// Search terms for realistic queries
export const SEARCH_TERMS = [
  'nitrile',
  'latex gloves',
  'powder-free',
  'exam gloves',
  'industrial',
  'vinyl',
  'small nitrile',
  'large latex',
  'blue gloves',
  'medical grade',
  'food service',
  'heavyweight',
  'disposable',
  'reusable',
  'chemical resistant',
];

// Helper function to get random item from array
export function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper function to get random search term
export function randomSearchTerm() {
  return randomItem(SEARCH_TERMS);
}

// Helper function to get random product ID
export function randomProductId() {
  return randomItem(TEST_PRODUCT_IDS);
}

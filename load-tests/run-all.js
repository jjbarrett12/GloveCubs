/**
 * Production load run: all 9 scenarios in one k6 run.
 *
 * Each scenario runs in parallel with its own VU count and duration.
 * Use PROFILE=smoke|normal|stress to scale VUs. Output includes
 * endpoint-specific metrics and threshold pass/fail.
 *
 * Run:
 *   k6 run --env PROFILE=smoke run-all.js
 *   k6 run --env PROFILE=normal run-all.js
 *   k6 run --env PROFILE=stress run-all.js
 *   k6 run --env PROFILE=stress_250 run-all.js
 *   k6 run --env PROFILE=stress_500 run-all.js
 *
 * Optional env: BASE_URL, STOREFRONT_URL, AUTH_TOKEN, ADMIN_TOKEN,
 *   SUPPLIER_TOKEN, TEST_USER_EMAIL, TEST_USER_PASSWORD, etc.
 */

import { sleep } from 'k6';
import http from 'k6/http';
import {
  BASE_URL,
  STOREFRONT_URL,
  OUTCOME_API_URL,
  THRESHOLDS,
  PROFILES,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  AUTH_TOKEN,
  ADMIN_TOKEN,
  SUPPLIER_TOKEN,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  SUPPLIER_EMAIL,
  SUPPLIER_PASSWORD,
  TEST_UPLOAD_ID,
  randomSearchTerm,
  randomProductId,
} from './config.js';

import {
  login,
  searchProducts,
  getProduct,
  getProductOffers,
  toggleFavorite,
  submitQuote,
  loadDashboard,
  getAdminReviewQueue,
  getSupplierUploadStatus,
  getSupplierUploadPreview,
  recordRecommendationOutcome,
  authHeaders,
  generateUniqueId,
} from './helpers.js';

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;
const vus = config.vus || 50;
const duration = config.duration || '5m';

// Scale down write-heavy scenarios for stress
const quoteVUs = Math.min(Math.ceil(vus * 0.3), 100);
const supplierVUs = Math.min(Math.ceil(vus * 0.2), 50);
const outcomeVUs = Math.min(Math.ceil(vus * 0.25), 75);

export const options = {
  scenarios: {
    buyer_login: {
      executor: 'constant-vus',
      vus: Math.min(vus, 100),
      duration: duration,
      startTime: '0s',
      exec: 'buyerLogin',
    },
    product_search: {
      executor: 'constant-vus',
      vus: vus,
      duration: duration,
      startTime: '0s',
      exec: 'productSearch',
    },
    product_view: {
      executor: 'constant-vus',
      vus: vus,
      duration: duration,
      startTime: '0s',
      exec: 'productView',
    },
    favorites: {
      executor: 'constant-vus',
      vus: Math.min(vus, 100),
      duration: duration,
      startTime: '0s',
      exec: 'favorites',
    },
    quote_submit: {
      executor: 'constant-vus',
      vus: quoteVUs,
      duration: duration,
      startTime: '0s',
      exec: 'quoteSubmit',
    },
    dashboard_load: {
      executor: 'constant-vus',
      vus: Math.min(vus, 100),
      duration: duration,
      startTime: '0s',
      exec: 'dashboardLoad',
    },
    supplier_upload_meta: {
      executor: 'constant-vus',
      vus: supplierVUs,
      duration: duration,
      startTime: '0s',
      exec: 'supplierUploadMeta',
    },
    admin_review: {
      executor: 'constant-vus',
      vus: Math.min(Math.ceil(vus * 0.3), 50),
      duration: duration,
      startTime: '0s',
      exec: 'adminReview',
    },
    outcome_writes: {
      executor: 'constant-vus',
      vus: outcomeVUs,
      duration: duration,
      startTime: '0s',
      exec: 'outcomeWrites',
    },
  },
  thresholds: {
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
    'http_req_failed': [`rate<${THRESHOLDS.http_req_failed_rate}`],
    'login_duration': [`p(95)<${THRESHOLDS.login_duration_p95}`],
    'search_duration': [`p(95)<${THRESHOLDS.search_duration_p95}`],
    'quote_duration': [`p(95)<${THRESHOLDS.quote_duration_p95}`],
    'dashboard_duration': [`p(95)<${THRESHOLDS.dashboard_duration_p95}`],
    'admin_duration': [`p(95)<${THRESHOLDS.admin_duration_p95}`],
    'supplier_duration': [`p(95)<${THRESHOLDS.supplier_duration_p95}`],
    'outcome_write_duration': [`p(95)<${THRESHOLDS.outcome_duration_p95}`],
    'duplicate_write_failures': [`count<${THRESHOLDS.duplicate_write_max_count}`],
  },
};

let buyerToken = AUTH_TOKEN;
let adminToken = ADMIN_TOKEN;
let supplierToken = SUPPLIER_TOKEN;

export function setup() {
  if (!buyerToken) buyerToken = login(BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  if (!adminToken) adminToken = login(BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!supplierToken) {
    const res = http.post(
      `${STOREFRONT_URL}/supplier-portal/api/auth`,
      JSON.stringify({ email: SUPPLIER_EMAIL, password: SUPPLIER_PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (res.status === 200 && res.body) {
      try {
        const body = JSON.parse(res.body);
        supplierToken = body.token || body.access_token;
      } catch (e) {}
    }
  }
  return {
    buyerToken,
    adminToken,
    supplierToken,
  };
}

import http from 'k6/http';

export function buyerLogin(data) {
  const email = `loadtest+vu${__VU}@glovecubs.com`;
  const token = login(BASE_URL, email, TEST_USER_PASSWORD);
  if (token) __ITER++;
  sleep(Math.random() * 1 + 0.2);
}

export function productSearch(data) {
  const q = randomSearchTerm();
  searchProducts(BASE_URL, q, data.buyerToken);
  sleep(Math.random() * 1.5 + 0.3);
}

export function productView(data) {
  const id = randomProductId();
  getProduct(BASE_URL, id, data.buyerToken);
  getProductOffers(STOREFRONT_URL, id, data.buyerToken);
  sleep(Math.random() * 2 + 0.5);
}

export function favorites(data) {
  if (!data.buyerToken) return;
  const id = randomProductId();
  toggleFavorite(BASE_URL, id, data.buyerToken, __ITER % 2 === 0 ? 'add' : 'remove');
  sleep(Math.random() * 1 + 0.2);
}

export function quoteSubmit(data) {
  const uid = generateUniqueId();
  const quoteData = {
    company_name: `LoadTest ${uid}`,
    contact_name: `VU${__VU}`,
    email: `loadtest+${uid}@glovecubs-test.com`,
    phone: '555-0100',
    quantity: String(Math.floor(Math.random() * 5000) + 100),
    type: 'Nitrile Gloves',
    use_case: 'Industrial',
    notes: `Load test ${new Date().toISOString()}`,
  };
  submitQuote(BASE_URL, quoteData, data.buyerToken);
  sleep(Math.random() * 2 + 0.5);
}

export function dashboardLoad(data) {
  if (!data.buyerToken) return;
  loadDashboard(BASE_URL, data.buyerToken);
  sleep(Math.random() * 2 + 0.5);
}

export function supplierUploadMeta(data) {
  if (!data.supplierToken || !TEST_UPLOAD_ID) return;
  if (Math.random() > 0.5) {
    getSupplierUploadStatus(STOREFRONT_URL, TEST_UPLOAD_ID, data.supplierToken);
  } else {
    getSupplierUploadPreview(STOREFRONT_URL, TEST_UPLOAD_ID, data.supplierToken);
  }
  sleep(Math.random() * 1 + 0.3);
}

export function adminReview(data) {
  if (!data.adminToken) return;
  getAdminReviewQueue(BASE_URL, data.adminToken);
  sleep(Math.random() * 1 + 0.3);
}

export function outcomeWrites(data) {
  const uid = generateUniqueId();
  const outcomeData = {
    recommendation_id: `rec-${uid}-${__VU}-${__ITER}`,
    product_id: randomProductId(),
    outcome: ['accepted', 'rejected'][Math.floor(Math.random() * 2)],
    supplier_id: '1',
    savings: Math.floor(Math.random() * 500),
  };
  recordRecommendationOutcome(OUTCOME_API_URL, outcomeData, data.adminToken);
  sleep(Math.random() * 0.5 + 0.2);
}

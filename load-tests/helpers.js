/**
 * Load Test Helpers
 * 
 * Common utilities for k6 load tests.
 */

import http from 'k6/http';
import { check, fail } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom metrics
export const loginDuration = new Trend('login_duration', true);
export const searchDuration = new Trend('search_duration', true);
export const quoteDuration = new Trend('quote_duration', true);
export const favoritesDuration = new Trend('favorites_duration', true);
export const dashboardDuration = new Trend('dashboard_duration', true);
export const adminDuration = new Trend('admin_duration', true);
export const supplierDuration = new Trend('supplier_duration', true);
export const outcomeWriteDuration = new Trend('outcome_write_duration', true);

export const loginFailures = new Counter('login_failures');
export const searchFailures = new Counter('search_failures');
export const quoteFailures = new Counter('quote_failures');
export const duplicateWrites = new Counter('duplicate_write_failures');
export const authFailures = new Counter('auth_failures');

export const errorRate = new Rate('error_rate');

/**
 * Login and get auth token
 */
export function login(baseUrl, email, password) {
  const payload = JSON.stringify({ email, password });
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'login' },
  };
  
  const start = Date.now();
  const res = http.post(`${baseUrl}/api/auth/login`, payload, params);
  const duration = Date.now() - start;
  
  loginDuration.add(duration);
  
  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.token !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  if (!success) {
    loginFailures.add(1);
    errorRate.add(1);
    return null;
  }
  
  errorRate.add(0);
  
  try {
    const body = JSON.parse(res.body);
    return body.token;
  } catch {
    return null;
  }
}

/**
 * Create authenticated headers
 */
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Product search
 */
export function searchProducts(baseUrl, query, token = null) {
  const params = {
    headers: token ? authHeaders(token) : { 'Content-Type': 'application/json' },
    tags: { name: 'product_search' },
  };
  
  const start = Date.now();
  const res = http.get(`${baseUrl}/api/products?search=${encodeURIComponent(query)}&sort=relevance`, params);
  const duration = Date.now() - start;
  
  searchDuration.add(duration);
  
  const success = check(res, {
    'search status 200': (r) => r.status === 200,
    'search returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body) || Array.isArray(body.products);
      } catch {
        return false;
      }
    },
  });
  
  if (!success) {
    searchFailures.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
  
  return res;
}

/**
 * Get product details
 */
export function getProduct(baseUrl, productId, token = null) {
  const params = {
    headers: token ? authHeaders(token) : { 'Content-Type': 'application/json' },
    tags: { name: 'product_view' },
  };
  
  const res = http.get(`${baseUrl}/api/products/${productId}`, params);
  
  check(res, {
    'product status 200': (r) => r.status === 200,
    'product has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.id !== undefined || body.sku !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  return res;
}

/**
 * Get product offers (supplier comparison)
 */
export function getProductOffers(storefrontUrl, productId, token = null) {
  const params = {
    headers: token ? authHeaders(token) : { 'Content-Type': 'application/json' },
    tags: { name: 'product_offers' },
  };
  
  const res = http.get(`${storefrontUrl}/api/products/${productId}/offers`, params);
  
  check(res, {
    'offers status 200': (r) => r.status === 200,
    'offers has supplier data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.offers !== undefined && body.market_summary !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  return res;
}

/**
 * Add/remove favorite
 */
export function toggleFavorite(baseUrl, productId, token, action = 'add') {
  const params = {
    headers: authHeaders(token),
    tags: { name: 'favorites' },
  };
  
  const start = Date.now();
  let res;
  
  if (action === 'add') {
    res = http.post(`${baseUrl}/api/favorites`, JSON.stringify({ product_id: productId }), params);
  } else {
    res = http.del(`${baseUrl}/api/favorites/${productId}`, null, params);
  }
  
  const duration = Date.now() - start;
  favoritesDuration.add(duration);
  
  check(res, {
    'favorites status ok': (r) => r.status === 200 || r.status === 201 || r.status === 204,
  });
  
  return res;
}

/**
 * Submit quote request
 */
export function submitQuote(baseUrl, quoteData, token = null) {
  const params = {
    headers: token ? authHeaders(token) : { 'Content-Type': 'application/json' },
    tags: { name: 'quote_submit' },
  };
  
  const payload = JSON.stringify({
    company_name: quoteData.company_name || `LoadTest Company ${Date.now()}`,
    contact_name: quoteData.contact_name || 'Load Test User',
    email: quoteData.email || `loadtest+${Date.now()}@example.com`,
    phone: quoteData.phone || '555-0100',
    quantity: quoteData.quantity || '1000',
    type: quoteData.type || 'Nitrile Gloves',
    use_case: quoteData.use_case || 'Industrial',
    notes: quoteData.notes || 'Load test submission',
  });
  
  const start = Date.now();
  const res = http.post(`${baseUrl}/api/rfqs`, payload, params);
  const duration = Date.now() - start;
  
  quoteDuration.add(duration);
  
  const success = check(res, {
    'quote status ok': (r) => r.status === 200 || r.status === 201,
    'quote has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.rfq_id !== undefined || body.id !== undefined || body.success === true;
      } catch {
        return false;
      }
    },
  });
  
  if (!success) {
    quoteFailures.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
  
  return res;
}

/**
 * Load dashboard (main site: account dashboard, orders, rfqs, favorites)
 */
export function loadDashboard(baseUrl, token) {
  const params = {
    headers: authHeaders(token),
    tags: { name: 'dashboard' },
  };

  const start = Date.now();

  const responses = http.batch([
    ['GET', `${baseUrl}/api/account/dashboard`, null, params],
    ['GET', `${baseUrl}/api/orders`, null, params],
    ['GET', `${baseUrl}/api/rfqs/mine`, null, params],
    ['GET', `${baseUrl}/api/favorites`, null, params],
  ]);

  const duration = Date.now() - start;
  dashboardDuration.add(duration);

  responses.forEach((res, i) => {
    check(res, {
      [`dashboard endpoint ${i} ok`]: (r) => r.status === 200 || r.status === 401,
    });
  });

  return responses;
}

/**
 * Admin review queue (main site import drafts; or storefront admin if preferred)
 */
export function getAdminReviewQueue(baseUrl, token) {
  const params = {
    headers: authHeaders(token),
    tags: { name: 'admin_review' },
  };

  const start = Date.now();
  const res = http.get(`${baseUrl}/api/admin/import/drafts`, params);
  const duration = Date.now() - start;

  adminDuration.add(duration);

  check(res, {
    'admin review status ok': (r) => r.status === 200 || r.status === 401 || r.status === 403,
  });

  return res;
}

/**
 * Supplier feed upload status
 */
export function getSupplierUploadStatus(storefrontUrl, uploadId, token) {
  const params = {
    headers: authHeaders(token),
    tags: { name: 'supplier_upload_status' },
  };
  
  const start = Date.now();
  const res = http.get(`${storefrontUrl}/supplier-portal/api/feed-upload?action=status&upload_id=${uploadId}`, params);
  const duration = Date.now() - start;
  
  supplierDuration.add(duration);
  
  check(res, {
    'supplier upload status ok': (r) => r.status === 200 || r.status === 401,
  });
  
  return res;
}

/**
 * Supplier feed upload rows preview
 */
export function getSupplierUploadPreview(storefrontUrl, uploadId, token) {
  const params = {
    headers: authHeaders(token),
    tags: { name: 'supplier_upload_preview' },
  };
  
  const start = Date.now();
  const res = http.get(`${storefrontUrl}/supplier-portal/api/feed-upload?action=rows&upload_id=${uploadId}&limit=50`, params);
  const duration = Date.now() - start;
  
  supplierDuration.add(duration);
  
  check(res, {
    'supplier preview status ok': (r) => r.status === 200 || r.status === 401,
  });
  
  return res;
}

/**
 * Record recommendation outcome.
 * Uses OUTCOME_API_URL (default STOREFRONT_URL). Endpoint may need to be implemented
 * (e.g. POST /api/internal/recommendation-outcomes) or use a stub for load testing.
 */
export function recordRecommendationOutcome(outcomeApiUrl, outcomeData, token) {
  const params = {
    headers: authHeaders(token),
    tags: { name: 'outcome_write' },
  };

  const payload = JSON.stringify({
    recommendation_id: outcomeData.recommendation_id || `rec-${Date.now()}-${__VU}-${__ITER}`,
    product_id: outcomeData.product_id || '1',
    outcome: outcomeData.outcome || 'accepted',
    accepted_supplier_id: outcomeData.supplier_id || null,
    realized_savings: outcomeData.savings || 0,
  });

  const start = Date.now();
  const res = http.post(`${outcomeApiUrl}/api/internal/recommendation-outcomes`, payload, params);
  const duration = Date.now() - start;

  outcomeWriteDuration.add(duration);

  const success = check(res, {
    'outcome write status ok': (r) => r.status === 200 || r.status === 201,
  });
  
  // Check for duplicate write errors
  if (res.status === 409 || (res.body && res.body.includes('duplicate'))) {
    duplicateWrites.add(1);
  }
  
  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
  
  return res;
}

/**
 * Generate unique ID for idempotency testing
 */
export function generateUniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Sleep with jitter
 */
export function sleepWithJitter(baseMs, jitterMs = 500) {
  const actualSleep = baseMs + Math.random() * jitterMs;
  return actualSleep / 1000; // k6 sleep uses seconds
}

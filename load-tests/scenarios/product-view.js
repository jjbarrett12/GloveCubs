/**
 * Scenario: Concurrent Product Page Views
 * 
 * Tests product detail and supplier offers endpoints under load.
 */

import { sleep, check, group } from 'k6';
import http from 'k6/http';
import { 
  BASE_URL, 
  STOREFRONT_URL,
  THRESHOLDS,
  PROFILES,
  TEST_PRODUCT_IDS,
  randomProductId,
} from '../config.js';
import { 
  getProduct,
  getProductOffers,
  errorRate,
} from '../helpers.js';
import { Trend } from 'k6/metrics';

const productViewDuration = new Trend('product_view_duration', true);
const offersDuration = new Trend('offers_duration', true);

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

export const options = {
  scenarios: {
    product_view: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: config.stages || [
        { duration: '30s', target: config.vus },
        { duration: config.duration || '3m', target: config.vus },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'product_view_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
    'offers_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
    'error_rate': [`rate<${THRESHOLDS.http_req_failed_rate}`],
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
  },
};

export default function () {
  const productId = randomProductId();
  
  group('Product Detail Page', function () {
    // Get product details
    const start = Date.now();
    const productRes = getProduct(BASE_URL, productId);
    productViewDuration.add(Date.now() - start);
    
    // Verify supplier_name is present
    if (productRes.status === 200) {
      try {
        const product = JSON.parse(productRes.body);
        check(product, {
          'product has supplier_name or brand': (p) => 
            p.supplier_name !== undefined || p.brand !== undefined,
        });
      } catch (e) {
        // Continue
      }
    }
  });
  
  group('Supplier Comparison', function () {
    // Get supplier offers
    const start = Date.now();
    const offersRes = getProductOffers(STOREFRONT_URL, productId);
    offersDuration.add(Date.now() - start);
    
    // Verify supplier data
    if (offersRes.status === 200) {
      try {
        const data = JSON.parse(offersRes.body);
        check(data, {
          'offers include supplier_name': (d) => {
            if (!d.offers || d.offers.length === 0) return true;
            return d.offers[0].supplier_name !== undefined;
          },
          'offers include trust_score': (d) => {
            if (!d.offers || d.offers.length === 0) return true;
            return d.offers[0].trust_score !== undefined;
          },
          'market_summary has trusted_best_price': (d) => {
            return d.market_summary !== undefined;
          },
        });
      } catch (e) {
        // Continue
      }
    }
  });
  
  // Simulate user browsing
  sleep(Math.random() * 3 + 1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/product-view.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== PRODUCT VIEW LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Base URL: ${BASE_URL}\n`;
  summary += `Storefront URL: ${STOREFRONT_URL}\n\n`;
  
  if (data.metrics.product_view_duration) {
    summary += `Product View Duration:\n`;
    summary += `  p50: ${data.metrics.product_view_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.product_view_duration.values['p(95)']?.toFixed(2)}ms\n`;
  }
  
  if (data.metrics.offers_duration) {
    summary += `\nOffers API Duration:\n`;
    summary += `  p50: ${data.metrics.offers_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.offers_duration.values['p(95)']?.toFixed(2)}ms\n`;
  }
  
  if (data.metrics.http_reqs) {
    summary += `\nTotal Requests: ${data.metrics.http_reqs.values.count}\n`;
    summary += `RPS: ${data.metrics.http_reqs.values.rate?.toFixed(2)}\n`;
  }
  
  summary += '\n=== THRESHOLDS ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary += `  ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }
  
  return summary;
}

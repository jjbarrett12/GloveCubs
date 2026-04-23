/**
 * Scenario: Concurrent Product Searches
 * 
 * Tests search system under load including relevance sorting.
 * Measures search latency and result quality.
 */

import { sleep, check } from 'k6';
import http from 'k6/http';
import { 
  BASE_URL, 
  THRESHOLDS,
  PROFILES,
  SEARCH_TERMS,
  randomSearchTerm,
} from '../config.js';
import { 
  searchProducts,
  searchDuration, 
  searchFailures,
  errorRate,
} from '../helpers.js';

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

export const options = {
  scenarios: {
    product_search: {
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
    'search_duration': [`p(95)<${THRESHOLDS.search_duration_p95}`],
    'search_failures': ['count<10'],
    'error_rate': [`rate<${THRESHOLDS.http_req_failed_rate}`],
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
  },
};

export default function () {
  // Random search term for realistic variation
  const query = randomSearchTerm();
  
  const res = searchProducts(BASE_URL, query);
  
  // Verify relevance ordering (first result should have highest score)
  if (res.status === 200) {
    try {
      const products = JSON.parse(res.body);
      const results = Array.isArray(products) ? products : products.products || [];
      
      if (results.length > 1 && results[0].relevance_score !== undefined) {
        check(results, {
          'results ordered by relevance': (r) => {
            for (let i = 1; i < Math.min(r.length, 5); i++) {
              if (r[i].relevance_score > r[i-1].relevance_score) {
                return false;
              }
            }
            return true;
          },
        });
      }
    } catch (e) {
      // Parsing error, continue
    }
  }
  
  // Simulate user reading results
  sleep(Math.random() * 2 + 0.5);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/product-search.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== PRODUCT SEARCH LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Base URL: ${BASE_URL}\n\n`;
  
  if (data.metrics.search_duration) {
    summary += `Search Duration:\n`;
    summary += `  p50: ${data.metrics.search_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.search_duration.values['p(95)']?.toFixed(2)}ms\n`;
    summary += `  p99: ${data.metrics.search_duration.values['p(99)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.search_failures) {
    summary += `Search Failures: ${data.metrics.search_failures.values.count || 0}\n`;
  }
  
  if (data.metrics.http_reqs) {
    summary += `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
    summary += `RPS: ${data.metrics.http_reqs.values.rate?.toFixed(2)}\n`;
  }
  
  summary += '\n=== THRESHOLDS ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary += `  ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }
  
  return summary;
}

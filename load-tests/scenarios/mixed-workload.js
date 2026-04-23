/**
 * Scenario: Mixed Workload
 * 
 * Simulates realistic production traffic with weighted distribution.
 */

import { sleep, check, group } from 'k6';
import http from 'k6/http';
import { 
  BASE_URL, 
  STOREFRONT_URL,
  THRESHOLDS,
  PROFILES,
  SCENARIO_WEIGHTS,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  AUTH_TOKEN,
  randomSearchTerm,
  randomProductId,
} from '../config.js';
import { 
  login,
  searchProducts,
  getProduct,
  getProductOffers,
  toggleFavorite,
  submitQuote,
  loadDashboard,
  authHeaders,
  errorRate,
  generateUniqueId,
} from '../helpers.js';

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

let cachedToken = AUTH_TOKEN;

export const options = {
  scenarios: {
    mixed_workload: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: config.stages || [
        { duration: '1m', target: config.vus },
        { duration: config.duration || '5m', target: config.vus },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '1m',
    },
  },
  thresholds: {
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
    'http_req_failed': [`rate<${THRESHOLDS.http_req_failed_rate}`],
    'error_rate': [`rate<${THRESHOLDS.http_req_failed_rate}`],
  },
};

export function setup() {
  if (!cachedToken) {
    cachedToken = login(BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  }
  return { token: cachedToken };
}

// Weighted random scenario selection
function selectScenario() {
  const totalWeight = Object.values(SCENARIO_WEIGHTS).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  for (const [scenario, weight] of Object.entries(SCENARIO_WEIGHTS)) {
    random -= weight;
    if (random <= 0) {
      return scenario;
    }
  }
  return 'productSearch'; // Default
}

export default function (data) {
  const token = data.token || AUTH_TOKEN;
  const scenario = selectScenario();
  
  switch (scenario) {
    case 'productSearch':
      group('Product Search', function () {
        searchProducts(BASE_URL, randomSearchTerm(), token);
      });
      sleep(Math.random() * 2 + 0.5);
      break;
      
    case 'productView':
      group('Product View', function () {
        const productId = randomProductId();
        getProduct(BASE_URL, productId, token);
        getProductOffers(STOREFRONT_URL, productId, token);
      });
      sleep(Math.random() * 3 + 1);
      break;
      
    case 'login':
      group('Login', function () {
        const vuEmail = `loadtest+vu${__VU}+${Date.now()}@glovecubs.com`;
        login(BASE_URL, vuEmail, TEST_USER_PASSWORD);
      });
      sleep(Math.random() * 2 + 1);
      break;
      
    case 'favorites':
      if (token) {
        group('Favorites', function () {
          toggleFavorite(BASE_URL, randomProductId(), token, 
            Math.random() > 0.5 ? 'add' : 'remove');
        });
        sleep(Math.random() * 1 + 0.5);
      }
      break;
      
    case 'quoteSubmit':
      group('Quote Submit', function () {
        submitQuote(BASE_URL, {
          company_name: `LoadTest Mixed ${generateUniqueId()}`,
          email: `loadtest+${generateUniqueId()}@glovecubs-test.com`,
        }, token);
      });
      sleep(Math.random() * 3 + 2);
      break;
      
    case 'dashboardLoad':
      if (token) {
        group('Dashboard Load', function () {
          loadDashboard(BASE_URL, token);
        });
        sleep(Math.random() * 3 + 1);
      }
      break;
      
    default:
      // Fallback to search
      searchProducts(BASE_URL, randomSearchTerm(), token);
      sleep(Math.random() * 2 + 0.5);
  }
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/mixed-workload.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== MIXED WORKLOAD LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Base URL: ${BASE_URL}\n`;
  summary += `Storefront URL: ${STOREFRONT_URL}\n`;
  summary += `VUs: ${config.vus}\n\n`;
  
  summary += `Scenario Weights:\n`;
  for (const [name, weight] of Object.entries(SCENARIO_WEIGHTS)) {
    summary += `  ${name}: ${weight}%\n`;
  }
  summary += '\n';
  
  if (data.metrics.http_req_duration) {
    summary += `HTTP Duration:\n`;
    summary += `  p50: ${data.metrics.http_req_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.http_req_duration.values['p(95)']?.toFixed(2)}ms\n`;
    summary += `  p99: ${data.metrics.http_req_duration.values['p(99)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.http_reqs) {
    summary += `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
    summary += `RPS: ${data.metrics.http_reqs.values.rate?.toFixed(2)}\n`;
  }
  
  if (data.metrics.http_req_failed) {
    summary += `Error Rate: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
  }
  
  summary += '\n=== THRESHOLDS ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary += `  ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }
  
  return summary;
}

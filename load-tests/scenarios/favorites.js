/**
 * Scenario: Concurrent Favorites Add/Remove
 * 
 * Tests favorites system under concurrent writes.
 */

import { sleep, check } from 'k6';
import http from 'k6/http';
import { 
  BASE_URL, 
  THRESHOLDS,
  PROFILES,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  AUTH_TOKEN,
  TEST_PRODUCT_IDS,
  randomProductId,
} from '../config.js';
import { 
  login,
  toggleFavorite,
  authHeaders,
  favoritesDuration,
  errorRate,
} from '../helpers.js';
import { Counter } from 'k6/metrics';

const favoritesFailures = new Counter('favorites_failures');

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

let cachedToken = AUTH_TOKEN;

export const options = {
  scenarios: {
    favorites: {
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
    'favorites_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
    'favorites_failures': ['count<10'],
    'error_rate': [`rate<${THRESHOLDS.http_req_failed_rate}`],
  },
};

export function setup() {
  if (!cachedToken) {
    cachedToken = login(BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  }
  return { token: cachedToken };
}

export default function (data) {
  const token = data.token || AUTH_TOKEN;
  
  if (!token) {
    favoritesFailures.add(1);
    sleep(2);
    return;
  }
  
  const productId = randomProductId();
  const action = Math.random() > 0.5 ? 'add' : 'remove';
  
  const res = toggleFavorite(BASE_URL, productId, token, action);
  
  // 200, 201, 204, or 404 (already removed) are acceptable
  const acceptable = [200, 201, 204, 404].includes(res.status);
  
  if (!acceptable) {
    favoritesFailures.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
  
  // Short think time
  sleep(Math.random() * 1 + 0.5);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/favorites.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== FAVORITES LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Base URL: ${BASE_URL}\n\n`;
  
  if (data.metrics.favorites_duration) {
    summary += `Favorites Duration:\n`;
    summary += `  p50: ${data.metrics.favorites_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.favorites_duration.values['p(95)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.favorites_failures) {
    summary += `Favorites Failures: ${data.metrics.favorites_failures.values.count || 0}\n`;
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

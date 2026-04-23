/**
 * Scenario: Concurrent Dashboard Loads
 * 
 * Tests authenticated dashboard views (orders, quotes, favorites).
 */

import { sleep, check, group } from 'k6';
import http from 'k6/http';
import { 
  BASE_URL, 
  THRESHOLDS,
  PROFILES,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  AUTH_TOKEN,
} from '../config.js';
import { 
  login,
  loadDashboard,
  authHeaders,
  dashboardDuration,
  errorRate,
} from '../helpers.js';
import { Counter } from 'k6/metrics';

const dashboardFailures = new Counter('dashboard_failures');

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

let cachedToken = AUTH_TOKEN;

export const options = {
  scenarios: {
    dashboard_load: {
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
    'dashboard_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95 * 2}`], // Allow 2x for multiple calls
    'dashboard_failures': ['count<10'],
    'error_rate': [`rate<${THRESHOLDS.http_req_failed_rate}`],
  },
};

export function setup() {
  // Get auth token for all VUs
  if (!cachedToken) {
    cachedToken = login(BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  }
  return { token: cachedToken };
}

export default function (data) {
  const token = data.token || AUTH_TOKEN;
  
  if (!token) {
    dashboardFailures.add(1);
    sleep(2);
    return;
  }
  
  group('Customer Dashboard', function () {
    const responses = loadDashboard(BASE_URL, token);
    
    let allOk = true;
    responses.forEach((res, i) => {
      const ok = res.status === 200;
      if (!ok && res.status !== 401) {
        allOk = false;
      }
    });
    
    if (!allOk) {
      dashboardFailures.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });
  
  // Simulate user reviewing dashboard
  sleep(Math.random() * 4 + 2);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/dashboard-load.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== DASHBOARD LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Base URL: ${BASE_URL}\n\n`;
  
  if (data.metrics.dashboard_duration) {
    summary += `Dashboard Load Duration (batch):\n`;
    summary += `  p50: ${data.metrics.dashboard_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.dashboard_duration.values['p(95)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.dashboard_failures) {
    summary += `Dashboard Failures: ${data.metrics.dashboard_failures.values.count || 0}\n`;
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

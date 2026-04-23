/**
 * Scenario: Concurrent Buyer Logins
 * 
 * Tests authentication system under load.
 * Measures login latency and failure rates.
 */

import { sleep } from 'k6';
import { 
  BASE_URL, 
  TEST_USER_EMAIL, 
  TEST_USER_PASSWORD,
  THRESHOLDS,
  PROFILES,
} from '../config.js';
import { 
  login, 
  loginDuration, 
  loginFailures,
  errorRate,
} from '../helpers.js';

// Get profile from environment or default to normal
const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

export const options = {
  scenarios: {
    buyer_login: {
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
    'login_duration': [`p(95)<${THRESHOLDS.login_duration_p95}`],
    'login_failures': ['count<10'],
    'error_rate': [`rate<${THRESHOLDS.http_req_failed_rate}`],
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
  },
};

export default function () {
  // Each VU attempts login with unique-ish email to avoid rate limiting
  const vuEmail = `loadtest+vu${__VU}@glovecubs.com`;
  
  const token = login(BASE_URL, vuEmail, TEST_USER_PASSWORD);
  
  if (token) {
    // Simulate user session
    sleep(Math.random() * 2 + 1);
  } else {
    // Wait longer on failure to avoid hammering
    sleep(Math.random() * 3 + 2);
  }
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: '  ' }),
    'results/buyer-login.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  let summary = '\n=== BUYER LOGIN LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Base URL: ${BASE_URL}\n\n`;
  
  // Login metrics
  if (data.metrics.login_duration) {
    summary += `Login Duration:\n`;
    summary += `${indent}p50: ${data.metrics.login_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `${indent}p95: ${data.metrics.login_duration.values['p(95)']?.toFixed(2)}ms\n`;
    summary += `${indent}p99: ${data.metrics.login_duration.values['p(99)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.login_failures) {
    summary += `Login Failures: ${data.metrics.login_failures.values.count || 0}\n`;
  }
  
  if (data.metrics.error_rate) {
    summary += `Error Rate: ${(data.metrics.error_rate.values.rate * 100).toFixed(2)}%\n`;
  }
  
  // HTTP metrics
  if (data.metrics.http_reqs) {
    summary += `\nTotal Requests: ${data.metrics.http_reqs.values.count}\n`;
    summary += `RPS: ${data.metrics.http_reqs.values.rate?.toFixed(2)}\n`;
  }
  
  // Threshold results
  summary += '\n=== THRESHOLDS ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary += `${indent}${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }
  
  return summary;
}

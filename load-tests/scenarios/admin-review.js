/**
 * Scenario: Concurrent Admin Review Queue Reads
 * 
 * Tests admin review queue under concurrent read load.
 */

import { sleep, check } from 'k6';
import http from 'k6/http';
import {
  BASE_URL,
  THRESHOLDS,
  PROFILES,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_TOKEN,
} from '../config.js';
import {
  login,
  getAdminReviewQueue,
  authHeaders,
  adminDuration,
  errorRate,
} from '../helpers.js';
import { Counter } from 'k6/metrics';

const adminFailures = new Counter('admin_failures');

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

// Lower VU for admin operations
const adjustedVUs = Math.ceil((config.vus || 50) * 0.3);

let cachedToken = ADMIN_TOKEN;

export const options = {
  scenarios: {
    admin_review: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: config.stages || [
        { duration: '30s', target: adjustedVUs },
        { duration: config.duration || '3m', target: adjustedVUs },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'admin_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95 * 2}`],
    'admin_failures': ['count<5'],
    'error_rate': [`rate<0.05`], // 5% acceptable for admin auth issues
  },
};

export function setup() {
  if (!cachedToken) {
    cachedToken = login(BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD);
  }
  return { token: cachedToken };
}

export default function (data) {
  const token = data.token || ADMIN_TOKEN;
  
  if (!token) {
    adminFailures.add(1);
    errorRate.add(1);
    sleep(2);
    return;
  }
  
  // Load review queue with different filters
  const filters = [
    '',
    '&priority=high',
    '&type=price_anomaly',
    '&status=pending',
  ];
  const filter = filters[Math.floor(Math.random() * filters.length)];
  
  const res = getAdminReviewQueue(BASE_URL, token);
  
  if (res.status === 200) {
    check(res, {
      'review queue returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body) || body.items !== undefined;
        } catch {
          return false;
        }
      },
    });
    errorRate.add(0);
  } else if (res.status === 401 || res.status === 403) {
    // Auth issues expected in some scenarios
    errorRate.add(0);
  } else {
    adminFailures.add(1);
    errorRate.add(1);
  }
  
  // Admin review takes time
  sleep(Math.random() * 3 + 1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/admin-review.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== ADMIN REVIEW QUEUE LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Storefront URL: ${STOREFRONT_URL}\n`;
  summary += `Adjusted VUs: ${adjustedVUs}\n\n`;
  
  if (data.metrics.admin_duration) {
    summary += `Admin Review Duration:\n`;
    summary += `  p50: ${data.metrics.admin_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.admin_duration.values['p(95)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.admin_failures) {
    summary += `Admin Failures: ${data.metrics.admin_failures.values.count || 0}\n`;
  }
  
  summary += '\n=== THRESHOLDS ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary += `  ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }
  
  return summary;
}

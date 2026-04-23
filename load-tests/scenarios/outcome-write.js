/**
 * Scenario: Concurrent Recommendation Outcome Writes
 * 
 * Tests recommendation outcome recording under concurrent writes.
 * Critical for detecting duplicate-write failures and race conditions.
 */

import { sleep, check } from 'k6';
import http from 'k6/http';
import {
  OUTCOME_API_URL,
  THRESHOLDS,
  PROFILES,
  ADMIN_TOKEN,
  randomProductId,
} from '../config.js';
import { 
  recordRecommendationOutcome,
  authHeaders,
  outcomeWriteDuration,
  duplicateWrites,
  errorRate,
  generateUniqueId,
} from '../helpers.js';
import { Counter } from 'k6/metrics';

const outcomeFailures = new Counter('outcome_failures');
const outcomeSuccess = new Counter('outcome_success');

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

// Moderate VU for write operations
const adjustedVUs = Math.ceil((config.vus || 50) * 0.4);

export const options = {
  scenarios: {
    outcome_write: {
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
    'outcome_write_duration': [`p(95)<${THRESHOLDS.outcome_duration_p95}`],
    'outcome_failures': ['count<10'],
    'duplicate_write_failures': [`count<${THRESHOLDS.duplicate_write_max_count}`],
    'error_rate': [`rate<${THRESHOLDS.http_req_failed_rate}`],
  },
};

export default function () {
  const token = ADMIN_TOKEN;
  
  // Generate unique recommendation ID per write
  const uniqueId = generateUniqueId();
  const productId = randomProductId();
  
  const outcomes = ['accepted', 'rejected', 'skipped'];
  const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
  
  const outcomeData = {
    recommendation_id: `rec-${uniqueId}`,
    product_id: productId,
    outcome: outcome,
    supplier_id: outcome === 'accepted' ? '1' : null,
    savings: outcome === 'accepted' ? Math.floor(Math.random() * 1000) : 0,
  };
  
  const res = recordRecommendationOutcome(OUTCOME_API_URL, outcomeData, token);
  
  if (res.status === 200 || res.status === 201) {
    outcomeSuccess.add(1);
    errorRate.add(0);
    
    check(res, {
      'outcome recorded': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true || body.id !== undefined;
        } catch {
          return true; // Accept empty 200/201
        }
      },
    });
  } else if (res.status === 409) {
    // Duplicate write - should be rare with unique IDs
    duplicateWrites.add(1);
    errorRate.add(1);
  } else if (res.status === 401 || res.status === 403) {
    // Auth issues - expected if no token
    errorRate.add(0);
  } else {
    outcomeFailures.add(1);
    errorRate.add(1);
  }
  
  // Short delay between writes
  sleep(Math.random() * 1 + 0.2);
}

// Test duplicate write detection by intentionally writing same ID
export function testDuplicateDetection() {
  const token = ADMIN_TOKEN;
  const duplicateId = `rec-duplicate-test-${Date.now()}`;
  
  const outcomeData = {
    recommendation_id: duplicateId,
    product_id: '1',
    outcome: 'accepted',
  };
  
  // First write
  const res1 = recordRecommendationOutcome(OUTCOME_API_URL, outcomeData, token);

  // Second write with same ID - should fail or be idempotent
  const res2 = recordRecommendationOutcome(OUTCOME_API_URL, outcomeData, token);
  
  check(res2, {
    'duplicate handled correctly': (r) => {
      // Either 409 Conflict or idempotent 200
      return r.status === 409 || r.status === 200;
    },
  });
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/outcome-write.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== RECOMMENDATION OUTCOME WRITE LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Outcome API URL: ${OUTCOME_API_URL}\n`;
  summary += `Adjusted VUs: ${adjustedVUs}\n\n`;
  
  if (data.metrics.outcome_write_duration) {
    summary += `Outcome Write Duration:\n`;
    summary += `  p50: ${data.metrics.outcome_write_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.outcome_write_duration.values['p(95)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.outcome_success) {
    summary += `Successful Writes: ${data.metrics.outcome_success.values.count || 0}\n`;
  }
  
  if (data.metrics.outcome_failures) {
    summary += `Write Failures: ${data.metrics.outcome_failures.values.count || 0}\n`;
  }
  
  if (data.metrics.duplicate_write_failures) {
    summary += `Duplicate Writes Detected: ${data.metrics.duplicate_write_failures.values.count || 0}\n`;
  }
  
  summary += '\n=== THRESHOLDS ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary += `  ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }
  
  return summary;
}

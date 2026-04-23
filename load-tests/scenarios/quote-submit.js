/**
 * Scenario: Concurrent Quote Submissions
 * 
 * Tests RFQ/quote submission system under load.
 * Critical for buyer conversion flow.
 */

import { sleep, check } from 'k6';
import http from 'k6/http';
import { 
  BASE_URL, 
  THRESHOLDS,
  PROFILES,
  AUTH_TOKEN,
} from '../config.js';
import { 
  submitQuote,
  login,
  quoteDuration,
  quoteFailures,
  errorRate,
  generateUniqueId,
} from '../helpers.js';

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

// Lower VU count for quote submissions (they create real data)
const vuMultiplier = profile === 'stress' ? 0.5 : profile === 'spike' ? 0.3 : 1;
const adjustedVUs = Math.ceil((config.vus || 50) * vuMultiplier);

export const options = {
  scenarios: {
    quote_submit: {
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
    'quote_duration': [`p(95)<${THRESHOLDS.quote_duration_p95}`],
    'quote_failures': ['count<5'],
    'error_rate': [`rate<${THRESHOLDS.http_req_failed_rate}`],
    'http_req_duration': [`p(95)<${THRESHOLDS.http_req_duration_p99}`],
  },
};

export default function () {
  const uniqueId = generateUniqueId();
  
  // Create unique quote data
  const quoteData = {
    company_name: `LoadTest Company ${uniqueId}`,
    contact_name: `Test User VU${__VU}`,
    email: `loadtest+${uniqueId}@glovecubs-test.com`,
    phone: '555-0100',
    quantity: String(Math.floor(Math.random() * 10000) + 100),
    type: ['Nitrile Gloves', 'Latex Gloves', 'Vinyl Gloves'][Math.floor(Math.random() * 3)],
    use_case: ['Industrial', 'Medical', 'Food Service', 'Laboratory'][Math.floor(Math.random() * 4)],
    notes: `Load test quote submission - VU${__VU} - ${new Date().toISOString()}`,
  };
  
  const res = submitQuote(BASE_URL, quoteData, AUTH_TOKEN || null);
  
  // Verify quote was created
  if (res.status === 200 || res.status === 201) {
    try {
      const body = JSON.parse(res.body);
      check(body, {
        'quote has id or rfq_id': (b) => b.id !== undefined || b.rfq_id !== undefined || b.success === true,
      });
    } catch (e) {
      // Continue
    }
  }
  
  // Longer sleep between quote submissions
  sleep(Math.random() * 5 + 2);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/quote-submit.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== QUOTE SUBMISSION LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Base URL: ${BASE_URL}\n`;
  summary += `Adjusted VUs: ${adjustedVUs} (to limit test data creation)\n\n`;
  
  if (data.metrics.quote_duration) {
    summary += `Quote Submission Duration:\n`;
    summary += `  p50: ${data.metrics.quote_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.quote_duration.values['p(95)']?.toFixed(2)}ms\n`;
    summary += `  p99: ${data.metrics.quote_duration.values['p(99)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.quote_failures) {
    summary += `Quote Failures: ${data.metrics.quote_failures.values.count || 0}\n`;
  }
  
  if (data.metrics.http_reqs) {
    summary += `Total Quotes Submitted: ${data.metrics.http_reqs.values.count}\n`;
    summary += `Submissions/sec: ${data.metrics.http_reqs.values.rate?.toFixed(2)}\n`;
  }
  
  summary += '\n=== THRESHOLDS ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary += `  ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }
  
  return summary;
}

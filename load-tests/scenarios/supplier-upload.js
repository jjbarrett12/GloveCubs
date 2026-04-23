/**
 * Scenario: Concurrent Supplier Feed Upload Metadata/Preview
 * 
 * Tests supplier portal read operations under load.
 * Does NOT test actual file uploads (destructive).
 */

import { sleep, check, group } from 'k6';
import http from 'k6/http';
import { 
  STOREFRONT_URL, 
  THRESHOLDS,
  PROFILES,
  SUPPLIER_EMAIL,
  SUPPLIER_PASSWORD,
  SUPPLIER_TOKEN,
  TEST_UPLOAD_ID,
} from '../config.js';
import { 
  getSupplierUploadStatus,
  getSupplierUploadPreview,
  authHeaders,
  supplierDuration,
  errorRate,
} from '../helpers.js';
import { Counter } from 'k6/metrics';

const supplierFailures = new Counter('supplier_failures');

const profile = __ENV.PROFILE || 'normal';
const config = PROFILES[profile] || PROFILES.normal;

// Lower VU for supplier operations
const adjustedVUs = Math.ceil((config.vus || 50) * 0.2);

let cachedToken = SUPPLIER_TOKEN;

export const options = {
  scenarios: {
    supplier_upload: {
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
    'supplier_duration': [`p(95)<${THRESHOLDS.http_req_duration_p95 * 2}`],
    'supplier_failures': ['count<5'],
    'error_rate': [`rate<0.05`],
  },
};

export function setup() {
  // Supplier login if no token
  if (!cachedToken) {
    const loginRes = http.post(`${STOREFRONT_URL}/supplier-portal/api/auth`, 
      JSON.stringify({ email: SUPPLIER_EMAIL, password: SUPPLIER_PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (loginRes.status === 200) {
      try {
        const body = JSON.parse(loginRes.body);
        cachedToken = body.token;
      } catch (e) {}
    }
  }
  return { token: cachedToken, uploadId: TEST_UPLOAD_ID };
}

export default function (data) {
  const token = data.token || SUPPLIER_TOKEN;
  const uploadId = data.uploadId || TEST_UPLOAD_ID;
  
  if (!token) {
    supplierFailures.add(1);
    errorRate.add(1);
    sleep(2);
    return;
  }
  
  group('Supplier Upload Operations', function () {
    if (uploadId) {
      // Get upload status
      const statusRes = getSupplierUploadStatus(STOREFRONT_URL, uploadId, token);
      
      if (statusRes.status === 200) {
        check(statusRes, {
          'status returns upload data': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.status !== undefined || body.upload !== undefined;
            } catch {
              return false;
            }
          },
        });
      }
      
      // Get preview rows
      const previewRes = getSupplierUploadPreview(STOREFRONT_URL, uploadId, token);
      
      if (previewRes.status === 200) {
        check(previewRes, {
          'preview returns rows': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.rows !== undefined || Array.isArray(body);
            } catch {
              return false;
            }
          },
        });
      }
    } else {
      // No upload ID - just test the endpoint availability
      const params = {
        headers: authHeaders(token),
        tags: { name: 'supplier_ping' },
      };
      
      const res = http.get(`${STOREFRONT_URL}/supplier-portal/api/feed-upload?action=status`, params);
      
      // 400 (missing upload_id) or 401 are acceptable responses
      if (res.status !== 400 && res.status !== 401 && res.status !== 200) {
        supplierFailures.add(1);
        errorRate.add(1);
      } else {
        errorRate.add(0);
      }
    }
  });
  
  // Supplier review takes time
  sleep(Math.random() * 4 + 2);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/supplier-upload.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  let summary = '\n=== SUPPLIER UPLOAD LOAD TEST RESULTS ===\n\n';
  
  summary += `Profile: ${profile}\n`;
  summary += `Storefront URL: ${STOREFRONT_URL}\n`;
  summary += `Adjusted VUs: ${adjustedVUs}\n\n`;
  
  if (data.metrics.supplier_duration) {
    summary += `Supplier API Duration:\n`;
    summary += `  p50: ${data.metrics.supplier_duration.values['p(50)']?.toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.supplier_duration.values['p(95)']?.toFixed(2)}ms\n\n`;
  }
  
  if (data.metrics.supplier_failures) {
    summary += `Supplier Failures: ${data.metrics.supplier_failures.values.count || 0}\n`;
  }
  
  summary += '\n=== THRESHOLDS ===\n';
  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    summary += `  ${name}: ${threshold.ok ? 'PASS' : 'FAIL'}\n`;
  }
  
  return summary;
}

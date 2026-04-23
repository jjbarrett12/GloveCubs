/**
 * Load Test Report Generator
 * 
 * Aggregates k6 JSON results into a summary report.
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');

function loadResults() {
  const results = {};
  
  if (!fs.existsSync(RESULTS_DIR)) {
    console.log('No results directory found.');
    return results;
  }
  
  const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const name = path.basename(file, '.json');
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));
      results[name] = data;
    } catch (e) {
      console.error(`Failed to parse ${file}:`, e.message);
    }
  }
  
  return results;
}

function extractMetrics(data) {
  const metrics = {};
  
  if (data.metrics) {
    for (const [name, metric] of Object.entries(data.metrics)) {
      if (metric.values) {
        metrics[name] = {
          count: metric.values.count,
          rate: metric.values.rate,
          p50: metric.values['p(50)'],
          p95: metric.values['p(95)'],
          p99: metric.values['p(99)'],
          min: metric.values.min,
          max: metric.values.max,
          avg: metric.values.avg,
        };
      }
    }
  }
  
  return metrics;
}

function extractThresholds(data) {
  const thresholds = {};
  
  if (data.thresholds) {
    for (const [name, threshold] of Object.entries(data.thresholds)) {
      thresholds[name] = threshold.ok;
    }
  }
  
  return thresholds;
}

function generateReport(results) {
  const timestamp = new Date().toISOString();
  
  let report = `
================================================================================
                    GLOVECUBS LOAD TEST REPORT
                    Generated: ${timestamp}
================================================================================

`;

  // Summary table
  report += `SCENARIO SUMMARY
--------------------------------------------------------------------------------
`;
  report += `${'Scenario'.padEnd(25)} | ${'Status'.padEnd(10)} | ${'p95 (ms)'.padEnd(12)} | ${'Error %'.padEnd(10)} | ${'RPS'.padEnd(10)}\n`;
  report += '-'.repeat(80) + '\n';
  
  for (const [name, data] of Object.entries(results)) {
    const metrics = extractMetrics(data);
    const thresholds = extractThresholds(data);
    
    const allPassed = Object.values(thresholds).every(v => v);
    const status = allPassed ? 'PASS' : 'FAIL';
    
    const httpDuration = metrics.http_req_duration;
    const p95 = httpDuration?.p95?.toFixed(0) || 'N/A';
    
    const errorRate = metrics.http_req_failed?.rate || metrics.error_rate?.rate || 0;
    const errorPct = (errorRate * 100).toFixed(2);
    
    const rps = metrics.http_reqs?.rate?.toFixed(1) || 'N/A';
    
    report += `${name.padEnd(25)} | ${status.padEnd(10)} | ${p95.padStart(12)} | ${errorPct.padStart(10)}% | ${rps.padStart(10)}\n`;
  }
  
  // Detailed results
  report += `
================================================================================
DETAILED RESULTS BY SCENARIO
================================================================================
`;

  for (const [name, data] of Object.entries(results)) {
    report += `
--- ${name.toUpperCase()} ---
`;
    
    const metrics = extractMetrics(data);
    const thresholds = extractThresholds(data);
    
    // Thresholds
    report += `\nThresholds:\n`;
    for (const [tName, passed] of Object.entries(thresholds)) {
      report += `  ${tName}: ${passed ? 'PASS' : 'FAIL'}\n`;
    }
    
    // Key metrics
    report += `\nKey Metrics:\n`;
    
    if (metrics.http_req_duration) {
      report += `  HTTP Duration:\n`;
      report += `    p50: ${metrics.http_req_duration.p50?.toFixed(2)}ms\n`;
      report += `    p95: ${metrics.http_req_duration.p95?.toFixed(2)}ms\n`;
      report += `    p99: ${metrics.http_req_duration.p99?.toFixed(2)}ms\n`;
    }
    
    if (metrics.http_reqs) {
      report += `  Requests: ${metrics.http_reqs.count} total, ${metrics.http_reqs.rate?.toFixed(2)} req/s\n`;
    }
    
    // Custom metrics
    const customMetrics = Object.entries(metrics).filter(([name]) => 
      !name.startsWith('http_') && 
      !name.startsWith('iteration') && 
      !name.startsWith('vus') &&
      !name.startsWith('data_')
    );
    
    if (customMetrics.length > 0) {
      report += `\nCustom Metrics:\n`;
      for (const [mName, mData] of customMetrics) {
        if (mData.p95 !== undefined) {
          report += `  ${mName}: p95=${mData.p95?.toFixed(2)}ms\n`;
        } else if (mData.count !== undefined) {
          report += `  ${mName}: count=${mData.count}\n`;
        } else if (mData.rate !== undefined) {
          report += `  ${mName}: rate=${(mData.rate * 100).toFixed(2)}%\n`;
        }
      }
    }
  }
  
  // Endpoint failures
  report += `
================================================================================
ENDPOINT-SPECIFIC FAILURES
================================================================================
`;

  for (const [name, data] of Object.entries(results)) {
    const metrics = extractMetrics(data);
    const failures = Object.entries(metrics)
      .filter(([mName, mData]) => mName.includes('failure') && mData.count > 0)
      .map(([mName, mData]) => ({ name: mName, count: mData.count }));
    
    if (failures.length > 0) {
      report += `\n${name}:\n`;
      for (const f of failures) {
        report += `  ${f.name}: ${f.count}\n`;
      }
    }
  }
  
  // Recommendations
  report += `
================================================================================
RECOMMENDATIONS
================================================================================
`;

  let hasIssues = false;
  
  for (const [name, data] of Object.entries(results)) {
    const metrics = extractMetrics(data);
    const thresholds = extractThresholds(data);
    
    const failedThresholds = Object.entries(thresholds).filter(([, ok]) => !ok);
    
    if (failedThresholds.length > 0) {
      hasIssues = true;
      report += `\n${name}:\n`;
      for (const [tName] of failedThresholds) {
        if (tName.includes('duration')) {
          report += `  - Response time threshold exceeded. Consider:\n`;
          report += `    - Database query optimization\n`;
          report += `    - Adding caching\n`;
          report += `    - Scaling horizontally\n`;
        } else if (tName.includes('error') || tName.includes('failure')) {
          report += `  - Error rate threshold exceeded. Investigate:\n`;
          report += `    - Server logs for errors\n`;
          report += `    - Rate limiting configuration\n`;
          report += `    - Resource exhaustion\n`;
        } else if (tName.includes('duplicate')) {
          report += `  - Duplicate write failures detected. Fix:\n`;
          report += `    - Implement idempotency keys\n`;
          report += `    - Add database constraints\n`;
          report += `    - Review concurrent write handling\n`;
        }
      }
    }
  }
  
  if (!hasIssues) {
    report += `\nAll scenarios passed thresholds. System appears healthy under tested load.\n`;
  }
  
  report += `
================================================================================
                              END OF REPORT
================================================================================
`;

  return report;
}

// Main
const results = loadResults();

if (Object.keys(results).length === 0) {
  console.log('No test results found. Run tests first:');
  console.log('  npm run test:smoke');
  console.log('  npm run test:normal');
  process.exit(0);
}

const report = generateReport(results);
console.log(report);

// Save report
const reportPath = path.join(RESULTS_DIR, `report-${Date.now()}.txt`);
fs.writeFileSync(reportPath, report);
console.log(`Report saved to: ${reportPath}`);

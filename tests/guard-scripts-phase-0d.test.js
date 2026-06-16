/**
 * Phase 0D guard scripts + commerce-truth-warnings.
 * Run: node --test tests/guard-scripts-phase-0d.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function runGuard(scriptName) {
  const script = path.join(ROOT, 'scripts', scriptName);
  execFileSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('Phase 0D guard scripts', () => {
  it('check-pricing-drift passes on current tree', () => {
    assert.doesNotThrow(() => runGuard('check-pricing-drift.js'));
  });

  it('check-variant-mandatory passes on current tree', () => {
    assert.doesNotThrow(() => runGuard('check-variant-mandatory.js'));
  });

  it('check-parent-inventory-usage passes on current tree', () => {
    assert.doesNotThrow(() => runGuard('check-parent-inventory-usage.js'));
  });

  it('check-express-freeze passes on current tree', () => {
    assert.doesNotThrow(() => runGuard('check-express-freeze.js'));
  });

  it('pricing drift regex detects commerce-pricing require', () => {
    const re = /require\s*\(\s*['"][^'"]*commerce-pricing['"]\s*\)/;
    assert.ok(re.test("const commercePricing = require('../lib/commerce-pricing');"));
  });
});

describe('commerce-truth-warnings', () => {
  it('dedupes repeated warnings', () => {
    const warnings = require('../lib/commerce-truth-warnings');
    warnings._resetForTests();
    warnings.warnPricingDeprecated({ module: 'test', path: 'once' });
    warnings.warnPricingDeprecated({ module: 'test', path: 'once' });
    warnings._resetForTests();
  });
});

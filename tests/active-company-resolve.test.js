/**
 * Active company resolution (shared lib). Run: node --test tests/active-company-resolve.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { computeActiveCompanyResolution } = require('../lib/active-company-resolve');

describe('computeActiveCompanyResolution', () => {
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('deterministic ordering for multi-company ambiguity', () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [b, a],
      storedActive: null,
    });
    assert.strictEqual(r.requiresSelection, true);
    assert.deepStrictEqual(r.memberships, [a, b]);
  });

  it('invalid company switch target rejected at compute layer when not member', () => {
    const r = computeActiveCompanyResolution({
      membershipIdsSorted: [a],
      storedActive: b,
    });
    assert.strictEqual(r.companyId, a);
    assert.strictEqual(r.requiresSelection, false);
  });
});

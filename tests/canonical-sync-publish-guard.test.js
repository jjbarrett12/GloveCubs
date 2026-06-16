/**
 * Publish must not call dropped catalogos.sync_canonical_products RPC.
 * Run: node --test tests/canonical-sync-publish-guard.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SYNC_SERVICE = path.join(ROOT, 'catalogos', 'src', 'lib', 'publish', 'canonical-sync-service.ts');

describe('canonical-sync publish guard', () => {
  it('canonical-sync-service does not invoke sync_canonical_products RPC', () => {
    const text = fs.readFileSync(SYNC_SERVICE, 'utf8');
    assert.ok(!/\.rpc\s*\(\s*['"]sync_canonical_products['"]/.test(text));
    assert.ok(text.includes('20261111120400'));
  });
});

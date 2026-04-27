/**
 * CI guard: catalog product service must not read list/bulk/cost from catalog metadata.
 * Run: node --test tests/commerce-pricing-metadata-guard.test.js
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SERVICE_FILE = path.join(__dirname, '..', 'services', 'catalogosProductService.js');

describe('commerce-pricing-metadata-guard', () => {
  it('catalogosProductService.js has no metadata-based pricing reads', () => {
    const src = fs.readFileSync(SERVICE_FILE, 'utf8');
    const forbidden = [
      'attrs.list_price',
      'attrs.bulk_price',
      'attrs.unit_cost',
      'attrs.retail_price',
      'attrs.cost',
      'meta.list_price',
      'facet.list_price',
    ];
    for (const frag of forbidden) {
      assert.equal(
        src.includes(frag),
        false,
        `Forbidden pricing-from-metadata fragment "${frag}" found in ${SERVICE_FILE}`,
      );
    }
  });
});

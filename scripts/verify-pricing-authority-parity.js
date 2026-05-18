'use strict';

/**
 * Phase 0E: staging parity gate — cart/checkout must use pricing-authority-checkout when cutover flag is on.
 * Run with PRICING_AUTHORITY_V2_CHECKOUT=1 in staging after shadow parity review.
 *
 * Usage:
 *   node scripts/verify-pricing-authority-parity.js
 *   PRICING_AUTHORITY_V2_CHECKOUT=1 node scripts/verify-pricing-authority-parity.js
 */

const assert = require('assert');
const {
  isPricingAuthorityV2CheckoutEnabled,
  resolveCheckoutLineUnitPrice,
} = require('../lib/pricing-authority-checkout');
const { isVariantMandatoryEnforceEnabled } = require('../lib/commercial-line-identity');
const { isVariantInventoryAuthorityEnabled } = require('../lib/variant-inventory-authority');

function flagSummary() {
  return {
    PRICING_AUTHORITY_V2_CHECKOUT: isPricingAuthorityV2CheckoutEnabled(),
    PRICING_AUTHORITY_V2_SHADOW: process.env.PRICING_AUTHORITY_V2_SHADOW === '1',
    VARIANT_MANDATORY_ENFORCE: isVariantMandatoryEnforceEnabled(),
    VARIANT_INVENTORY_AUTHORITY: isVariantInventoryAuthorityEnabled(),
  };
}

async function main() {
  const flags = flagSummary();
  console.log('pricing-authority-parity flags:', JSON.stringify(flags));

  assert.strictEqual(typeof resolveCheckoutLineUnitPrice, 'function');
  assert.strictEqual(typeof isPricingAuthorityV2CheckoutEnabled, 'function');

  if (flags.PRICING_AUTHORITY_V2_CHECKOUT) {
    if (!flags.VARIANT_MANDATORY_ENFORCE) {
      console.warn(
        'WARN: PRICING_AUTHORITY_V2_CHECKOUT without VARIANT_MANDATORY_ENFORCE — variant identity may be incomplete on cart lines.',
      );
    }
    if (!flags.VARIANT_INVENTORY_AUTHORITY) {
      console.warn(
        'WARN: PRICING_AUTHORITY_V2_CHECKOUT without VARIANT_INVENTORY_AUTHORITY — checkout may still reserve parent inventory.',
      );
    }
  }

  console.log('verify-pricing-authority-parity: OK (module contract)');
}

main().catch((err) => {
  console.error('verify-pricing-authority-parity: FAIL', err.message || err);
  process.exit(1);
});

/**
 * Phase 0C: variant inventory authority + shadow.
 * Run: node --test tests/variant-inventory-authority.test.js
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const authorityResolved = path.join(__dirname, '..', 'lib', 'variant-inventory-authority.js');
const inventoryResolved = path.join(__dirname, '..', 'lib', 'inventory.js');

const VARIANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('variant-inventory-authority', () => {
  const origAuthority = process.env.VARIANT_INVENTORY_AUTHORITY;
  const origShadow = process.env.VARIANT_INVENTORY_SHADOW;

  afterEach(() => {
    process.env.VARIANT_INVENTORY_AUTHORITY = origAuthority;
    process.env.VARIANT_INVENTORY_SHADOW = origShadow;
    delete require.cache[authorityResolved];
    delete require.cache[inventoryResolved];
  });

  it('flags respect env', () => {
    process.env.VARIANT_INVENTORY_AUTHORITY = '1';
    delete require.cache[authorityResolved];
    const mod = require('../lib/variant-inventory-authority');
    assert.equal(mod.isVariantInventoryAuthorityEnabled(), true);
    process.env.VARIANT_INVENTORY_AUTHORITY = 'off';
    delete require.cache[authorityResolved];
    assert.equal(require('../lib/variant-inventory-authority').isVariantInventoryAuthorityEnabled(), false);
  });

  it('checkVariantAvailability fail-closed when row missing', async () => {
    process.env.VARIANT_INVENTORY_AUTHORITY = '1';
    delete require.cache[authorityResolved];

    const adminPath = path.join(__dirname, '..', 'lib', 'supabaseAdmin.js');
    const origAdmin = require.cache[adminPath];
    require.cache[adminPath] = {
      id: adminPath,
      filename: adminPath,
      loaded: true,
      exports: {
        isSupabaseAdminConfigured: () => true,
        getSupabaseAdmin: () => ({
          schema() {
            return {
              from(table) {
                assert.equal(table, 'variant_inventory');
                return {
                  select() {
                    return {
                      eq() {
                        return {
                          eq() {
                            return { maybeSingle: async () => ({ data: null, error: null }) };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        }),
      },
    };

    const { checkVariantAvailability } = require('../lib/variant-inventory-authority');
    const r = await checkVariantAvailability(
      [{ catalog_variant_id: VARIANT_ID, quantity: 2 }],
      { failClosed: true },
    );
    assert.equal(r.ok, false);
    assert.equal(r.insufficient[0].code, 'MISSING_VARIANT_INVENTORY');

    require.cache[adminPath] = origAdmin;
  });

  it('checkVariantAvailability passes when enough variant stock', async () => {
    const adminPath = path.join(__dirname, '..', 'lib', 'supabaseAdmin.js');
    const origAdmin = require.cache[adminPath];
    require.cache[adminPath] = {
      id: adminPath,
      filename: adminPath,
      loaded: true,
      exports: {
        isSupabaseAdminConfigured: () => true,
        getSupabaseAdmin: () => ({
          schema() {
            return {
              from() {
                return {
                  select() {
                    return {
                      eq() {
                        return {
                          eq() {
                            return {
                              maybeSingle: async () => ({
                                data: {
                                  catalog_variant_id: VARIANT_ID,
                                  location_code: 'default',
                                  quantity_on_hand: 10,
                                  quantity_reserved: 2,
                                },
                                error: null,
                              }),
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        }),
      },
    };

    delete require.cache[authorityResolved];
    const { checkVariantAvailability } = require('../lib/variant-inventory-authority');
    const r = await checkVariantAvailability([{ catalog_variant_id: VARIANT_ID, quantity: 5 }], {
      failClosed: true,
    });
    assert.equal(r.ok, true);

    require.cache[adminPath] = origAdmin;
  });
});

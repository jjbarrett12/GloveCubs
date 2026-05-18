#!/usr/bin/env node
/**
 * STAGING ONLY — commerce truth smoke (variant identity + pricing authority + cart/checkout parity).
 *
 * Validates against a running Express API (not unit tests). Does not mutate catalog data.
 *
 * Usage:
 *   GC_SMOKE_BASE_URL=https://staging-api.example.com \
 *   GC_SMOKE_CATALOG_PRODUCT_ID=... \
 *   GC_SMOKE_CATALOG_VARIANT_ID=... \
 *   GC_SMOKE_VARIANT_SKU=... \
 *   GC_SMOKE_AUTH_TOKEN=... \
 *   GC_SMOKE_ASSUME_FLAGS_ON=1 \
 *   npm run smoke:commerce-truth
 *
 * Required server flags (cannot be queried remotely):
 *   VARIANT_MANDATORY_ENFORCE=1
 *   PRICING_AUTHORITY_V2_CHECKOUT=1
 *   VARIANT_INVENTORY_AUTHORITY=1
 * Set GC_SMOKE_ASSUME_FLAGS_ON=1 after confirming flags on the staging Express process.
 */

const REQUIRED_FLAG_BUNDLE = [
  'VARIANT_MANDATORY_ENFORCE=1',
  'PRICING_AUTHORITY_V2_CHECKOUT=1',
  'VARIANT_INVENTORY_AUTHORITY=1',
];

const LEGACY_PRICING_SOURCE = 'commerce-pricing.resolveLineUnitPriceForCheckout';

function die(msg, detail) {
  console.error(`\n[commerce-truth-smoke] FAIL: ${msg}`);
  if (detail != null) {
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2);
    const capped = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
    console.error(capped);
  }
  process.exit(1);
}

function warn(msg) {
  console.warn(`[commerce-truth-smoke] WARN: ${msg}`);
}

function roundCents(n) {
  return Math.round(Number(n) * 100) / 100;
}

function normUuid(v) {
  return String(v || '').trim().toLowerCase();
}

function isAuthorityPricingSource(src) {
  const s = String(src || '');
  if (!s || s === LEGACY_PRICING_SOURCE) return false;
  return (
    s.includes('tier_off_list') ||
    s.includes('guest_sellable') ||
    s.includes('company_tier') ||
    s.includes('pricing_authority')
  );
}

function printFlagChecklist() {
  console.log('\n[commerce-truth-smoke] Required Express staging flags (verify on server, not via API):');
  for (const line of REQUIRED_FLAG_BUNDLE) console.log(`  - ${line}`);
  console.log('  Storefront: VARIANT_MANDATORY_ENFORCE=1 (quote-request route)\n');
}

async function readJson(res) {
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw */
  }
  return { status: res.status, data, raw: text };
}

async function apiFetch(baseUrl, path, { method = 'GET', body, token, sessionId } = {}) {
  const headers = { Accept: 'application/json' };
  if (body != null) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (sessionId) headers['x-session-id'] = sessionId;

  const res = await fetch(new URL(path, baseUrl).toString(), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return readJson(res);
}

function findCartLine(cart, variantId, productId) {
  const vid = normUuid(variantId);
  const pid = normUuid(productId);
  if (!Array.isArray(cart)) return null;
  return (
    cart.find((line) => normUuid(line.catalog_variant_id) === vid) ||
    cart.find(
      (line) =>
        normUuid(line.catalog_variant_id) === vid &&
        normUuid(line.canonical_product_id || line.product_id) === pid,
    ) ||
    null
  );
}

function assertEnv() {
  const baseUrl = process.env.GC_SMOKE_BASE_URL;
  const catalogProductId = process.env.GC_SMOKE_CATALOG_PRODUCT_ID;
  const catalogVariantId = process.env.GC_SMOKE_CATALOG_VARIANT_ID;
  const variantSku = process.env.GC_SMOKE_VARIANT_SKU;
  const quantity = parseInt(process.env.GC_SMOKE_QUANTITY || '1', 10);

  if (!baseUrl) die('GC_SMOKE_BASE_URL is required (staging Express API root, no trailing path).');
  if (!catalogProductId) die('GC_SMOKE_CATALOG_PRODUCT_ID is required.');
  if (!catalogVariantId) die('GC_SMOKE_CATALOG_VARIANT_ID is required.');
  if (!variantSku || !String(variantSku).trim()) die('GC_SMOKE_VARIANT_SKU is required.');
  if (!Number.isInteger(quantity) || quantity < 1) die('GC_SMOKE_QUANTITY must be a positive integer.');

  if (String(baseUrl).includes('localhost') === false && !process.env.GC_SMOKE_CONFIRM_STAGING) {
    warn(
      'GC_SMOKE_BASE_URL does not look local. Set GC_SMOKE_CONFIRM_STAGING=1 to run against non-localhost.',
    );
    die('Refusing to run without GC_SMOKE_CONFIRM_STAGING=1 for remote URLs.');
  }

  printFlagChecklist();
  if (process.env.GC_SMOKE_ASSUME_FLAGS_ON !== '1') {
    die(
      'Set GC_SMOKE_ASSUME_FLAGS_ON=1 after confirming the required flag bundle is enabled on staging Express.',
    );
  }

  const token = process.env.GC_SMOKE_AUTH_TOKEN?.trim() || null;
  if (!token) {
    die('GC_SMOKE_AUTH_TOKEN is required (checkout quote uses authenticated user cart).');
  }

  let sessionId = process.env.GC_SMOKE_SESSION_ID?.trim() || null;
  if (!sessionId) {
    sessionId = `smoke-${Date.now()}`;
    console.log(`[commerce-truth-smoke] Generated x-session-id: ${sessionId}`);
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    catalogProductId,
    catalogVariantId,
    variantSku: String(variantSku).trim(),
    quantity,
    token,
    sessionId,
    expectAuthority: true,
  };
}

async function main() {
  console.log('[commerce-truth-smoke] STAGING commerce truth smoke — do not run against production without review.\n');

  const cfg = assertEnv();

  // Clear authenticated cart for a clean line (best-effort).
  const del = await apiFetch(cfg.baseUrl, '/api/cart', {
    method: 'DELETE',
    token: cfg.token,
    sessionId: cfg.sessionId,
  });
  if (del.status !== 200) {
    warn(`DELETE /api/cart returned ${del.status} (continuing).`);
  }

  const cartPostBody = {
    canonical_product_id: cfg.catalogProductId,
    product_id: cfg.catalogProductId,
    catalog_variant_id: cfg.catalogVariantId,
    variant_sku: cfg.variantSku,
    quantity: cfg.quantity,
  };

  const post = await apiFetch(cfg.baseUrl, '/api/cart', {
    method: 'POST',
    body: cartPostBody,
    token: cfg.token,
    sessionId: cfg.sessionId,
  });
  if (post.status !== 200 || !post.data?.success) {
    die(`POST /api/cart failed (${post.status}).`, post.data ?? post.raw);
  }

  const get = await apiFetch(cfg.baseUrl, '/api/cart', {
    token: cfg.token,
    sessionId: cfg.sessionId,
  });
  if (get.status !== 200) {
    die(`GET /api/cart failed (${get.status}).`, get.data ?? get.raw);
  }

  const line = findCartLine(get.data, cfg.catalogVariantId, cfg.catalogProductId);
  if (!line) {
    die('Cart line not found after POST.', { cart_lines: get.data?.length, variant: cfg.catalogVariantId });
  }

  if (normUuid(line.catalog_variant_id) !== normUuid(cfg.catalogVariantId)) {
    die('catalog_variant_id mismatch on cart line.', {
      expected: cfg.catalogVariantId,
      got: line.catalog_variant_id,
    });
  }
  if (String(line.variant_sku || '').trim() !== cfg.variantSku) {
    die('variant_sku mismatch on cart line.', { expected: cfg.variantSku, got: line.variant_sku });
  }
  if (line.commercial_status != null && line.commercial_status !== 'valid') {
    die('commercial_status is not valid.', {
      commercial_status: line.commercial_status,
      catalog_error: line.catalog_error,
    });
  }
  if (line.catalog_error) {
    die('cart line has catalog_error.', { catalog_error: line.catalog_error });
  }

  const cartUnit = line.checkout_unit_price;
  if (cartUnit == null || !Number.isFinite(Number(cartUnit))) {
    die('checkout_unit_price missing or invalid on cart line.', line);
  }

  const pricingSource = line.pricing_source;
  if (!pricingSource) {
    die('pricing_source missing on cart line (expected with pricing authority cutover).', line);
  }
  if (cfg.expectAuthority && !isAuthorityPricingSource(pricingSource)) {
    die('pricing_source does not indicate Pricing Authority V2.', {
      pricing_source: pricingSource,
      hint: `Expected authority path, not ${LEGACY_PRICING_SOURCE}`,
    });
  }

  const quoteBody = {
    shipping_address: {
      full_name: 'Commerce Truth Smoke',
      address_line1: '1 Main St',
      city: 'New York',
      state: 'NY',
      zip_code: '10001',
    },
    cart_lines: [
      {
        canonical_product_id: cfg.catalogProductId,
        catalog_variant_id: cfg.catalogVariantId,
      },
    ],
  };

  const quote = await apiFetch(cfg.baseUrl, '/api/checkout/quote', {
    method: 'POST',
    body: quoteBody,
    token: cfg.token,
    sessionId: cfg.sessionId,
  });
  if (quote.status !== 200 || !quote.data?.ok) {
    die(`POST /api/checkout/quote failed (${quote.status}).`, quote.data ?? quote.raw);
  }

  const quoteLine =
    (quote.data.lines || []).find((l) => normUuid(l.catalog_variant_id) === normUuid(cfg.catalogVariantId)) ||
    (quote.data.lines || []).find((l) => normUuid(l.product_id) === normUuid(cfg.catalogProductId));

  if (!quoteLine) {
    die('Quote line not found for smoke variant.', { lines: quote.data.lines });
  }

  const checkoutUnit = quoteLine.unit_price;
  if (checkoutUnit == null || !Number.isFinite(Number(checkoutUnit))) {
    die('unit_price missing on quote line.', quoteLine);
  }

  if (roundCents(cartUnit) !== roundCents(checkoutUnit)) {
    die('Cart checkout_unit_price does not match checkout quote unit_price.', {
      cart_unit_price: cartUnit,
      checkout_unit_price: checkoutUnit,
    });
  }

  if (normUuid(quoteLine.catalog_variant_id) !== normUuid(cfg.catalogVariantId)) {
    die('catalog_variant_id mismatch on quote line.', quoteLine);
  }
  if (String(quoteLine.variant_sku || '').trim() !== cfg.variantSku) {
    die('variant_sku mismatch on quote line.', quoteLine);
  }

  console.log('\n[commerce-truth-smoke] PASS');
  console.log(
    JSON.stringify(
      {
        catalog_variant_id: cfg.catalogVariantId,
        variant_sku: cfg.variantSku,
        catalog_product_id: cfg.catalogProductId,
        quantity: cfg.quantity,
        cart_unit_price: roundCents(cartUnit),
        checkout_unit_price: roundCents(checkoutUnit),
        pricing_source: pricingSource,
        commercial_status: line.commercial_status ?? 'valid',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  die(err.message || String(err));
});

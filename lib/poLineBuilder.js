/**
 * Purchase order line resolution from customer orders (drop-ship).
 * Variant-aware lines: printed PO SKU / item number = catalog_v2.catalog_variants.variant_sku.
 * supplier_offers supplies supplier_id, price, and cost — not the printed line SKU when a catalog variant is present.
 * Legacy lines (no catalog_variant_id on the order item): printed SKU may come from supplier_offers.sku when explicitly allowed.
 */

const { getSupabaseAdmin } = require('./supabaseAdmin');
const { normalizeCanonicalUuidInput } = require('./resolve-canonical-product-id');

const TRUST_RANK = { high_trust: 0, medium_trust: 1, low_trust: 2, unknown: 3 };

function poAuditLog(event, payload) {
  try {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        component: 'po-build',
        event,
        ...payload,
      })
    );
  } catch (_) {
    console.error('[po-build]', event, payload);
  }
}

/**
 * Map catalog supplier.settings JSON to public.manufacturers.id when configured.
 * Set suppliers.settings.manufacturer_id (or mfg_id / public_manufacturer_id) in Supabase for strict matching.
 */
function supplierSettingsManufacturerId(settings) {
  if (!settings || typeof settings !== 'object') return null;
  const v = settings.manufacturer_id ?? settings.mfg_id ?? settings.public_manufacturer_id;
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {Array<{ id: string, supplier_id: string, sku?: string, price?: unknown, cost?: unknown }>} offers
 * @param {Map<string, { settings?: object }>} supplierById
 * @param {number} manufacturerId
 * @returns {{ ok: true, offer: object } | { ok: false, code: string, message: string, meta?: object }}
 */
function selectOfferForPoLine(offers, supplierById, manufacturerId) {
  if (!offers || offers.length === 0) {
    return {
      ok: false,
      code: 'MISSING_SUPPLIER_OFFER',
      message: 'No active supplier offer exists for this catalog product (variant).',
    };
  }

  const hasAnyLinkage = offers.some(
    (o) => supplierSettingsManufacturerId(supplierById.get(o.supplier_id)?.settings) != null
  );

  const linked = offers.filter(
    (o) => supplierSettingsManufacturerId(supplierById.get(o.supplier_id)?.settings) === manufacturerId
  );

  if (linked.length >= 1) {
    return { ok: true, offer: linked[0] };
  }

  if (hasAnyLinkage) {
    poAuditLog('NO_OFFER_FOR_MANUFACTURER', {
      manufacturer_id: manufacturerId,
      offer_supplier_ids: offers.map((o) => o.supplier_id),
    });
    return {
      ok: false,
      code: 'NO_SUPPLIER_OFFER_FOR_MANUFACTURER',
      message:
        'Supplier offers exist but none are linked to this manufacturer. Set suppliers.settings.manufacturer_id to the public.manufacturers.id for the correct vendor rows.',
      meta: { manufacturer_id: manufacturerId, supplier_ids: [...new Set(offers.map((o) => o.supplier_id))] },
    };
  }

  if (offers.length === 1) {
    poAuditLog('PO_SINGLE_UNLINKED_OFFER', {
      manufacturer_id: manufacturerId,
      supplier_id: offers[0].supplier_id,
      offer_id: offers[0].id,
    });
    return { ok: true, offer: offers[0] };
  }

  poAuditLog('AMBIGUOUS_SUPPLIER_OFFER', {
    manufacturer_id: manufacturerId,
    offer_count: offers.length,
  });
  return {
    ok: false,
    code: 'AMBIGUOUS_SUPPLIER_OFFER',
    message:
      'Multiple active supplier offers exist without supplier↔manufacturer linkage. Set suppliers.settings.manufacturer_id or leave only one active offer per catalog variant.',
    meta: { offer_count: offers.length },
  };
}

async function rankOffersByTrustAndPrice(supabase, offers) {
  if (offers.length <= 1) return offers;
  const ids = offers.map((o) => o.id).filter(Boolean);
  const { data: scores } = await supabase
    .from('offer_trust_scores')
    .select('offer_id, trust_band')
    .in('offer_id', ids);
  const bandByOffer = new Map((scores || []).map((s) => [s.offer_id, s.trust_band]));
  return [...offers].sort((a, b) => {
    const ra = TRUST_RANK[bandByOffer.get(a.id)] ?? TRUST_RANK.unknown;
    const rb = TRUST_RANK[bandByOffer.get(b.id)] ?? TRUST_RANK.unknown;
    if (ra !== rb) return ra - rb;
    const pa = Number(a.price);
    const pb = Number(b.price);
    const na = Number.isFinite(pa) ? pa : Infinity;
    const nb = Number.isFinite(pb) ? pb : Infinity;
    return na - nb;
  });
}

function allowLegacyPoWithoutCatalogVariant(ctx) {
  if (ctx && ctx.allowLegacyPoLinesWithoutCatalogVariant === true) return true;
  return process.env.PO_ALLOW_LEGACY_ORDER_LINES_WITHOUT_CATALOG_VARIANT === '1';
}

/**
 * Resolve every order line to a PO line or collect blocking reasons (no silent drops).
 *
 * @param {object} order - must include items[] from _enrichOrderWithItems / admin
 * @param {{ orderId?: string|number, supabase?: import('@supabase/supabase-js').SupabaseClient, allowLegacyPoLinesWithoutCatalogVariant?: boolean }} ctx
 * @returns {Promise<
 *   | { ok: true, byManufacturer: Map<number, object[]> }
 *   | { ok: false, code: string, blocked_lines: object[] }
 * >}
 */
async function buildPurchaseOrderLinesFromOrder(order, ctx = {}) {
  const supabase = ctx.supabase || getSupabaseAdmin();
  const items = order.items || [];
  const orderId = ctx.orderId ?? order.id;

  if (items.length === 0) {
    poAuditLog('PO_BUILD_FAILED', { order_id: orderId, reason: 'NO_ORDER_LINES' });
    return {
      ok: false,
      code: 'NO_ORDER_LINES',
      blocked_lines: [
        {
          order_line_index: null,
          code: 'NO_ORDER_LINES',
          message: 'Order has no line items.',
        },
      ],
    };
  }

  const blocked_lines = [];
  /** @type {Map<number, object[]>} */
  const byManufacturer = new Map();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const canonical =
      normalizeCanonicalUuidInput(item.canonical_product_id) || normalizeCanonicalUuidInput(item.product_id);
    const lineVariantId = normalizeCanonicalUuidInput(item.catalog_variant_id);
    const lineCtx = {
      order_line_index: idx,
      order_item_id: item.order_item_id ?? null,
      canonical_product_id: canonical,
      catalog_variant_id: lineVariantId || null,
    };

    if (!canonical) {
      poAuditLog('MISSING_CATALOG_PRODUCT_ID', lineCtx);
      blocked_lines.push({
        ...lineCtx,
        code: 'MISSING_CATALOG_PRODUCT_ID',
        message: 'Order line is missing canonical_product_id (catalog_v2.catalog_products UUID).',
      });
      continue;
    }

    if (!lineVariantId && !allowLegacyPoWithoutCatalogVariant(ctx)) {
      poAuditLog('MISSING_CATALOG_VARIANT_FOR_PO', lineCtx);
      blocked_lines.push({
        ...lineCtx,
        code: 'MISSING_CATALOG_VARIANT_FOR_PO',
        message:
          'Order line has no catalog_variant_id. PO generation requires variant-scoped lines. For pre-migration orders, set PO_ALLOW_LEGACY_ORDER_LINES_WITHOUT_CATALOG_VARIANT=1 or pass ctx.allowLegacyPoLinesWithoutCatalogVariant.',
      });
      continue;
    }

    const productRow = await supabase
      .schema('catalog_v2')
      .from('catalog_products')
      .select('id, manufacturer_id')
      .eq('id', canonical)
      .maybeSingle();
    if (productRow.error) {
      poAuditLog('PO_LINE_PRODUCT_QUERY_ERROR', { ...lineCtx, error: productRow.error.message });
      blocked_lines.push({
        ...lineCtx,
        code: 'PRODUCT_LOOKUP_ERROR',
        message: productRow.error.message,
      });
      continue;
    }
    const pr = productRow.data;
    if (!pr) {
      poAuditLog('PRODUCT_NOT_FOUND', lineCtx);
      blocked_lines.push({
        ...lineCtx,
        code: 'PRODUCT_NOT_FOUND',
        message: `No catalog_v2.catalog_products row for id=${canonical}.`,
      });
      continue;
    }

    const manufacturerId = pr.manufacturer_id != null ? parseInt(String(pr.manufacturer_id), 10) : null;
    if (manufacturerId == null || !Number.isFinite(manufacturerId)) {
      poAuditLog('MISSING_MANUFACTURER_MAPPING', lineCtx);
      blocked_lines.push({
        ...lineCtx,
        code: 'MISSING_MANUFACTURER_MAPPING',
        message: 'Catalog product has no manufacturer_id. Assign a manufacturer before creating a PO.',
      });
      continue;
    }

    let printedPoSku = '';
    if (lineVariantId) {
      const { data: vRow, error: vErr } = await supabase
        .schema('catalog_v2')
        .from('catalog_variants')
        .select('id, variant_sku, catalog_product_id, is_active')
        .eq('id', lineVariantId)
        .maybeSingle();
      if (vErr) {
        poAuditLog('CATALOG_VARIANT_QUERY_ERROR', { ...lineCtx, error: vErr.message });
        blocked_lines.push({
          ...lineCtx,
          code: 'CATALOG_VARIANT_QUERY_ERROR',
          message: vErr.message,
        });
        continue;
      }
      if (!vRow || !vRow.is_active) {
        blocked_lines.push({
          ...lineCtx,
          code: 'CATALOG_VARIANT_INACTIVE_OR_MISSING',
          message: 'catalog_variant_id does not reference an active catalog variant.',
        });
        continue;
      }
      if (String(vRow.catalog_product_id) !== String(canonical)) {
        blocked_lines.push({
          ...lineCtx,
          code: 'CATALOG_VARIANT_PARENT_MISMATCH',
          message: 'catalog_variant_id does not belong to this order line catalog product.',
        });
        continue;
      }
      printedPoSku = String(vRow.variant_sku || '').trim();
      if (!printedPoSku) {
        blocked_lines.push({
          ...lineCtx,
          code: 'VARIANT_SKU_BLANK',
          message: 'Active catalog variant has no variant_sku for PO line.',
        });
        continue;
      }
    }

    const { data: offerRows, error: offerErr } = await supabase
      .from('supplier_offers')
      .select('id, sku, price, cost, supplier_id, product_id, product_name, is_active')
      .eq('product_id', canonical)
      .eq('is_active', true);

    if (offerErr) {
      poAuditLog('SUPPLIER_OFFER_QUERY_ERROR', { ...lineCtx, error: offerErr.message });
      blocked_lines.push({
        ...lineCtx,
        canonical_product_id: canonical,
        code: 'SUPPLIER_OFFER_QUERY_ERROR',
        message: offerErr.message,
      });
      continue;
    }

    const offers = offerRows || [];
    const supplierIds = [...new Set(offers.map((o) => o.supplier_id).filter(Boolean))];
    let supplierById = new Map();
    if (supplierIds.length > 0) {
      const { data: sups, error: supErr } = await supabase
        .from('suppliers')
        .select('id, settings')
        .in('id', supplierIds);
      if (supErr) {
        poAuditLog('SUPPLIER_QUERY_ERROR', { ...lineCtx, error: supErr.message });
        blocked_lines.push({
          ...lineCtx,
          canonical_product_id: canonical,
          code: 'SUPPLIER_QUERY_ERROR',
          message: supErr.message,
        });
        continue;
      }
      supplierById = new Map((sups || []).map((s) => [s.id, s]));
    }

    const ranked = await rankOffersByTrustAndPrice(supabase, offers);
    const picked = selectOfferForPoLine(ranked, supplierById, manufacturerId);
    if (!picked.ok) {
      poAuditLog('PO_LINE_BLOCKED', {
        ...lineCtx,
        canonical_product_id: canonical,
        manufacturer_id: manufacturerId,
        block_code: picked.code,
      });
      blocked_lines.push({
        ...lineCtx,
        canonical_product_id: canonical,
        manufacturer_id: manufacturerId,
        code: picked.code,
        message: picked.message,
        meta: picked.meta,
      });
      continue;
    }

    const offer = picked.offer;
    const supplierSku = (offer.sku && String(offer.sku).trim()) || '';

    if (lineVariantId) {
      // Printed PO item number is always catalog variant purchase SKU; supplier offer SKU is not used for display.
      if (!supplierSku) {
        poAuditLog('MISSING_SUPPLIER_SKU_NON_PRINTING', {
          ...lineCtx,
          offer_id: offer.id,
          note: 'Variant line uses catalog variant for printed sku; offer row has empty sku — allowed for pricing-only rows.',
        });
      }
    } else {
      if (!supplierSku) {
        poAuditLog('MISSING_SUPPLIER_SKU', {
          ...lineCtx,
          offer_id: offer.id,
          canonical_product_id: canonical,
        });
        blocked_lines.push({
          ...lineCtx,
          canonical_product_id: canonical,
          manufacturer_id: manufacturerId,
          supplier_offer_id: offer.id,
          code: 'MISSING_SUPPLIER_SKU',
          message: 'Selected supplier offer has no SKU (manufacturer-facing part number required on supplier_offers).',
        });
        continue;
      }
      printedPoSku = supplierSku;
    }

    const costRaw = offer.cost != null ? Number(offer.cost) : null;
    const priceRaw = offer.price != null ? Number(offer.price) : null;
    const unitCost =
      costRaw != null && Number.isFinite(costRaw) && costRaw > 0
        ? costRaw
        : priceRaw != null && Number.isFinite(priceRaw)
          ? priceRaw
          : 0;

    const poLine = {
      product_id: canonical,
      canonical_product_id: canonical,
      catalog_variant_id: lineVariantId || null,
      supplier_id: offer.supplier_id,
      supplier_offer_id: offer.id,
      sku: printedPoSku,
      name: (item.name || item.product_name || offer.product_name || '').trim() || printedPoSku,
      quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
      unit_cost: unitCost,
    };

    if (!byManufacturer.has(manufacturerId)) byManufacturer.set(manufacturerId, []);
    byManufacturer.get(manufacturerId).push(poLine);
  }

  if (blocked_lines.length > 0) {
    poAuditLog('PO_BUILD_FAILED', {
      order_id: orderId,
      blocked_count: blocked_lines.length,
      codes: blocked_lines.map((b) => b.code),
    });
    return {
      ok: false,
      code: 'PO_LINE_VALIDATION_FAILED',
      blocked_lines,
    };
  }

  return { ok: true, byManufacturer };
}

module.exports = {
  buildPurchaseOrderLinesFromOrder,
  supplierSettingsManufacturerId,
  selectOfferForPoLine,
  poAuditLog,
};

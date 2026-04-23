/**
 * Orders, carts, inventory, purchase_orders, and other entities via Supabase.
 * Handles these collections (Supabase). No JSON file persistence.
 * Commercial records (orders, RFQs, ship-to, invoices) use company-scoped ownership.
 */

const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { normalizeCanonicalUuidInput } = require('../lib/resolve-canonical-product-id');
const companiesService = require('./companiesService');
const { buildGcOrderLinesForInsert } = require('../lib/buildGcOrderLines');
const {
  dollarsToMinor,
  normalizeGcOrderHeaderForApi,
  normalizeGcOrderLinesForApi,
} = require('../lib/gcOrderNormalize');

const GC = 'gc_commerce';

async function _fetchGcOrderLines(supabase, orderId) {
  const { data: lines, error } = await supabase
    .schema(GC)
    .from('order_lines')
    .select('*, sellable_products(sku, display_name, catalog_product_id)')
    .eq('order_id', orderId)
    .order('line_number', { ascending: true });
  if (error) throw error;
  return lines || [];
}

async function _attachGcOrderItems(orderHeaderApi) {
  if (!orderHeaderApi) return orderHeaderApi;
  const supabase = getSupabaseAdmin();
  const lines = await _fetchGcOrderLines(supabase, orderHeaderApi.id);
  orderHeaderApi.items = normalizeGcOrderLinesForApi(lines);
  return orderHeaderApi;
}

// ---------- Orders (company-scoped, gc_commerce UUID model) ----------
/** Get orders for a company. companyIds = gc UUIDs from getCompanyIdsForUser. fallbackUserId = auth UUID. */
async function getOrdersByCompanyId(companyIds, fallbackUserId) {
  const supabase = getSupabaseAdmin();
  let q = supabase.schema(GC).from('orders').select('*');
  if (companyIds && companyIds.length > 0) {
    const orParts = [`company_id.in.(${companyIds.join(',')})`];
    if (fallbackUserId != null) orParts.push(`and(company_id.is.null,placed_by_user_id.eq.${fallbackUserId})`);
    q = q.or(orParts.join(','));
  } else if (fallbackUserId != null) {
    q = q.eq('placed_by_user_id', fallbackUserId);
  }
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  const orders = [];
  for (const raw of data || []) {
    const o = normalizeGcOrderHeaderForApi(raw);
    await _attachGcOrderItems(o);
    orders.push(o);
  }
  return orders;
}

/** Get order by UUID if user's company owns it or user created it. */
async function getOrderByIdForCompany(orderId, companyIds, fallbackUserId) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase.schema(GC).from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error || !order) return null;
  const canAccess = (companyIds && companyIds.length > 0 && order.company_id != null && companyIds.some((c) => String(c) === String(order.company_id))) ||
    (order.company_id == null && String(order.placed_by_user_id) === String(fallbackUserId));
  if (!canAccess) return null;
  const o = normalizeGcOrderHeaderForApi(order);
  return await _attachGcOrderItems(o);
}

/** @deprecated Use getOrdersByCompanyId. Kept for tests. */
async function getOrdersByUserId(userId) {
  return getOrdersByCompanyId([], userId);
}

/** @deprecated Use getOrderByIdForCompany. Kept for tests. */
async function getOrderById(orderId, userId) {
  return getOrderByIdForCompany(orderId, [], userId);
}

async function getOrderByIdAdmin(orderId) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase.schema(GC).from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const o = normalizeGcOrderHeaderForApi(order);
  return await _attachGcOrderItems(o);
}

async function getOrderByStripePaymentIntentId(paymentIntentId) {
  if (paymentIntentId == null || String(paymentIntentId).trim() === '') return null;
  const supabase = getSupabaseAdmin();
  const id = String(paymentIntentId).trim();
  const { data: order, error } = await supabase.schema(GC).from('orders').select('*').eq('stripe_payment_intent_id', id).maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const o = normalizeGcOrderHeaderForApi(order);
  return await _attachGcOrderItems(o);
}

/** Mark order for manual review when Stripe charge does not match persisted order.total. */
async function flagPaymentIntegrityHold(orderId, notes) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .schema(GC)
    .from('orders')
    .update({
      payment_integrity_hold: true,
      payment_integrity_notes: notes != null ? String(notes).slice(0, 8000) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
  if (error) throw error;
}

/**
 * Find recent pending_payment order for a user (within last 10 minutes).
 * Used for idempotency - prevent duplicate orders on resubmit.
 */
async function getRecentPendingPaymentOrder(userId, windowMinutes = 10) {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .schema(GC)
    .from('orders')
    .select('*')
    .eq('placed_by_user_id', userId)
    .eq('status', 'pending_payment')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const o = normalizeGcOrderHeaderForApi(data);
  return await _attachGcOrderItems(o);
}

/** POST /api/orders: find order by Idempotency-Key (scoped to auth user UUID). */
async function getOrderByUserIdempotencyKey(userId, idempotencyKey) {
  if (idempotencyKey == null || String(idempotencyKey).trim() === '') return null;
  const supabase = getSupabaseAdmin();
  const key = String(idempotencyKey).trim();
  const { data: order, error } = await supabase
    .schema(GC)
    .from('orders')
    .select('*')
    .eq('placed_by_user_id', userId)
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;
  const o = normalizeGcOrderHeaderForApi(order);
  return await _attachGcOrderItems(o);
}

/**
 * Get stale pending_payment orders older than given minutes.
 * Used for cleanup job.
 */
async function getStalePendingPaymentOrders(olderThanMinutes = 60) {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .schema(GC)
    .from('orders')
    .select('id, order_number, placed_by_user_id, created_at')
    .eq('status', 'pending_payment')
    .lt('created_at', cutoff);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    order_number: r.order_number,
    user_id: r.placed_by_user_id,
    created_at: r.created_at,
  }));
}

async function getAllOrdersAdmin(filters = {}) {
  const supabase = getSupabaseAdmin();
  let q = supabase.schema(GC).from('orders').select('*').order('created_at', { ascending: false });
  if (filters.payment_integrity_hold === true) q = q.eq('payment_integrity_hold', true);
  if (filters.status) q = q.eq('status', String(filters.status));
  const { data: orders, error } = await q;
  if (error) throw error;
  const result = [];
  for (const raw of orders || []) {
    const o = normalizeGcOrderHeaderForApi(raw);
    await _attachGcOrderItems(o);
    result.push(o);
  }
  return result;
}

/** Operator queues: payment holds, inventory anomalies, stale checkout (no items expansion). */
async function getAdminOrderOperationalAlerts(limit = 80) {
  const supabase = getSupabaseAdmin();
  const lim = Math.min(200, Math.max(1, Number(limit) || 80));
  const sel =
    'id, order_number, status, total_minor, created_at, updated_at, payment_method, stripe_payment_intent_id, payment_confirmed_at, payment_integrity_hold, payment_integrity_notes, inventory_reserved_at, inventory_released_at, inventory_deducted_at';

  const olderThan = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const gcOrders = () => supabase.schema(GC).from('orders');
  const [holds, shippedNoDeduct, cancelledReserved, stalePending] = await Promise.all([
    gcOrders().select(sel).eq('payment_integrity_hold', true).order('updated_at', { ascending: false }).limit(lim),
    gcOrders()
      .select(sel)
      .eq('status', 'shipped')
      .is('inventory_deducted_at', null)
      .order('updated_at', { ascending: false })
      .limit(lim),
    gcOrders()
      .select(sel)
      .eq('status', 'cancelled')
      .not('inventory_reserved_at', 'is', null)
      .is('inventory_released_at', null)
      .is('inventory_deducted_at', null)
      .order('updated_at', { ascending: false })
      .limit(lim),
    gcOrders()
      .select(sel)
      .eq('status', 'pending_payment')
      .lt('created_at', olderThan)
      .order('created_at', { ascending: true })
      .limit(lim),
  ]);

  const mapAlertRow = (r) => {
    if (!r) return r;
    const { total_minor, ...rest } = r;
    return { ...rest, total: (Number(total_minor) || 0) / 100 };
  };

  return {
    payment_integrity_holds: (holds.data || []).map(mapAlertRow),
    shipped_without_inventory_deduct: (shippedNoDeduct.data || []).map(mapAlertRow),
    cancelled_still_reserved: (cancelledReserved.data || []).map(mapAlertRow),
    pending_payment_stale_over_1h: (stalePending.data || []).map(mapAlertRow),
    query_errors: {
      holds: holds.error?.message,
      shipped: shippedNoDeduct.error?.message,
      cancelled: cancelledReserved.error?.message,
      stale: stalePending.error?.message,
    },
  };
}

async function updateOrderStatus(orderId, status) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .schema(GC)
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

/** Cancel after failed inventory reserve; clears idempotency_key so the same key can retry checkout. */
async function cancelOrderClearIdempotencyKey(orderId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .schema(GC)
    .from('orders')
    .update({
      status: 'cancelled',
      idempotency_key: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
  if (error) throw error;
}

function _gcOrderInsertRowFromPayload(rest, { companyId, createdByUserId }) {
  const metaIn = rest.metadata && typeof rest.metadata === 'object' ? { ...rest.metadata } : {};
  const metadata = { ...metaIn };
  if (rest.ship_to_id != null) metadata.ship_to_id = rest.ship_to_id;
  if (rest.notes != null) metadata.notes = rest.notes;
  if (rest.tracking_number != null) metadata.tracking_number = rest.tracking_number;
  if (rest.tracking_url != null) metadata.tracking_url = rest.tracking_url;
  if (rest.tax_rate != null && metadata.tax_rate == null) metadata.tax_rate = rest.tax_rate;
  if (rest.tax_reason != null && metadata.tax_reason == null) metadata.tax_reason = rest.tax_reason;
  if (rest.marketing_attribution != null && metadata.marketing_attribution == null) {
    metadata.marketing_attribution = rest.marketing_attribution;
  }
  if (rest.payment_method != null && metadata.payment_method == null) {
    metadata.payment_method = rest.payment_method;
  }

  const placedAt = rest.created_at || rest.placed_at || new Date().toISOString();

  const row = {
    company_id: companyId != null ? companyId : null,
    placed_by_user_id: createdByUserId != null ? createdByUserId : null,
    order_number: rest.order_number,
    status: rest.status || 'pending',
    currency_code: 'USD',
    subtotal_minor: dollarsToMinor(rest.subtotal),
    discount_minor: dollarsToMinor(rest.discount),
    shipping_minor: dollarsToMinor(rest.shipping),
    tax_minor: dollarsToMinor(rest.tax),
    total_minor: dollarsToMinor(rest.total),
    shipping_address: rest.shipping_address ?? null,
    metadata,
    idempotency_key: rest.idempotency_key ?? null,
    placed_at: placedAt,
    stripe_payment_intent_id: rest.stripe_payment_intent_id ?? null,
    payment_method: rest.payment_method ?? null,
    payment_confirmed_at: rest.payment_confirmed_at ?? null,
    marketing_attribution: rest.marketing_attribution ?? null,
    tax_rate: rest.tax_rate != null ? Number(rest.tax_rate) : null,
    tax_reason: rest.tax_reason ?? null,
  };
  const econ = [
    'shipping_policy_version_id',
    'is_free_shipping_at_order',
    'shipping_threshold_at_order',
    'shipping_flat_rate_at_order',
    'shipping_min_order_at_order',
    'shipping_policy_version',
    'estimated_fulfillment_cost_usd',
  ];
  for (const k of econ) {
    if (rest[k] !== undefined) row[k] = rest[k];
  }
  return row;
}

async function createOrder(orderPayload, { companyId, createdByUserId } = {}) {
  const supabase = getSupabaseAdmin();
  const { items, ...rest } = orderPayload;
  const row = _gcOrderInsertRowFromPayload(rest, { companyId, createdByUserId });
  const { data: order, error: orderErr } = await supabase.schema(GC).from('orders').insert(row).select('*').single();
  if (orderErr) throw orderErr;
  if (items && items.length) {
    const lineRows = await buildGcOrderLinesForInsert(supabase, order.id, items);
    if (lineRows.length) {
      const { error: liErr } = await supabase.schema(GC).from('order_lines').insert(lineRows);
      if (liErr) throw liErr;
    }
  }
  const o = normalizeGcOrderHeaderForApi(order);
  return await _attachGcOrderItems(o);
}

async function updateOrder(orderId, updates) {
  const supabase = getSupabaseAdmin();
  const { items, ...rest } = updates;
  const patch = { updated_at: new Date().toISOString() };
  const scalarAllowed = [
    'status',
    'stripe_payment_intent_id',
    'payment_method',
    'payment_confirmed_at',
    'payment_integrity_hold',
    'payment_integrity_notes',
    'inventory_reserved_at',
    'inventory_released_at',
    'inventory_deducted_at',
    'marketing_attribution',
    'shipping_address',
    'idempotency_key',
  ];
  for (const k of scalarAllowed) {
    if (rest[k] !== undefined) patch[k] = rest[k];
  }
  if (rest.subtotal !== undefined) patch.subtotal_minor = dollarsToMinor(rest.subtotal);
  if (rest.discount !== undefined) patch.discount_minor = dollarsToMinor(rest.discount);
  if (rest.shipping !== undefined) patch.shipping_minor = dollarsToMinor(rest.shipping);
  if (rest.tax !== undefined) patch.tax_minor = dollarsToMinor(rest.tax);
  if (rest.total !== undefined) patch.total_minor = dollarsToMinor(rest.total);
  if (rest.metadata !== undefined) patch.metadata = rest.metadata;
  if (rest.tax_rate !== undefined) patch.tax_rate = rest.tax_rate;
  if (rest.tax_reason !== undefined) patch.tax_reason = rest.tax_reason;
  const econ = [
    'shipping_policy_version_id',
    'is_free_shipping_at_order',
    'shipping_threshold_at_order',
    'shipping_flat_rate_at_order',
    'shipping_min_order_at_order',
    'shipping_policy_version',
    'estimated_fulfillment_cost_usd',
  ];
  for (const k of econ) {
    if (rest[k] !== undefined) patch[k] = rest[k];
  }

  if (Object.keys(patch).length > 1) {
    const { error } = await supabase.schema(GC).from('orders').update(patch).eq('id', orderId);
    if (error) throw error;
  }
  if (items) {
    await supabase.schema(GC).from('order_lines').delete().eq('order_id', orderId);
    if (items.length) {
      const lineRows = await buildGcOrderLinesForInsert(supabase, orderId, items);
      if (lineRows.length) {
        const { error: insErr } = await supabase.schema(GC).from('order_lines').insert(lineRows);
        if (insErr) throw insErr;
      }
    }
  }
}

// ---------- Carts ----------
async function getCart(cartKey) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(GC)
    .from('carts')
    .select('*')
    .eq('cart_key', cartKey)
    .maybeSingle();
  if (error) throw error;
  return data && data.items ? data.items : [];
}

async function setCart(cartKey, items) {
  const supabase = getSupabaseAdmin();
  const userId =
    typeof cartKey === 'string' && cartKey.startsWith('user_') && cartKey.length > 40
      ? cartKey.slice('user_'.length)
      : null;
  const row = {
    cart_key: cartKey,
    items: items || [],
    updated_at: new Date().toISOString(),
  };
  if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    row.user_id = userId;
    const companyId = await companiesService.getCompanyIdForUser({ id: userId });
    if (companyId) row.company_id = companyId;
  }
  const { error } = await supabase.schema(GC).from('carts').upsert(row, { onConflict: 'cart_key' });
  if (error) throw error;
}

// ---------- Inventory ----------
/** Rows keyed by canonical_product_id; `product_id` mirrors catalog UUID for admin UI. */
async function getInventory() {
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase.from('inventory').select('*');
  if (error) throw error;
  const list = rows || [];
  return list.map((r) => ({
    ...r,
    product_id: r.canonical_product_id != null ? String(r.canonical_product_id) : null,
  }));
}

async function getInventoryByProductId(productId) {
  const supabase = getSupabaseAdmin();
  const asCanon = normalizeCanonicalUuidInput(productId);
  if (!asCanon) return null;
  const { data, error } = await supabase.from('inventory').select('*').eq('canonical_product_id', asCanon).maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertInventory(productId, payload) {
  const supabase = getSupabaseAdmin();
  let canonical = normalizeCanonicalUuidInput(payload?.canonical_product_id);
  if (!canonical) {
    canonical = normalizeCanonicalUuidInput(productId);
  }
  if (!canonical) {
    const err = new Error('upsertInventory requires catalogos.products id (UUID) or payload.canonical_product_id');
    err.statusCode = 400;
    throw err;
  }

  const row = {
    canonical_product_id: canonical,
    quantity_on_hand: payload.quantity_on_hand ?? 0,
    reorder_point: payload.reorder_point ?? 0,
    updated_at: new Date().toISOString(),
  };
  if (payload.quantity_reserved !== undefined) row.quantity_reserved = payload.quantity_reserved;
  if (payload.bin_location !== undefined) row.bin_location = payload.bin_location;
  if (payload.last_count_at !== undefined) row.last_count_at = payload.last_count_at;

  const { error } = await supabase.from('inventory').upsert(row, { onConflict: 'canonical_product_id' });
  if (error) throw error;
}

// ---------- Manufacturers ----------
async function getManufacturers() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('manufacturers').select('*').order('name');
  if (error) throw error;
  return data || [];
}

// ---------- Purchase orders ----------
async function getPurchaseOrders() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getPurchaseOrderById(id) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function createPurchaseOrder(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('purchase_orders').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

async function updatePurchaseOrder(id, payload) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('purchase_orders').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ---------- Customer manufacturer pricing ----------
async function getCustomerManufacturerPricing() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.schema(GC).from('customer_manufacturer_pricing').select('*');
  if (error) throw error;
  return data || [];
}

// ---------- Contact messages ----------
async function createContactMessage(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('contact_messages').insert({ payload: payload || {} }).select('*').single();
  if (error) throw error;
  return data;
}

// ---------- Password reset tokens ----------
async function createPasswordResetToken(email, token, expiresAt, userId = null) {
  const supabase = getSupabaseAdmin();
  const row = { email, token, expires_at: expiresAt };
  if (userId != null) row.user_id = userId;
  const { error } = await supabase.from('password_reset_tokens').insert(row);
  if (error) throw error;
}

async function findPasswordResetToken(token) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('password_reset_tokens').select('*').eq('token', token).gt('expires_at', new Date().toISOString()).maybeSingle();
  return data;
}

async function deletePasswordResetToken(token) {
  const supabase = getSupabaseAdmin();
  await supabase.from('password_reset_tokens').delete().eq('token', token);
}

async function deletePasswordResetTokensByUserId(userId) {
  const supabase = getSupabaseAdmin();
  await supabase.from('password_reset_tokens').delete().eq('user_id', userId);
}

// ---------- Ship-to addresses (company-scoped) ----------
function _shipToRowToDto(row) {
  if (!row) return null;
  const addr = row.address && typeof row.address === 'object' ? row.address : {};
  return {
    id: row.id,
    company_id: row.company_id,
    created_by_user_id: row.created_by_user_id,
    label: row.label || 'Primary',
    address: addr.address || '',
    city: addr.city || '',
    state: addr.state || '',
    zip: addr.zip || '',
    is_default: !!row.is_default
  };
}

/** Get ship-to addresses for a company. */
async function getShipToByCompanyId(companyIds, fallbackUserId) {
  const supabase = getSupabaseAdmin();
  let q = supabase.schema(GC).from('ship_to_addresses').select('*');
  if (companyIds && companyIds.length > 0) {
    const orParts = [`company_id.in.(${companyIds.join(',')})`];
    if (fallbackUserId != null) orParts.push(`and(company_id.is.null,created_by_user_id.eq.${fallbackUserId})`);
    q = q.or(orParts.join(','));
  } else if (fallbackUserId != null) {
    q = q.eq('created_by_user_id', fallbackUserId);
  }
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(_shipToRowToDto);
}

/** @deprecated Use getShipToByCompanyId. */
async function getShipToByUserId(userId) {
  return getShipToByCompanyId([], userId);
}

async function createShipTo({ companyId, createdByUserId, label, address, city, state, zip, is_default }) {
  if (createdByUserId == null) throw new Error('createdByUserId required');
  const supabase = getSupabaseAdmin();
  const payload = {
    company_id: companyId ?? null,
    created_by_user_id: createdByUserId,
    label: (label || 'Primary').trim(),
    address: { address: address || '', city: city || '', state: state || '', zip: zip || '' },
    is_default: !!is_default,
  };
  const { data, error } = await supabase.schema(GC).from('ship_to_addresses').insert(payload).select('*').single();
  if (error) throw error;
  if (is_default) {
    let clear = supabase
      .schema(GC)
      .from('ship_to_addresses')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .neq('id', data.id);
    clear = companyId != null ? clear.eq('company_id', companyId) : clear.eq('created_by_user_id', createdByUserId);
    await clear;
  }
  return _shipToRowToDto(data);
}

/** Update ship-to if user's company owns it or user created it. */
async function updateShipTo(id, companyIds, fallbackUserId, updates) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: eErr } = await supabase
    .schema(GC)
    .from('ship_to_addresses')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (eErr || !existing) throw new Error('Ship-to address not found');
  const canAccess =
    (companyIds &&
      companyIds.length > 0 &&
      existing.company_id != null &&
      companyIds.some((c) => String(c) === String(existing.company_id))) ||
    (existing.company_id == null && String(existing.created_by_user_id) === String(fallbackUserId));
  if (!canAccess) throw new Error('Ship-to address not found');
  const addr = existing.address && typeof existing.address === 'object' ? { ...existing.address } : {};
  if (updates.address !== undefined) addr.address = updates.address;
  if (updates.city !== undefined) addr.city = updates.city;
  if (updates.state !== undefined) addr.state = updates.state;
  if (updates.zip !== undefined) addr.zip = updates.zip;
  const row = { updated_at: new Date().toISOString() };
  if (updates.label !== undefined) row.label = updates.label;
  if (Object.keys(addr).length) row.address = addr;
  if (updates.is_default !== undefined) {
    row.is_default = !!updates.is_default;
    if (row.is_default) {
      let clear = supabase
        .schema(GC)
        .from('ship_to_addresses')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .neq('id', id);
      clear =
        existing.company_id != null
          ? clear.eq('company_id', existing.company_id)
          : clear.eq('created_by_user_id', fallbackUserId);
      await clear;
    }
  }
  const { data, error } = await supabase
    .schema(GC)
    .from('ship_to_addresses')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return _shipToRowToDto(data);
}

async function deleteShipTo(id, companyIds, fallbackUserId) {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .schema(GC)
    .from('ship_to_addresses')
    .select('id, company_id, created_by_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw new Error('Ship-to address not found');
  const canAccess =
    (companyIds &&
      companyIds.length > 0 &&
      existing.company_id != null &&
      companyIds.some((c) => String(c) === String(existing.company_id))) ||
    (existing.company_id == null && String(existing.created_by_user_id) === String(fallbackUserId));
  if (!canAccess) throw new Error('Ship-to address not found');
  const { error } = await supabase.schema(GC).from('ship_to_addresses').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Saved lists ----------
async function getSavedListsByUserId(userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(GC)
    .from('saved_lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, user_id: r.user_id, name: r.name, items: r.items || [], created_at: r.created_at }));
}

async function getSavedListById(id, userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(GC)
    .from('saved_lists')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, user_id: data.user_id, name: data.name, items: data.items || [], created_at: data.created_at };
}

async function createSavedList(userId, { name, items }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(GC)
    .from('saved_lists')
    .insert({
      user_id: userId,
      name: (name || '').trim(),
      items: Array.isArray(items) ? items : [],
    })
    .select('*')
    .single();
  if (error) throw error;
  return { id: data.id, user_id: data.user_id, name: data.name, items: data.items || [], created_at: data.created_at };
}

async function updateSavedList(id, userId, { name, items }) {
  const supabase = getSupabaseAdmin();
  const row = { updated_at: new Date().toISOString() };
  if (name !== undefined) row.name = (name || '').trim();
  if (Array.isArray(items)) row.items = items;
  const { data, error } = await supabase
    .schema(GC)
    .from('saved_lists')
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return { id: data.id, user_id: data.user_id, name: data.name, items: data.items || [], created_at: data.created_at };
}

async function deleteSavedList(id, userId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.schema(GC).from('saved_lists').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// ---------- Uploaded invoices (company-scoped) ----------
function _invoiceRowToDto(r) {
  const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
  return {
    id: r.id,
    company_id: r.company_id,
    created_by_user_id: r.created_by_user_id,
    vendor: p.vendor || 'Unknown',
    invoice_date: p.invoice_date || r.created_at,
    total_amount: p.total_amount ?? 0,
    notes: p.notes || '',
    line_items: p.line_items || [],
    created_at: r.created_at
  };
}

async function getUploadedInvoicesByCompanyId(companyIds, fallbackUserId) {
  const supabase = getSupabaseAdmin();
  let q = supabase.schema(GC).from('uploaded_invoices').select('*');
  if (companyIds && companyIds.length > 0) {
    const orParts = [`company_id.in.(${companyIds.join(',')})`];
    if (fallbackUserId != null) orParts.push(`and(company_id.is.null,created_by_user_id.eq.${fallbackUserId})`);
    q = q.or(orParts.join(','));
  } else if (fallbackUserId != null) {
    q = q.eq('created_by_user_id', fallbackUserId);
  }
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(_invoiceRowToDto);
}

/** @deprecated Use getUploadedInvoicesByCompanyId. */
async function getUploadedInvoicesByUserId(userId) {
  return getUploadedInvoicesByCompanyId([], userId);
}

async function createUploadedInvoice({ companyId, createdByUserId, vendor, invoice_date, total_amount, notes, line_items }) {
  if (createdByUserId == null) throw new Error('createdByUserId required');
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(GC)
    .from('uploaded_invoices')
    .insert({
      company_id: companyId ?? null,
      created_by_user_id: createdByUserId,
      payload: {
        vendor: vendor || 'Unknown',
        invoice_date: invoice_date || new Date().toISOString().split('T')[0],
        total_amount: total_amount,
        notes: notes || '',
        line_items: Array.isArray(line_items) ? line_items : [],
      },
    })
    .select('*')
    .single();
  if (error) throw error;
  return _invoiceRowToDto(data);
}

async function deleteUploadedInvoice(id, companyIds, fallbackUserId) {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .schema(GC)
    .from('uploaded_invoices')
    .select('id, company_id, created_by_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw new Error('Invoice not found');
  const canAccess =
    (companyIds &&
      companyIds.length > 0 &&
      existing.company_id != null &&
      companyIds.some((c) => String(c) === String(existing.company_id))) ||
    (existing.company_id == null && String(existing.created_by_user_id) === String(fallbackUserId));
  if (!canAccess) throw new Error('Invoice not found');
  const { error } = await supabase.schema(GC).from('uploaded_invoices').delete().eq('id', id);
  if (error) throw error;
}

// ---------- RFQs (company-scoped) ----------
// Valid RFQ statuses
const RFQ_STATUSES = ['new', 'pending', 'reviewing', 'contacted', 'quoted', 'won', 'lost', 'expired', 'closed'];

function _rfqRowToDto(row) {
  if (!row) return null;
  const p = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    id: row.id,
    company_id: row.company_id,
    created_by_user_id: row.created_by_user_id,
    company_name: p.company_name || '',
    contact_name: p.contact_name || '',
    email: p.email || '',
    phone: p.phone || '',
    quantity: p.quantity || '',
    type: p.type || '',
    use_case: p.use_case || '',
    cases_or_pallets: p.cases_or_pallets || '',
    size: p.size || '',
    material: p.material || '',
    notes: p.notes || '',
    product_interest: p.product_interest || '',
    estimated_volume: p.estimated_volume || '',
    source: p.source || '',
    status: p.status || 'pending',
    admin_notes: p.admin_notes || '',
    won_at: p.won_at || null,
    lost_at: p.lost_at || null,
    expired_at: p.expired_at || null,
    expires_at: p.expires_at || null,
    lost_reason: p.lost_reason || null,
    quoted_at: p.quoted_at || null,
    contacted_at: p.contacted_at || null,
    closed_at: p.closed_at || null,
    created_at: row.created_at
  };
}

async function getRfqs() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .schema(GC)
    .from('rfqs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(_rfqRowToDto);
}

async function getRfqsByCompanyId(companyIds, fallbackUserId) {
  const supabase = getSupabaseAdmin();
  let q = supabase.schema(GC).from('rfqs').select('*');
  if (companyIds && companyIds.length > 0) {
    const orParts = [`company_id.in.(${companyIds.join(',')})`];
    if (fallbackUserId != null) orParts.push(`and(company_id.is.null,created_by_user_id.eq.${fallbackUserId})`);
    q = q.or(orParts.join(','));
  } else if (fallbackUserId != null) {
    q = q.eq('created_by_user_id', fallbackUserId);
  }
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(_rfqRowToDto);
}

/** @deprecated Use getRfqsByCompanyId. */
async function getRfqsByUserId(userId) {
  return getRfqsByCompanyId([], userId);
}

async function createRfq(payload, { companyId, createdByUserId } = {}) {
  const supabase = getSupabaseAdmin();
  const row = {
    company_id: companyId ?? null,
    created_by_user_id: createdByUserId ?? payload.user_id ?? null,
    payload: {
      company_name: payload.company_name || '',
      contact_name: payload.contact_name || '',
      email: payload.email || '',
      phone: payload.phone || '',
      quantity: payload.quantity || '',
      type: payload.type || '',
      use_case: payload.use_case || '',
      cases_or_pallets: payload.cases_or_pallets || '',
      size: payload.size || '',
      material: payload.material || '',
      notes: payload.notes || '',
      product_interest: (payload.product_interest || '').toString().trim(),
      estimated_volume: (payload.estimated_volume || '').toString().trim(),
      source: (payload.source || 'unknown').toString().trim().slice(0, 120),
      status: 'pending'
    }
  };
  const { data, error } = await supabase.schema(GC).from('rfqs').insert(row).select('*').single();
  if (error) throw error;
  return _rfqRowToDto(data);
}

async function updateRfq(id, updates) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: eErr } = await supabase
    .schema(GC)
    .from('rfqs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (eErr || !existing) return null;
  const p = existing.payload && typeof existing.payload === 'object' ? { ...existing.payload } : {};
  const now = new Date().toISOString();

  if (updates.append_admin_note && String(updates.append_admin_note).trim()) {
    const line = `[${now}] ${String(updates.append_admin_note).trim()}`;
    p.admin_notes = (p.admin_notes ? `${p.admin_notes}\n` : '') + line;
  } else if (updates.admin_notes !== undefined) {
    p.admin_notes = updates.admin_notes;
  }

  if (updates.status !== undefined) {
    p.status = updates.status;
    if (updates.status === 'contacted' && !p.contacted_at) p.contacted_at = now;
    if (updates.status === 'quoted' && !p.quoted_at) p.quoted_at = now;
    if (updates.status === 'won') p.won_at = now;
    if (updates.status === 'lost') {
      p.lost_at = now;
      if (updates.lost_reason) p.lost_reason = updates.lost_reason;
    }
    if (updates.status === 'expired') p.expired_at = now;
    if (updates.status === 'closed') {
      if (!p.closed_at) p.closed_at = now;
    }
  }

  if (updates.notes !== undefined) p.notes = updates.notes;
  if (updates.expires_at !== undefined) p.expires_at = updates.expires_at;
  if (updates.lost_reason !== undefined) p.lost_reason = updates.lost_reason;

  const { data, error } = await supabase
    .schema(GC)
    .from('rfqs')
    .update({ payload: p, updated_at: now })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return _rfqRowToDto(data);
}

// ---------- Contact messages (admin list) ----------
async function listContactMessages() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => {
    const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
    return { id: r.id, name: p.name, email: p.email, company: p.company, message: p.message, created_at: r.created_at };
  });
}

// ---------- Manufacturers (patch) ----------
async function updateManufacturer(id, { vendor_email, po_email }) {
  const supabase = getSupabaseAdmin();
  const row = {};
  if (vendor_email !== undefined) row.vendor_email = (vendor_email || '').toString().trim() || null;
  if (po_email !== undefined) row.po_email = (po_email || '').toString().trim() || null;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('manufacturers').update(row).eq('id', id);
  if (error) throw error;
}

// ---------- Fishbowl export: customers who have orders ----------
async function getCustomersForFishbowlExport() {
  const supabase = getSupabaseAdmin();
  const usersService = require('./usersService');
  const { data: orders, error: oErr } = await supabase
    .schema(GC)
    .from('orders')
    .select('id, placed_by_user_id, order_number, created_at')
    .order('created_at', { ascending: false });
  if (oErr) throw oErr;
  const authIds = [...new Set((orders || []).map((o) => o.placed_by_user_id).filter(Boolean))];
  if (authIds.length === 0) return [];
  const result = [];
  for (const authId of authIds) {
    const u = await usersService.getUserById(authId);
    if (!u) continue;
    const userOrders = (orders || []).filter((o) => String(o.placed_by_user_id) === String(authId));
    const lastOrder = userOrders[0] || null;
    result.push({
      id: u.id,
      company_name: u.company_name || '',
      contact_name: u.contact_name || '',
      email: u.email || '',
      phone: ((u.phone || '').replace(/\D/g, '')).slice(0, 15) || '',
      address: u.address || '',
      city: u.city || '',
      state: u.state || '',
      zip: ((u.zip || '').replace(/\D/g, '')).slice(0, 10) || '',
      country: 'USA',
      order_count: userOrders.length,
      last_order_number: lastOrder ? lastOrder.order_number : '',
      last_order_date: lastOrder ? lastOrder.created_at : '',
    });
  }
  result.sort((a, b) => (b.company_name || '').localeCompare(a.company_name || ''));
  return result;
}

// ---------- Customer manufacturer pricing (overrides per company) ----------
async function getOverridesByCompanyId(companyId) {
  const supabase = getSupabaseAdmin();
  const { data: overrides, error } = await supabase
    .schema(GC)
    .from('customer_manufacturer_pricing')
    .select('*')
    .eq('company_id', companyId);
  if (error) throw error;
  const mfrIds = [...new Set((overrides || []).map((o) => o.manufacturer_id))];
  const manufacturers = mfrIds.length ? await supabase.from('manufacturers').select('id, name').in('id', mfrIds) : { data: [] };
  const mfrMap = new Map((manufacturers.data || []).map((m) => [m.id, m]));
  return (overrides || []).map((o) => ({
    id: o.id,
    company_id: o.company_id,
    manufacturer_id: o.manufacturer_id,
    manufacturer_name: mfrMap.get(o.manufacturer_id)?.name || '',
    gross_margin_percent: o.margin_percent,
    margin_percent: o.margin_percent
  }));
}

async function upsertCustomerManufacturerPricing(companyId, manufacturerId, marginPercent) {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .schema(GC)
    .from('customer_manufacturer_pricing')
    .select('id')
    .eq('company_id', companyId)
    .eq('manufacturer_id', manufacturerId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .schema(GC)
      .from('customer_manufacturer_pricing')
      .update({ margin_percent: marginPercent, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  }
  const { data: inserted, error } = await supabase
    .schema(GC)
    .from('customer_manufacturer_pricing')
    .insert({ company_id: companyId, manufacturer_id: manufacturerId, margin_percent: marginPercent })
    .select('id')
    .single();
  if (error) throw error;
  return inserted?.id;
}

async function deleteCustomerManufacturerPricingOverride(overrideId, companyId) {
  const supabase = getSupabaseAdmin();
  let q = supabase.schema(GC).from('customer_manufacturer_pricing').delete().eq('id', overrideId);
  if (companyId != null) q = q.eq('company_id', companyId);
  const { error } = await q;
  if (error) throw error;
}

// ---------- Next PO number ----------
async function nextPoNumber() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('purchase_orders').select('po_number');
  if (error) throw error;
  const nums = (data || []).map((po) => (po.po_number || '').replace(/^PO-/, '')).filter((n) => /^\d+$/.test(n));
  const max = nums.length ? Math.max(...nums.map((n) => parseInt(n, 10))) : 0;
  return 'PO-' + String(max + 1).padStart(5, '0');
}

module.exports = {
  getOrdersByUserId,
  getOrdersByCompanyId,
  getOrderById,
  getOrderByIdForCompany,
  getOrderByIdAdmin,
  getOrderByStripePaymentIntentId,
  flagPaymentIntegrityHold,
  getRecentPendingPaymentOrder,
  getStalePendingPaymentOrders,
  getAllOrdersAdmin,
  getAdminOrderOperationalAlerts,
  updateOrderStatus,
  cancelOrderClearIdempotencyKey,
  getOrderByUserIdempotencyKey,
  createOrder,
  updateOrder,
  getCart,
  setCart,
  getInventory,
  getInventoryByProductId,
  upsertInventory,
  getManufacturers,
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  getCustomerManufacturerPricing,
  createContactMessage,
  createPasswordResetToken,
  findPasswordResetToken,
  deletePasswordResetToken,
  deletePasswordResetTokensByUserId,
  getShipToByUserId,
  getShipToByCompanyId,
  createShipTo,
  updateShipTo,
  deleteShipTo,
  getSavedListsByUserId,
  getSavedListById,
  createSavedList,
  updateSavedList,
  deleteSavedList,
  getUploadedInvoicesByUserId,
  getUploadedInvoicesByCompanyId,
  createUploadedInvoice,
  deleteUploadedInvoice,
  getRfqs,
  getRfqsByUserId,
  getRfqsByCompanyId,
  createRfq,
  updateRfq,
  listContactMessages,
  updateManufacturer,
  getCustomersForFishbowlExport,
  nextPoNumber,
  getOverridesByCompanyId,
  upsertCustomerManufacturerPricing,
  deleteCustomerManufacturerPricingOverride
};

/**
 * Inventory management: stock_on_hand, stock_reserved, available_stock.
 * 
 * PRODUCTION HARDENED:
 * - Atomic reservation to prevent overselling
 * - Idempotent operations with order-level tracking
 * - User attribution in stock history
 * - Balance tracking for audit trail
 * 
 * Prevents overselling by reserving on order placement, releasing on payment failure,
 * and deducting on shipment.
 */

const { getSupabaseAdmin } = require('./supabaseAdmin');
const { normalizeCanonicalUuidInput } = require('./resolve-canonical-product-id');
const { assertCatalogV2ProductIdForCommerce } = require('./catalog-v2-product-guard');

function isGcOrderUuid(orderId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(orderId || ''));
}

function isAuthUserUuid(userId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(userId || ''));
}

const STOCK_HISTORY_TYPES = {
  RESERVE: 'reserve',
  RELEASE: 'release',
  DEDUCT: 'deduct',
  ADJUST: 'adjust',
  RECEIVE: 'receive'
};

const INVENTORY_STOCK_SELECT =
  'canonical_product_id, quantity_on_hand, quantity_reserved, incoming_quantity, reorder_point, bin_location';

/**
 * Map an inventory row to the public stock shape (includes ids for callers that need them).
 * @param {Record<string, unknown>|null|undefined} data
 */
function stockFromRow(data) {
  if (!data) return null;
  const onHand = data.quantity_on_hand ?? 0;
  const reserved = data.quantity_reserved ?? 0;
  const available = Math.max(0, onHand - reserved);
  return {
    stock_on_hand: onHand,
    stock_reserved: reserved,
    available_stock: available,
    incoming_quantity: data.incoming_quantity ?? 0,
    reorder_point: data.reorder_point ?? 0,
    bin_location: data.bin_location || '',
    canonical_product_id: normalizeCanonicalUuidInput(data.canonical_product_id),
  };
}

async function _rowByCanonical(canon) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('inventory')
    .select(INVENTORY_STOCK_SELECT)
    .eq('canonical_product_id', canon)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * @param {{ canonical_product_id?: unknown }} item
 */
async function getStockForLineItem(item) {
  const canon = normalizeCanonicalUuidInput(item && item.canonical_product_id);
  if (!canon) return null;
  const row = await _rowByCanonical(canon);
  return stockFromRow(row);
}

/**
 * Stock by catalog UUID only (inventory rows keyed by canonical_product_id).
 * @param {string} canonicalProductId
 */
async function getStock(canonicalProductId) {
  const canon = normalizeCanonicalUuidInput(canonicalProductId);
  if (!canon) return null;
  return stockFromRow(await _rowByCanonical(canon));
}

/**
 * Ensure inventory row exists for a catalog product UUID.
 * @param {string|null|undefined} canonicalProductId
 * @param {string} [context]
 */
async function _ensureInventory(canonicalProductId, context = 'inventory_ensure') {
  const canonical = normalizeCanonicalUuidInput(canonicalProductId);
  if (!canonical) {
    throw new Error(`${context}: canonical_product_id required for inventory row`);
  }
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('inventory').select('id').eq('canonical_product_id', canonical).maybeSingle();
  if (!data) {
    await supabase.from('inventory').insert({
      canonical_product_id: canonical,
      quantity_on_hand: 0,
      quantity_reserved: 0,
      incoming_quantity: 0,
      reorder_point: 0,
    });
  }
}

/**
 * @param {string} canonicalProductId
 * @param {number} delta
 * @param {string} userId - auth.users UUID or null
 */
async function _logStockHistory(canonicalProductId, delta, type, referenceType, referenceId, notes, userId = null) {
  const canonical = normalizeCanonicalUuidInput(canonicalProductId);
  if (!canonical) {
    throw new Error('stock_history requires canonical_product_id');
  }
  const supabase = getSupabaseAdmin();
  const { data: inv } = await supabase
    .from('inventory')
    .select('quantity_on_hand')
    .eq('canonical_product_id', canonical)
    .maybeSingle();
  const balanceAfter = inv ? (inv.quantity_on_hand ?? 0) : 0;
  await supabase.from('stock_history').insert({
    canonical_product_id: canonical,
    delta,
    type,
    reference_type: referenceType || null,
    reference_id: referenceId != null ? Number(referenceId) : null,
    notes: notes || null,
    user_id: userId != null && isAuthUserUuid(userId) ? String(userId) : null,
    balance_after: balanceAfter,
  });
}

/**
 * Check if order has already had stock reserved.
 * Returns true if already reserved (idempotent check).
 */
async function _isOrderReserved(orderId) {
  if (!isGcOrderUuid(orderId)) return false;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .schema('gc_commerce')
    .from('orders')
    .select('inventory_reserved_at')
    .eq('id', orderId)
    .maybeSingle();
  return data && data.inventory_reserved_at != null;
}

/**
 * Check if order has already had stock released.
 */
async function _isOrderReleased(orderId) {
  if (!isGcOrderUuid(orderId)) return false;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .schema('gc_commerce')
    .from('orders')
    .select('inventory_released_at')
    .eq('id', orderId)
    .maybeSingle();
  return data && data.inventory_released_at != null;
}

/**
 * Check if order has already had stock deducted.
 */
async function _isOrderDeducted(orderId) {
  if (!isGcOrderUuid(orderId)) return false;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .schema('gc_commerce')
    .from('orders')
    .select('inventory_deducted_at')
    .eq('id', orderId)
    .maybeSingle();
  return data && data.inventory_deducted_at != null;
}

/**
 * Reserve stock for an order — delegated to Postgres (row locks + single transaction).
 * Idempotent when orders.inventory_reserved_at is already set.
 *
 * @param {string} orderId - gc_commerce.orders UUID
 * @param {Array<{ quantity?: unknown, canonical_product_id?: unknown }>} items
 * @param {string} [userId] - auth.users UUID
 * @throws {Error} If insufficient stock or already reserved
 */
async function reserveStockForOrder(orderId, items, userId = null) {
  if (!items || items.length === 0) return;
  const supabase = getSupabaseAdmin();

  if (await _isOrderReserved(orderId)) {
    console.log(`[inventory] Order ${orderId} already has stock reserved, skipping`);
    return;
  }

  for (const item of items) {
    const q0 = Number(item.quantity) || 0;
    if (q0 <= 0) continue;
    const c0 = normalizeCanonicalUuidInput(item.canonical_product_id);
    if (c0) await assertCatalogV2ProductIdForCommerce(c0, 'inventory_reserve');
  }

  const insufficientItems = [];
  for (const item of items) {
    const needed = Number(item.quantity) || 0;
    if (needed <= 0) continue;
    const canon = normalizeCanonicalUuidInput(item.canonical_product_id);
    if (!canon) {
      insufficientItems.push({ canonical_product_id: null, needed, available: 0 });
      continue;
    }
    const stock = await getStockForLineItem({ canonical_product_id: canon });
    if (!stock) continue;
    if (stock.available_stock < needed) {
      insufficientItems.push({
        canonical_product_id: canon,
        needed,
        available: stock.available_stock,
      });
    }
  }
  if (insufficientItems.length > 0) {
    const first = insufficientItems[0];
    const idLabel = first.canonical_product_id || '(missing catalog UUID)';
    throw new Error(`Insufficient stock for catalog product ${idLabel}: need ${first.needed}, available ${first.available}`);
  }

  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const lineCanonical = normalizeCanonicalUuidInput(item.canonical_product_id);
    if (!lineCanonical) continue;
    await _ensureInventory(lineCanonical, 'inventory_reserve_ensure');
  }

  const pItems = items
    .map((item) => ({
      quantity: Number(item.quantity) || 0,
      canonical_product_id: normalizeCanonicalUuidInput(item.canonical_product_id) || null,
    }))
    .filter((row) => row.quantity > 0 && row.canonical_product_id);

  if (!isGcOrderUuid(orderId)) {
    throw new Error('Order id must be a gc_commerce order UUID');
  }
  const uidGc = userId != null && isAuthUserUuid(userId) ? String(userId) : null;
  const { data, error } = await supabase.rpc('gc_reserve_stock_for_order_atomic', {
    p_order_id: String(orderId),
    p_user_id: uidGc,
    p_items: pItems,
  });

  if (error) {
    throw new Error(error.message || 'Reservation failed');
  }
  if (data && data.skipped === true) {
    return;
  }
  console.log(`[inventory] Reserved stock for gc order ${orderId}`);
}

/**
 * Release stock reserved for an order (e.g. payment failed).
 * Idempotent - safe to call multiple times.
 * 
 * @param {number} orderId - Order ID
 * @param {number} [userId] - User triggering the release (optional)
 */
async function releaseStockForOrder(orderId, userId = null) {
  const supabase = getSupabaseAdmin();

  if (await _isOrderReleased(orderId)) {
    console.log(`[inventory] Order ${orderId} already has stock released, skipping`);
    return;
  }

  if (!(await _isOrderReserved(orderId))) {
    console.log(`[inventory] Order ${orderId} was never reserved, skipping release`);
    return;
  }

  if (!isGcOrderUuid(orderId)) {
    throw new Error('Order id must be a gc_commerce order UUID');
  }
  const uidGc = userId != null && isAuthUserUuid(userId) ? String(userId) : null;
  const { data, error } = await supabase.rpc('gc_release_stock_for_order_atomic', {
    p_order_id: String(orderId),
    p_user_id: uidGc,
  });
  if (error) {
    throw new Error(error.message || 'Release failed');
  }
  if (data && data.skipped === true) {
    return;
  }
  console.log(`[inventory] Released stock for gc order ${orderId}`);
}

/**
 * Release reserved stock when an order is abandoned (cancel / payment fail / expire),
 * but not after fulfillment deduct (inventory_deducted_at). Idempotent via RPC.
 */
async function tryReleaseReservedStockForNonFulfillment(orderId, userId = null) {
  if (!isGcOrderUuid(orderId)) return;
  const supabase = getSupabaseAdmin();
  const r = await supabase
    .schema('gc_commerce')
    .from('orders')
    .select('inventory_reserved_at, inventory_released_at, inventory_deducted_at')
    .eq('id', orderId)
    .maybeSingle();
  const o = r.data;
  const error = r.error;
  if (error) throw error;
  if (!o || !o.inventory_reserved_at) return;
  if (o.inventory_deducted_at) return;
  if (o.inventory_released_at) return;
  await releaseStockForOrder(orderId, userId);
}

/**
 * Deduct stock when order ships: reduce stock_on_hand and stock_reserved.
 * Idempotent - safe to call multiple times.
 * 
 * @param {number} orderId - Order ID
 * @param {number} [userId] - Admin user who shipped the order (optional)
 */
async function deductStockForOrder(orderId, userId = null) {
  const supabase = getSupabaseAdmin();

  if (await _isOrderDeducted(orderId)) {
    console.log(`[inventory] Order ${orderId} already has stock deducted, skipping`);
    return;
  }

  if (!isGcOrderUuid(orderId)) {
    throw new Error('Order id must be a gc_commerce order UUID');
  }
  const uidGc = userId != null && isAuthUserUuid(userId) ? String(userId) : null;
  const { data, error } = await supabase.rpc('gc_deduct_stock_for_order_atomic', {
    p_order_id: String(orderId),
    p_user_id: uidGc,
  });
  if (error) {
    throw new Error(error.message || 'Deduct failed');
  }
  if (data && data.skipped === true) {
    return;
  }
  console.log(`[inventory] Deducted stock for gc order ${orderId}`);
}

/**
 * Manual inventory adjustment (catalog UUID key only).
 * @param {string} canonicalProductId
 * @param {string|null} [userId] auth.users UUID
 */
async function adjustStock(canonicalProductId, delta, reason, reference, userId = null) {
  const supabase = getSupabaseAdmin();
  const d = Number(delta);
  if (isNaN(d) || d === 0) return;

  const canonical = normalizeCanonicalUuidInput(canonicalProductId);
  if (!canonical) {
    throw new Error('adjustStock requires canonical_product_id');
  }

  await _ensureInventory(canonical, 'inventory_adjust');
  const { data: inv } = await supabase
    .from('inventory')
    .select('quantity_on_hand')
    .eq('canonical_product_id', canonical)
    .maybeSingle();
  const current = inv ? (inv.quantity_on_hand ?? 0) : 0;
  const newOnHand = Math.max(0, current + d);

  if (current + d < 0) {
    console.warn(
      `[inventory] Warning: Adjusting catalog product ${canonical} by ${d} would go negative (current: ${current}). Clamping to 0.`,
    );
  }

  const { error } = await supabase
    .from('inventory')
    .update({ quantity_on_hand: newOnHand, updated_at: new Date().toISOString() })
    .eq('canonical_product_id', canonical);
  if (error) throw error;

  await _logStockHistory(
    canonical,
    d,
    STOCK_HISTORY_TYPES.ADJUST,
    reference?.type || 'admin',
    reference?.id || null,
    reason || 'Manual adjustment',
    userId,
  );

  console.log(`[inventory] Adjusted catalog product ${canonical} by ${d} (reason: ${reason || 'Manual adjustment'})`);
}

/**
 * Receive purchase order lines: add to stock_on_hand.
 * PO payloads must include canonical_product_id (catalog UUID); inventory rows use canonical_product_id.
 *
 * @param {number} poId - Purchase Order ID
 * @param {Array} receivedLines - [{ product_id, quantity_received, canonical_product_id? }]
 * @param {string|null} [userId] - Admin auth UUID
 */
async function receivePurchaseOrder(poId, receivedLines, userId = null) {
  if (!receivedLines || receivedLines.length === 0) return;
  const supabase = getSupabaseAdmin();

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('lines, received_lines')
    .eq('id', poId)
    .maybeSingle();
  if (poErr) throw poErr;
  if (!po) throw new Error('Purchase order not found');

  const prevReceived = Array.isArray(po.received_lines) ? po.received_lines : [];
  const receivedMap = new Map();
  for (const r of prevReceived) {
    const k =
      normalizeCanonicalUuidInput(r.canonical_product_id) || normalizeCanonicalUuidInput(r.product_id);
    if (!k) continue;
    receivedMap.set(k, (receivedMap.get(k) || 0) + (Number(r.quantity_received) || 0));
  }

  for (const line of receivedLines) {
    const qty = Number(line.quantity_received) ?? Number(line.quantity) ?? 0;
    if (qty <= 0) continue;

    const canonical = normalizeCanonicalUuidInput(line.canonical_product_id) || normalizeCanonicalUuidInput(line.product_id);
    if (!canonical) {
      throw new Error('PO receive: each line must include canonical_product_id (catalog UUID)');
    }

    await _ensureInventory(canonical, 'inventory_receive_po_ensure');
    const { data: inv } = await supabase
      .from('inventory')
      .select('quantity_on_hand, incoming_quantity')
      .eq('canonical_product_id', canonical)
      .maybeSingle();
    const current = inv ? (inv.quantity_on_hand ?? 0) : 0;
    const incomingCurrent = inv ? (inv.incoming_quantity ?? 0) : 0;
    const newOnHand = current + qty;
    const newIncoming = Math.max(0, incomingCurrent - qty);

    const receivePatch = {
      quantity_on_hand: newOnHand,
      incoming_quantity: newIncoming,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('inventory')
      .update(receivePatch)
      .eq('canonical_product_id', canonical);
    if (error) throw error;

    await _logStockHistory(
      canonical,
      qty,
      STOCK_HISTORY_TYPES.RECEIVE,
      'purchase_order',
      poId,
      `PO #${poId}`,
      userId,
    );

    const prev = receivedMap.get(canonical) || 0;
    receivedMap.set(canonical, prev + qty);
  }

  const newReceivedLines = Array.from(receivedMap.entries()).map(([canonId, q]) => ({
    canonical_product_id: canonId,
    quantity_received: q,
  }));

  const { error: upErr } = await supabase
    .from('purchase_orders')
    .update({ received_lines: newReceivedLines, updated_at: new Date().toISOString() })
    .eq('id', poId);
  if (upErr) throw upErr;

  console.log(`[inventory] Received ${receivedLines.length} line(s) for PO ${poId}`);
}

/**
 * @param {string} canonicalProductId
 */
async function setIncomingQuantity(canonicalProductId, quantity) {
  const supabase = getSupabaseAdmin();
  const canonical = normalizeCanonicalUuidInput(canonicalProductId);
  if (!canonical) {
    throw new Error('setIncomingQuantity requires canonical_product_id');
  }
  await _ensureInventory(canonical, 'inventory_set_incoming');

  const { error } = await supabase
    .from('inventory')
    .update({
      incoming_quantity: Math.max(0, Number(quantity) || 0),
      updated_at: new Date().toISOString(),
    })
    .eq('canonical_product_id', canonical);
  if (error) throw error;
}

/**
 * @param {string|null|undefined} productId - catalog UUID filter when options omit canonical
 * @param {{ canonical_product_id?: unknown }} [options]
 */
async function getStockHistory(productId, limit = 100, options = {}) {
  const supabase = getSupabaseAdmin();
  let canon = normalizeCanonicalUuidInput(options && options.canonical_product_id);
  if (!canon && productId != null) {
    canon = normalizeCanonicalUuidInput(productId);
  }

  let q = supabase
    .from('stock_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Number(limit) || 100);

  if (canon) {
    q = q.eq('canonical_product_id', canon);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * @param {Array<{ quantity?: unknown, canonical_product_id?: unknown }>} items
 */
async function checkAvailability(items) {
  const insufficient = [];
  for (const item of items) {
    const needed = Number(item.quantity) || 0;
    if (needed <= 0) continue;

    const c0 = normalizeCanonicalUuidInput(item.canonical_product_id);
    if (c0) await assertCatalogV2ProductIdForCommerce(c0, 'inventory_check_availability');

    const stock = await getStockForLineItem(item);
    if (!stock) continue;

    if (stock.available_stock < needed) {
      insufficient.push({
        canonical_product_id: stock.canonical_product_id,
        needed,
        available: stock.available_stock,
      });
    }
  }
  return {
    ok: insufficient.length === 0,
    insufficient,
  };
}

/**
 * @param {string} canonicalProductId
 */
async function verifyInventoryConsistency(canonicalProductId) {
  const stock = await getStock(canonicalProductId);
  const issues = [];

  if (!stock) {
    return { ok: true, issues: [], message: 'Product not inventory-tracked' };
  }
  
  if (stock.stock_reserved > stock.stock_on_hand) {
    issues.push({
      type: 'reserved_exceeds_onhand',
      message: `Reserved (${stock.stock_reserved}) exceeds on-hand (${stock.stock_on_hand})`,
      severity: 'high'
    });
  }
  
  if (stock.stock_on_hand < 0) {
    issues.push({
      type: 'negative_onhand',
      message: `On-hand is negative (${stock.stock_on_hand})`,
      severity: 'critical'
    });
  }
  
  if (stock.stock_reserved < 0) {
    issues.push({
      type: 'negative_reserved',
      message: `Reserved is negative (${stock.stock_reserved})`,
      severity: 'critical'
    });
  }
  
  return {
    ok: issues.length === 0,
    issues,
    stock
  };
}

/**
 * Get all products with inventory issues.
 */
async function getInventoryIssues() {
  const supabase = getSupabaseAdmin();
  const { data: inventory, error } = await supabase
    .from('inventory')
    .select('canonical_product_id, quantity_on_hand, quantity_reserved');

  if (error) throw error;

  const issues = [];
  for (const inv of inventory || []) {
    const onHand = inv.quantity_on_hand ?? 0;
    const reserved = inv.quantity_reserved ?? 0;
    const cid = normalizeCanonicalUuidInput(inv.canonical_product_id);

    if (reserved > onHand) {
      issues.push({
        canonical_product_id: cid,
        type: 'reserved_exceeds_onhand',
        on_hand: onHand,
        reserved,
      });
    }

    if (onHand < 0 || reserved < 0) {
      issues.push({
        canonical_product_id: cid,
        type: 'negative_values',
        on_hand: onHand,
        reserved,
      });
    }
  }

  return issues;
}

module.exports = {
  getStock,
  getStockForLineItem,
  reserveStockForOrder,
  tryReleaseReservedStockForNonFulfillment,
  releaseStockForOrder,
  deductStockForOrder,
  adjustStock,
  receivePurchaseOrder,
  setIncomingQuantity,
  getStockHistory,
  checkAvailability,
  verifyInventoryConsistency,
  getInventoryIssues,
  STOCK_HISTORY_TYPES
};

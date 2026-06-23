/**
 * Native warehouse staging smoke (service-role).
 *
 * Verifies variant-level PO receive, public.inventory isolation, and dropship PO tracking.
 *
 * Run from repo root:
 *   node storefront/scripts/warehouse-staging-smoke.mjs
 *
 * Requires storefront/.env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Optional: WAREHOUSE_SMOKE_PRODUCT_ID (catalog_v2 product UUID with >=2 active variants).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, "");
  }
  return env;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error(JSON.stringify({ ok: false, error: "MISSING_ENV", hint: "storefront/.env.local" }));
  process.exit(1);
}

const sb = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const V2 = "catalog_v2";
const results = { ok: false, steps: {}, cleanup: [] };

async function getOperatorUserId() {
  const { data: admin } = await sb.from("admin_users").select("id").eq("is_active", true).limit(1).maybeSingle();
  if (admin?.id) return admin.id;
  const { data: user } = await sb.from("users").select("id").limit(1).maybeSingle();
  assert(user?.id, "No operator user id");
  return user.id;
}

async function getManufacturerId() {
  const { data: mfr } = await sb.from("manufacturers").select("id").limit(1).maybeSingle();
  if (mfr?.id) return mfr.id;
  const { data: created, error } = await sb
    .from("manufacturers")
    .insert({ name: `Warehouse Smoke ${Date.now()}`, po_email: "warehouse-smoke@example.invalid" })
    .select("id")
    .single();
  if (error) throw error;
  results.cleanup.push({ type: "manufacturer", id: created.id });
  return created.id;
}

async function pickTwoVariantProduct() {
  const override = env.WAREHOUSE_SMOKE_PRODUCT_ID?.trim();
  if (override) {
    const { data: variants, error } = await sb
      .schema(V2)
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, size_code, fulfillment_mode")
      .eq("catalog_product_id", override)
      .eq("is_active", true)
      .order("size_code", { ascending: true });
    if (error) throw error;
    assert((variants?.length ?? 0) >= 2, "WAREHOUSE_SMOKE_PRODUCT_ID must have >=2 active variants");
    return { productId: override, variants: variants.slice(0, 2) };
  }

  const { data: candidates, error } = await sb
    .schema(V2)
    .from("catalog_variants")
    .select("id, catalog_product_id, variant_sku, size_code, fulfillment_mode, metadata")
    .eq("is_active", true)
    .order("variant_sku", { ascending: true })
    .limit(500);
  if (error) throw error;

  const byProduct = new Map();
  for (const row of candidates ?? []) {
    const pid = String(row.catalog_product_id);
    const list = byProduct.get(pid) ?? [];
    list.push(row);
    byProduct.set(pid, list);
  }

  for (const [productId, rows] of byProduct) {
    if (rows.length < 2) continue;
    const gc = rows.some(
      (r) =>
        String(r.metadata?.glovecubs_manufactured ?? "").toLowerCase() === "true" ||
        String(r.metadata?.glovecubs_manufactured ?? "").toLowerCase() === "yes" ||
        String(r.metadata?.glovecubs_manufactured ?? "") === "1",
    );
    if (gc || rows.length >= 2) {
      return { productId, variants: rows.slice(0, 2) };
    }
  }
  throw new Error("No catalog product with >=2 active variants found; set WAREHOUSE_SMOKE_PRODUCT_ID");
}

async function snapshotPublicInventory(productId) {
  const { data } = await sb.from("inventory").select("*").eq("canonical_product_id", productId).maybeSingle();
  const { count: histCount } = await sb
    .from("stock_history")
    .select("id", { count: "exact", head: true })
    .eq("canonical_product_id", productId);
  return {
    row: data ? JSON.parse(JSON.stringify(data)) : null,
    stockHistoryCount: histCount ?? 0,
  };
}

async function snapshotVariantLedger(variantIds) {
  const { data: inv } = await sb
    .schema(V2)
    .from("variant_inventory")
    .select("*")
    .in("catalog_variant_id", variantIds);
  const { count: histCount } = await sb
    .schema(V2)
    .from("variant_stock_history")
    .select("id", { count: "exact", head: true })
    .in("catalog_variant_id", variantIds);
  return { inventory: inv ?? [], stockHistoryCount: histCount ?? 0 };
}

async function markVariantStocked(variantId, operatorId) {
  const { data, error } = await sb.rpc("admin_update_variant_fulfillment_atomic", {
    p_catalog_variant_id: variantId,
    p_operator_user_id: operatorId,
    p_fulfillment_mode: "stocked",
    p_inventory_visibility: "hidden",
    p_stock_enforcement: true,
    p_reorder_point: 0,
    p_default_bin_location: null,
    p_default_location_code: "default",
  });
  if (error) throw error;
  assert(data?.ok, `stocked fulfillment failed: ${JSON.stringify(data)}`);
}

async function main() {
  const operatorId = await getOperatorUserId();
  const mfrId = await getManufacturerId();
  const { productId, variants } = await pickTwoVariantProduct();
  const [v1, v2] = variants;
  const variantIds = [String(v1.id), String(v2.id)];

  results.steps.product = { productId, variants: variantIds.map((id, i) => ({ id, sku: variants[i].variant_sku })) };

  await markVariantStocked(String(v1.id), operatorId);
  results.steps.markStocked = "pass";

  const publicBefore = await snapshotPublicInventory(productId);
  const variantBefore = await snapshotVariantLedger(variantIds);
  results.steps.baseline = { publicBefore, variantBefore };

  const poNumber = `WH-SMOKE-${Date.now()}`;
  const lineQty = 10;
  const partialQty = 4;
  const { data: poCreated, error: poErr } = await sb
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      manufacturer_id: mfrId,
      status: "sent",
      purchase_order_type: "inbound_stock",
      sent_at: new Date().toISOString(),
      sent_by_user_id: operatorId,
      lines: [
        {
          catalog_variant_id: v1.id,
          canonical_product_id: productId,
          sku: v1.variant_sku,
          name: v1.variant_sku,
          quantity: lineQty,
          unit_cost: 1,
          uom: "case",
        },
        {
          catalog_variant_id: v2.id,
          canonical_product_id: productId,
          sku: v2.variant_sku,
          name: v2.variant_sku,
          quantity: lineQty,
          unit_cost: 1,
          uom: "case",
        },
      ],
      received_lines: [],
    })
    .select("id")
    .single();
  if (poErr) throw poErr;
  const poId = poCreated.id;
  results.cleanup.push({ type: "purchase_order", id: poId });
  results.steps.createInboundPo = { poId, poNumber };

  const partialLines = [
    { catalog_variant_id: v1.id, quantity_received: partialQty },
    { catalog_variant_id: v2.id, quantity_received: partialQty },
  ];
  const { data: partialRpc, error: partialErr } = await sb.rpc("admin_receive_purchase_order_shipment_atomic", {
    p_po_id: poId,
    p_operator_user_id: operatorId,
    p_lines: partialLines,
    p_idempotency_key: `wh-smoke-partial-${poId}`,
    p_receipt_notes: "warehouse staging smoke partial",
    p_allow_overage: false,
  });
  if (partialErr) throw partialErr;
  assert(partialRpc?.ok, `partial receive failed: ${JSON.stringify(partialRpc)}`);

  const { data: poPartial } = await sb.from("purchase_orders").select("status, received_lines").eq("id", poId).single();
  assert(poPartial?.status === "partially_received", `expected partially_received, got ${poPartial?.status}`);
  results.steps.partialReceive = { status: poPartial.status, rpc: partialRpc.status ?? partialRpc };

  const remainderLines = [
    { catalog_variant_id: v1.id, quantity_received: lineQty - partialQty },
    { catalog_variant_id: v2.id, quantity_received: lineQty - partialQty },
  ];
  const { data: fullRpc, error: fullErr } = await sb.rpc("admin_receive_purchase_order_shipment_atomic", {
    p_po_id: poId,
    p_operator_user_id: operatorId,
    p_lines: remainderLines,
    p_idempotency_key: `wh-smoke-full-${poId}`,
    p_receipt_notes: "warehouse staging smoke final",
    p_allow_overage: false,
  });
  if (fullErr) throw fullErr;
  assert(fullRpc?.ok, `full receive failed: ${JSON.stringify(fullRpc)}`);

  const { data: poFinal } = await sb.from("purchase_orders").select("status").eq("id", poId).single();
  assert(poFinal?.status === "received", `expected received, got ${poFinal?.status}`);
  results.steps.fullReceive = { status: poFinal.status };

  const publicAfter = await snapshotPublicInventory(productId);
  const variantAfter = await snapshotVariantLedger(variantIds);

  const publicUnchanged =
    JSON.stringify(publicAfter.row) === JSON.stringify(publicBefore.row) &&
    publicAfter.stockHistoryCount === publicBefore.stockHistoryCount;
  assert(publicUnchanged, "public.inventory or stock_history changed during native receive");
  results.steps.publicInventoryUnchanged = publicUnchanged;

  const variantMoved =
    variantAfter.stockHistoryCount > variantBefore.stockHistoryCount ||
    JSON.stringify(variantAfter.inventory) !== JSON.stringify(variantBefore.inventory);
  assert(variantMoved, "variant_inventory / variant_stock_history did not change");
  results.steps.variantLedgerChanged = variantMoved;

  const dsPoNumber = `WH-DS-${Date.now()}`;
  const variantInvBeforeDs = await snapshotVariantLedger(variantIds);
  const { data: dsPo, error: dsErr } = await sb
    .from("purchase_orders")
    .insert({
      po_number: dsPoNumber,
      manufacturer_id: mfrId,
      status: "sent",
      purchase_order_type: "dropship_fulfillment",
      fulfillment_status: "pending",
      sent_at: new Date().toISOString(),
      lines: [
        {
          catalog_variant_id: v1.id,
          canonical_product_id: productId,
          sku: v1.variant_sku,
          quantity: 2,
          unit_cost: 1,
        },
      ],
      received_lines: [],
    })
    .select("id")
    .single();
  if (dsErr) throw dsErr;
  results.cleanup.push({ type: "purchase_order", id: dsPo.id });

  const { error: dsUpErr } = await sb
    .from("purchase_orders")
    .update({
      supplier_tracking_number: `TRACK-${Date.now()}`,
      fulfillment_status: "shipped",
      supplier_confirmed_at: new Date().toISOString(),
      supplier_confirmed_by_user_id: operatorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dsPo.id);
  if (dsUpErr) throw dsUpErr;

  const { data: dsRow } = await sb
    .from("purchase_orders")
    .select("fulfillment_status, supplier_tracking_number")
    .eq("id", dsPo.id)
    .single();
  assert(dsRow?.fulfillment_status === "shipped" && dsRow?.supplier_tracking_number, "dropship tracking update failed");

  const variantInvAfterDs = await snapshotVariantLedger(variantIds);
  assert(
    JSON.stringify(variantInvAfterDs.inventory) === JSON.stringify(variantInvBeforeDs.inventory) &&
      variantInvAfterDs.stockHistoryCount === variantInvBeforeDs.stockHistoryCount,
    "dropship PO mutated variant inventory",
  );
  results.steps.dropshipTrackingOnly = {
    poId: dsPo.id,
    fulfillment_status: dsRow.fulfillment_status,
    tracking: dsRow.supplier_tracking_number,
  };

  results.ok = true;
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  results.error = err.message;
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
});

/**
 * Read-only buyer order list/detail. Server-only; always filter by company_id from gate (never client).
 */

import type { OrderProvenance } from "@/lib/admin/admin-orders-read-model";
import { provenanceFromRow } from "@/lib/admin/admin-orders-read-model";

export type BuyerOrderListRow = {
  id: string;
  order_number: string;
  status: string;
  placed_at: string;
  currency_code: string;
  total_minor: number;
  line_count: number;
  provenance: OrderProvenance;
};

export type BuyerOrderHeaderDto = {
  id: string;
  order_number: string;
  status: string;
  currency_code: string;
  subtotal_minor: number;
  discount_minor: number;
  shipping_minor: number;
  tax_minor: number;
  total_minor: number;
  placed_at: string;
  created_at: string;
  provenance: OrderProvenance;
};

export type BuyerOrderLineDto = {
  line_number: number;
  quantity: number;
  unit_price_minor: number;
  line_subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  sellable_product_id: string;
  product_snapshot: Record<string, unknown>;
};

async function loadLineCounts(supabase: any, orderIds: string[]): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (orderIds.length === 0) return m;
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("order_lines")
    .select("order_id")
    .in("order_id", orderIds);
  if (error || !data) return m;
  for (const row of data as { order_id: string }[]) {
    const id = String(row.order_id);
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

async function loadMigratedSetForIds(supabase: any, orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("legacy_order_map")
    .select("gc_order_id")
    .in("gc_order_id", orderIds);
  if (error || !data) return new Set();
  return new Set((data as { gc_order_id: string }[]).map((r) => String(r.gc_order_id)));
}

export async function fetchBuyerOrdersForCompany(
  supabase: any,
  companyId: string,
  limit = 50
): Promise<{ rows: BuyerOrderListRow[]; error: string | null }> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("orders")
    .select("id, order_number, status, placed_at, currency_code, total_minor, metadata")
    .eq("company_id", companyId)
    .order("placed_at", { ascending: false })
    .limit(Math.min(limit, 100));

  if (error) {
    return { rows: [], error: error.message };
  }

  const raw = (data ?? []) as Record<string, unknown>[];
  const orderIds = raw.map((r) => String(r.id));
  const [lineCounts, migratedInPage] = await Promise.all([
    loadLineCounts(supabase, orderIds),
    loadMigratedSetForIds(supabase, orderIds),
  ]);

  const rows: BuyerOrderListRow[] = raw.map((r) => {
    const id = String(r.id);
    const meta = r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : null;
    return {
      id,
      order_number: String(r.order_number),
      status: String(r.status),
      placed_at: String(r.placed_at),
      currency_code: String(r.currency_code ?? "USD"),
      total_minor: Number(r.total_minor ?? 0),
      line_count: lineCounts.get(id) ?? 0,
      provenance: provenanceFromRow(migratedInPage.has(id), meta),
    };
  });

  return { rows, error: null };
}

export async function fetchBuyerOrderDetailForCompany(
  supabase: any,
  orderId: string,
  companyId: string
): Promise<{ header: BuyerOrderHeaderDto | null; lines: BuyerOrderLineDto[]; error: string | null }> {
  const { data: order, error: oErr } = await supabase
    .schema("gc_commerce")
    .from("orders")
    .select(
      "id, company_id, order_number, status, currency_code, subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor, placed_at, created_at, metadata"
    )
    .eq("id", orderId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (oErr) {
    return { header: null, lines: [], error: oErr.message };
  }
  if (!order) {
    return { header: null, lines: [], error: null };
  }

  const o = order as Record<string, unknown>;
  const { data: mapRow } = await supabase
    .schema("gc_commerce")
    .from("legacy_order_map")
    .select("gc_order_id")
    .eq("gc_order_id", orderId)
    .maybeSingle();

  const meta = o.metadata && typeof o.metadata === "object" ? (o.metadata as Record<string, unknown>) : {};
  const hasMap = Boolean(mapRow);

  const header: BuyerOrderHeaderDto = {
    id: String(o.id),
    order_number: String(o.order_number),
    status: String(o.status),
    currency_code: String(o.currency_code ?? "USD"),
    subtotal_minor: Number(o.subtotal_minor ?? 0),
    discount_minor: Number(o.discount_minor ?? 0),
    shipping_minor: Number(o.shipping_minor ?? 0),
    tax_minor: Number(o.tax_minor ?? 0),
    total_minor: Number(o.total_minor ?? 0),
    placed_at: String(o.placed_at),
    created_at: String(o.created_at),
    provenance: provenanceFromRow(hasMap, meta),
  };

  const { data: linesRaw, error: lErr } = await supabase
    .schema("gc_commerce")
    .from("order_lines")
    .select("line_number, quantity, unit_price_minor, line_subtotal_minor, discount_minor, tax_minor, total_minor, sellable_product_id, product_snapshot")
    .eq("order_id", orderId)
    .order("line_number", { ascending: true });

  if (lErr) {
    return { header, lines: [], error: lErr.message };
  }

  const lines: BuyerOrderLineDto[] = (linesRaw ?? []).map((row: Record<string, unknown>) => {
    const snap = row.product_snapshot && typeof row.product_snapshot === "object" ? (row.product_snapshot as Record<string, unknown>) : {};
    return {
      line_number: Number(row.line_number),
      quantity: Number(row.quantity),
      unit_price_minor: Number(row.unit_price_minor),
      line_subtotal_minor: Number(row.line_subtotal_minor),
      discount_minor: Number(row.discount_minor ?? 0),
      tax_minor: Number(row.tax_minor ?? 0),
      total_minor: Number(row.total_minor),
      sellable_product_id: String(row.sellable_product_id),
      product_snapshot: snap,
    };
  });

  return { header, lines, error: null };
}

export function isGcOrderHistoryEnabled(): boolean {
  const v = process.env.FEATURE_GC_ORDER_HISTORY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

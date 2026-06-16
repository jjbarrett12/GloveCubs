/**
 * Read-only admin order explorer. gc_commerce.orders / order_lines only.
 * No revenue/margin semantics — raw canonical order records (may include migrated legacy).
 */

export type OrderProvenance = "migrated_legacy" | "native_gc" | "unknown";

export type AdminOrderListFilters = {
  q?: string;
  companyId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  provenance?: "all" | "migrated" | "unknown";
  paymentIntegrityHold?: boolean;
  limit?: number;
  offset?: number;
};

export type AdminOrderListRow = {
  id: string;
  company_id: string;
  company_trade_name: string | null;
  order_number: string;
  status: string;
  placed_at: string;
  created_at: string;
  currency_code: string;
  total_minor: number;
  line_count: number;
  provenance: OrderProvenance;
  has_payment_record: boolean;
  has_fulfillment_record: boolean;
  payment_integrity_hold: boolean;
};

export type AdminOrderHeaderDto = {
  id: string;
  company_id: string;
  company_trade_name: string | null;
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
  updated_at: string;
  created_by_user_id: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  shipping_address: unknown;
  stripe_payment_intent_id: string | null;
  payment_method: string | null;
  payment_confirmed_at: string | null;
  payment_integrity_hold: boolean | null;
  inventory_reserved_at: string | null;
  inventory_released_at: string | null;
  inventory_deducted_at: string | null;
  invoice_status: string | null;
  invoice_amount_due: number | null;
  invoice_amount_paid: number | null;
  invoice_due_at: string | null;
  provenance: OrderProvenance;
  legacy_order_id: number | null;
};

export type AdminOrderLineDto = {
  id: string;
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

const MAX_MIGRATED_ID_FILTER = 4000;

export function provenanceFromRow(hasLegacyMap: boolean, metadata: Record<string, unknown> | null): OrderProvenance {
  if (hasLegacyMap) return "migrated_legacy";
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const keys = Object.keys(meta);
  if (keys.length === 0) return "unknown";
  return "native_gc";
}

function hasPaymentRecord(o: Record<string, unknown>): boolean {
  return Boolean(o.stripe_payment_intent_id) || Boolean(o.payment_confirmed_at);
}

function hasFulfillmentRecord(o: Record<string, unknown>): boolean {
  return Boolean(o.inventory_deducted_at) || Boolean(o.inventory_released_at) || Boolean(o.inventory_reserved_at);
}

async function loadMigratedGcOrderIds(supabase: any): Promise<Set<string>> {
  const { data, error } = await supabase.schema("gc_commerce").from("legacy_order_map").select("gc_order_id").limit(MAX_MIGRATED_ID_FILTER);
  if (error || !data) return new Set();
  return new Set((data as { gc_order_id: string }[]).map((r) => String(r.gc_order_id)));
}

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

async function loadCompanyNames(supabase: any, companyIds: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const uniq = Array.from(new Set(companyIds)).filter(Boolean);
  if (uniq.length === 0) return m;
  const { data, error } = await supabase.schema("gc_commerce").from("companies").select("id, trade_name").in("id", uniq);
  if (error || !data) return m;
  for (const row of data as { id: string; trade_name: string }[]) {
    m.set(String(row.id), row.trade_name);
  }
  return m;
}

export async function fetchAdminOrderList(
  supabase: any,
  filters: AdminOrderListFilters
): Promise<{ rows: AdminOrderListRow[]; error: string | null; totalApprox: number; provenanceNote: string | null }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  const migratedSet = await loadMigratedGcOrderIds(supabase);

  let query = supabase
    .schema("gc_commerce")
    .from("orders")
    .select(
      "id, company_id, order_number, status, placed_at, created_at, currency_code, total_minor, metadata, stripe_payment_intent_id, payment_confirmed_at, payment_integrity_hold, inventory_reserved_at, inventory_released_at, inventory_deducted_at",
      { count: "exact" }
    );

  if (filters.q?.trim()) {
    query = query.ilike("order_number", `%${filters.q.trim()}%`);
  }
  if (filters.companyId?.trim()) {
    query = query.eq("company_id", filters.companyId.trim());
  }
  if (filters.status?.trim()) {
    query = query.eq("status", filters.status.trim());
  }
  if (filters.dateFrom?.trim()) {
    query = query.gte("placed_at", filters.dateFrom.trim());
  }
  if (filters.dateTo?.trim()) {
    query = query.lte("placed_at", filters.dateTo.trim());
  }
  if (filters.paymentIntegrityHold === true) {
    query = query.eq("payment_integrity_hold", true);
  }

  if (filters.provenance === "migrated") {
    if (migratedSet.size === 0) {
      return { rows: [], error: null, totalApprox: 0, provenanceNote: null };
    }
    query = query.in("id", Array.from(migratedSet));
  }

  query = query.order("placed_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return { rows: [], error: error.message, totalApprox: 0, provenanceNote: null };
  }

  let raw = (data ?? []) as Record<string, unknown>[];

  if (filters.provenance === "unknown") {
    raw = raw.filter((r) => {
      const id = String(r.id);
      const hasMap = migratedSet.has(id);
      const meta = r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {};
      return provenanceFromRow(hasMap, meta) === "unknown";
    });
  }

  const orderIds = raw.map((r) => String(r.id));
  const companyIds = raw.map((r) => String(r.company_id));
  const [lineCounts, companyNames] = await Promise.all([
    loadLineCounts(supabase, orderIds),
    loadCompanyNames(supabase, companyIds),
  ]);

  const rows: AdminOrderListRow[] = raw.map((r) => {
    const id = String(r.id);
    const hasMap = migratedSet.has(id);
    const meta = r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : null;
    return {
      id,
      company_id: String(r.company_id),
      company_trade_name: companyNames.get(String(r.company_id)) ?? null,
      order_number: String(r.order_number),
      status: String(r.status),
      placed_at: String(r.placed_at),
      created_at: String(r.created_at),
      currency_code: String(r.currency_code ?? "USD"),
      total_minor: Number(r.total_minor ?? 0),
      line_count: lineCounts.get(id) ?? 0,
      provenance: provenanceFromRow(hasMap, meta),
      has_payment_record: hasPaymentRecord(r),
      has_fulfillment_record: hasFulfillmentRecord(r),
      payment_integrity_hold: r.payment_integrity_hold === true,
    };
  });

  const provenanceNote =
    filters.provenance === "unknown"
      ? "Unknown-provenance filter applies to the current result page only (pagination is approximate)."
      : migratedSet.size >= MAX_MIGRATED_ID_FILTER
        ? `Legacy map capped at ${MAX_MIGRATED_ID_FILTER} rows; migrated filter may be incomplete.`
        : null;

  return { rows, error: null, totalApprox: count ?? rows.length, provenanceNote };
}

export async function fetchAdminOrderDetail(
  supabase: any,
  orderId: string
): Promise<{ header: AdminOrderHeaderDto | null; lines: AdminOrderLineDto[]; error: string | null }> {
  const { data: order, error: oErr } = await supabase
    .schema("gc_commerce")
    .from("orders")
    .select(
      "id, company_id, order_number, status, currency_code, subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor, placed_at, created_at, updated_at, created_by_user_id, idempotency_key, metadata, shipping_address, stripe_payment_intent_id, payment_method, payment_confirmed_at, payment_integrity_hold, inventory_reserved_at, inventory_released_at, inventory_deducted_at, invoice_status, invoice_amount_due, invoice_amount_paid, invoice_due_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (oErr) {
    return { header: null, lines: [], error: oErr.message };
  }
  if (!order) {
    return { header: null, lines: [], error: null };
  }

  const o = order as Record<string, unknown>;
  const companyId = String(o.company_id);
  const { data: co } = await supabase.schema("gc_commerce").from("companies").select("trade_name").eq("id", companyId).maybeSingle();

  const { data: mapRow } = await supabase
    .schema("gc_commerce")
    .from("legacy_order_map")
    .select("legacy_order_id")
    .eq("gc_order_id", orderId)
    .maybeSingle();

  const meta = o.metadata && typeof o.metadata === "object" ? (o.metadata as Record<string, unknown>) : {};
  const hasMap = Boolean(mapRow && (mapRow as { legacy_order_id: unknown }).legacy_order_id != null);
  const legacyId = mapRow ? Number((mapRow as { legacy_order_id: number }).legacy_order_id) : null;

  const header: AdminOrderHeaderDto = {
    id: String(o.id),
    company_id: companyId,
    company_trade_name: co && typeof (co as { trade_name: string }).trade_name === "string" ? (co as { trade_name: string }).trade_name : null,
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
    updated_at: String(o.updated_at),
    created_by_user_id: o.created_by_user_id != null ? String(o.created_by_user_id) : null,
    idempotency_key: o.idempotency_key != null ? String(o.idempotency_key) : null,
    metadata: meta,
    shipping_address: o.shipping_address ?? null,
    stripe_payment_intent_id: o.stripe_payment_intent_id != null ? String(o.stripe_payment_intent_id) : null,
    payment_method: o.payment_method != null ? String(o.payment_method) : null,
    payment_confirmed_at: o.payment_confirmed_at != null ? String(o.payment_confirmed_at) : null,
    payment_integrity_hold: o.payment_integrity_hold != null ? Boolean(o.payment_integrity_hold) : null,
    inventory_reserved_at: o.inventory_reserved_at != null ? String(o.inventory_reserved_at) : null,
    inventory_released_at: o.inventory_released_at != null ? String(o.inventory_released_at) : null,
    inventory_deducted_at: o.inventory_deducted_at != null ? String(o.inventory_deducted_at) : null,
    invoice_status: o.invoice_status != null ? String(o.invoice_status) : null,
    invoice_amount_due: o.invoice_amount_due != null ? Number(o.invoice_amount_due) : null,
    invoice_amount_paid: o.invoice_amount_paid != null ? Number(o.invoice_amount_paid) : null,
    invoice_due_at: o.invoice_due_at != null ? String(o.invoice_due_at) : null,
    provenance: provenanceFromRow(hasMap, meta),
    legacy_order_id: Number.isFinite(legacyId) ? legacyId : null,
  };

  const { data: linesRaw, error: lErr } = await supabase
    .schema("gc_commerce")
    .from("order_lines")
    .select("id, line_number, quantity, unit_price_minor, line_subtotal_minor, discount_minor, tax_minor, total_minor, sellable_product_id, product_snapshot")
    .eq("order_id", orderId)
    .order("line_number", { ascending: true });

  if (lErr) {
    return { header, lines: [], error: lErr.message };
  }

  const lines: AdminOrderLineDto[] = (linesRaw ?? []).map((row: Record<string, unknown>) => {
    const snap = row.product_snapshot && typeof row.product_snapshot === "object" ? (row.product_snapshot as Record<string, unknown>) : {};
    return {
      id: String(row.id),
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

/** Display-only: minor units → major currency string (not a pricing authority). */
export function formatMinorAmount(minor: number, currencyCode: string): string {
  const code = (currencyCode || "USD").length === 3 ? currencyCode : "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(minor / 100);
  } catch {
    return `${minor} ${code} minor`;
  }
}

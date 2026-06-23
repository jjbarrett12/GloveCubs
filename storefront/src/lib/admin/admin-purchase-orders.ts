import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSmtpMail } from "@/lib/email/smtp";

const GC = "gc_commerce";

export type AdminPurchaseOrderLine = {
  product_id?: string;
  canonical_product_id?: string;
  sku?: string;
  name?: string;
  quantity?: number;
  unit_cost?: number;
};

export type AdminPurchaseOrderRow = {
  id: number;
  po_number: string;
  manufacturer_id: number;
  manufacturer_name: string;
  order_id?: number | string | null;
  order_number: string | null;
  status: string;
  subtotal?: number | null;
  created_at: string;
  sent_at?: string | null;
  sent_by_user_id?: string | null;
  received_at?: string | null;
  received_by_user_id?: string | null;
  shipping_address?: unknown;
  customer_order_number?: string | null;
  lines?: AdminPurchaseOrderLine[];
  received_lines?: { canonical_product_id?: string; quantity_received?: number }[];
  order?: Record<string, unknown> | null;
};

export const PO_ALREADY_SENT = "PO_ALREADY_SENT";
export const PO_ALREADY_RECEIVED = "PO_ALREADY_RECEIVED";
export const PO_INVALID_STATUS = "PO_INVALID_STATUS";
export const PO_PARTIAL_UNSUPPORTED = "PO_PARTIAL_UNSUPPORTED";
export const PO_LINES_MISMATCH = "PO_LINES_MISMATCH";
export const PO_LINE_CANONICAL_REQUIRED = "PO_LINE_CANONICAL_REQUIRED";

const PO_SENDABLE_STATUSES = new Set(["draft"]);
const PO_RECEIVABLE_STATUSES = new Set(["draft", "sent"]);

export type AdminPurchaseOrderReceiveLine = {
  canonical_product_id: string;
  quantity_received: number;
};

function parsePoId(raw: unknown): number | null {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatShippingAddress(addr: unknown): string {
  if (typeof addr === "string" && addr.trim()) return addr.trim();
  if (addr && typeof addr === "object" && "display" in addr) {
    const display = (addr as { display?: unknown }).display;
    if (typeof display === "string" && display.trim()) return display.trim();
  }
  return "See order";
}

function computeSubtotal(lines: AdminPurchaseOrderLine[] | undefined): number {
  return (lines ?? []).reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0),
    0,
  );
}

function mapPoRow(
  po: Record<string, unknown>,
  manufacturerName: string,
  orderNumber: string | null,
): AdminPurchaseOrderRow {
  const lines = Array.isArray(po.lines) ? (po.lines as AdminPurchaseOrderLine[]) : [];
  const subtotal =
    po.subtotal != null && Number.isFinite(Number(po.subtotal))
      ? Number(po.subtotal)
      : computeSubtotal(lines);
  return {
    id: Number(po.id),
    po_number: po.po_number != null ? String(po.po_number) : "",
    manufacturer_id: Number(po.manufacturer_id),
    manufacturer_name: manufacturerName,
    order_id: po.order_id as number | string | null | undefined,
    order_number: orderNumber,
    status: po.status != null ? String(po.status) : "draft",
    subtotal,
    created_at: po.created_at != null ? String(po.created_at) : "",
    sent_at: po.sent_at != null ? String(po.sent_at) : null,
    sent_by_user_id: po.sent_by_user_id != null ? String(po.sent_by_user_id) : null,
    received_at: po.received_at != null ? String(po.received_at) : null,
    received_by_user_id: po.received_by_user_id != null ? String(po.received_by_user_id) : null,
    shipping_address: po.shipping_address,
    customer_order_number:
      po.customer_order_number != null ? String(po.customer_order_number) : null,
    lines,
    received_lines: Array.isArray(po.received_lines)
      ? (po.received_lines as AdminPurchaseOrderRow["received_lines"])
      : undefined,
  };
}

async function loadManufacturersMap(
  supabase: SupabaseClient,
): Promise<Map<number, { id: number; name: string; po_email?: string | null; vendor_email?: string | null }>> {
  const { data, error } = await supabase.from("manufacturers").select("*").order("name");
  if (error) throw error;
  const map = new Map<number, { id: number; name: string; po_email?: string | null; vendor_email?: string | null }>();
  for (const row of data ?? []) {
    map.set(Number(row.id), row as { id: number; name: string; po_email?: string | null; vendor_email?: string | null });
  }
  return map;
}

async function loadOrderNumberMap(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.schema(GC).from("orders").select("id, order_number");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.order_number != null) {
      map.set(String(row.id), String(row.order_number));
    }
  }
  return map;
}

function resolveOrderNumber(
  po: Record<string, unknown>,
  orderMap: Map<string, string>,
): string | null {
  if (po.order_id != null) {
    const key = String(po.order_id);
    return orderMap.get(key) ?? null;
  }
  return null;
}

/** List purchase orders (mirrors Express GET /api/admin/purchase-orders). */
export async function fetchAdminPurchaseOrders(
  supabase: SupabaseClient,
): Promise<{ rows: AdminPurchaseOrderRow[]; error: string | null; status: number }> {
  try {
    const [{ data: list, error: poErr }, mfrMap, orderMap] = await Promise.all([
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      loadManufacturersMap(supabase),
      loadOrderNumberMap(supabase),
    ]);
    if (poErr) return { rows: [], error: poErr.message, status: 500 };

    const rows = (list ?? []).map((po) => {
      const raw = po as Record<string, unknown>;
      const mfr = mfrMap.get(Number(raw.manufacturer_id));
      return mapPoRow(raw, mfr?.name ?? "", resolveOrderNumber(raw, orderMap));
    });
    return { rows, error: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load POs";
    return { rows: [], error: message, status: 500 };
  }
}

/** PO detail (mirrors Express GET /api/admin/purchase-orders/:id). */
export async function fetchAdminPurchaseOrderById(
  supabase: SupabaseClient,
  poId: number,
): Promise<{ po: AdminPurchaseOrderRow | null; error: string | null; status: number }> {
  try {
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("id", poId)
      .maybeSingle();
    if (poErr) return { po: null, error: poErr.message, status: 500 };
    if (!po) return { po: null, error: "Purchase order not found", status: 404 };

    const mfrMap = await loadManufacturersMap(supabase);
    const mfr = mfrMap.get(Number(po.manufacturer_id));
    const orderMap = await loadOrderNumberMap(supabase);
    const raw = po as Record<string, unknown>;
    const orderNumber = resolveOrderNumber(raw, orderMap);

    let order: Record<string, unknown> | null = null;
    if (raw.order_id != null) {
      const { data: orderRow } = await supabase
        .schema(GC)
        .from("orders")
        .select("*")
        .eq("id", String(raw.order_id))
        .maybeSingle();
      order = (orderRow as Record<string, unknown> | null) ?? null;
    }

    return {
      po: { ...mapPoRow(raw, mfr?.name ?? "", orderNumber), order },
      error: null,
      status: 200,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load PO";
    return { po: null, error: message, status: 500 };
  }
}

function buildPoVendorEmailBody(po: AdminPurchaseOrderRow): string {
  const lineText = (po.lines ?? [])
    .map(
      (l) =>
        `  ${l.sku || l.name} - ${l.name || ""} x ${l.quantity ?? 0} @ $${(Number(l.unit_cost) || 0).toFixed(2)}`,
    )
    .join("\n");
  return `GloveCubs Purchase Order\n\nPO#: ${po.po_number}\nDate: ${(po.created_at || "").slice(0, 10)}\n\nShip to (drop-ship):\n${formatShippingAddress(po.shipping_address).replace(/\n/g, "\n")}\n\nCustomer Order: ${po.customer_order_number || "N/A"}\n\nLine items:\n${lineText}\n\nSubtotal: $${(Number(po.subtotal) || 0).toFixed(2)}\n\nPlease confirm and ship to the address above.\n\n— GloveCubs`;
}

/** Send PO email to vendor. Server validates draft-only status. */
export async function sendAdminPurchaseOrder(
  supabase: SupabaseClient,
  poId: number,
  operatorId: string,
): Promise<{
  success: boolean;
  sent?: boolean;
  po_number?: string;
  error: string | null;
  code: string | null;
  status: number;
}> {
  const id = parsePoId(poId);
  if (id == null) {
    return { success: false, error: "Invalid PO ID", code: null, status: 400 };
  }

  try {
    const { po, error, status } = await fetchAdminPurchaseOrderById(supabase, id);
    if (error || !po) {
      return { success: false, error: error ?? "Purchase order not found", code: null, status };
    }

    if (po.status === "sent") {
      return {
        success: false,
        error: "Purchase order has already been sent",
        code: PO_ALREADY_SENT,
        status: 409,
      };
    }
    if (po.status === "received" || po.received_at) {
      return {
        success: false,
        error: "Purchase order has already been received",
        code: PO_ALREADY_RECEIVED,
        status: 409,
      };
    }
    if (!PO_SENDABLE_STATUSES.has(po.status)) {
      return {
        success: false,
        error: `Purchase order status ${po.status} is not eligible for send`,
        code: PO_INVALID_STATUS,
        status: 400,
      };
    }

    const { data: mfr, error: mfrErr } = await supabase
      .from("manufacturers")
      .select("*")
      .eq("id", po.manufacturer_id)
      .maybeSingle();
    if (mfrErr) return { success: false, error: mfrErr.message, code: null, status: 500 };
    if (!mfr) return { success: false, error: "Manufacturer not found", code: null, status: 400 };

    const toEmail = String(mfr.po_email || mfr.vendor_email || "").trim();
    if (!toEmail) {
      return {
        success: false,
        error: "Manufacturer has no PO/vendor email. Add it in Vendors.",
        code: null,
        status: 400,
      };
    }

    const bodyText = buildPoVendorEmailBody(po);
    const result = await sendSmtpMail({
      to: toEmail,
      subject: `Purchase Order ${po.po_number} - GloveCubs`,
      text: bodyText,
      html: bodyText.replace(/\n/g, "<br>"),
    });
    if (!result.sent) {
      return {
        success: false,
        error: result.error || "Failed to send email",
        code: null,
        status: 500,
      };
    }

    const sentAt = new Date().toISOString();
    const { data: updated, error: upErr } = await supabase
      .from("purchase_orders")
      .update({
        status: "sent",
        sent_at: sentAt,
        sent_by_user_id: operatorId,
        updated_at: sentAt,
      })
      .eq("id", id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (upErr) return { success: false, error: upErr.message, code: null, status: 500 };
    if (!updated) {
      return {
        success: false,
        error: "Purchase order is no longer in draft status",
        code: PO_ALREADY_SENT,
        status: 409,
      };
    }

    return { success: true, sent: true, po_number: po.po_number, error: null, code: null, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send PO";
    return { success: false, error: message, code: null, status: 500 };
  }
}

type RpcReceiveResult = {
  ok?: boolean;
  code?: string;
  error?: string;
  po_id?: number;
};

function mapRpcReceiveFailure(result: RpcReceiveResult): {
  error: string;
  code: string | null;
  status: number;
} {
  const code = result.code ?? null;
  const error = result.error ?? "Failed to receive PO";
  if (code === PO_ALREADY_RECEIVED) return { error, code, status: 409 };
  if (code === PO_INVALID_STATUS || code === PO_PARTIAL_UNSUPPORTED || code === PO_LINES_MISMATCH) {
    return { error, code, status: 400 };
  }
  if (code === PO_LINE_CANONICAL_REQUIRED) return { error, code, status: 400 };
  if (code === "PO_NOT_FOUND") return { error, code, status: 404 };
  return { error, code, status: 500 };
}

/**
 * Full PO receive via atomic RPC (row lock + inventory + stock_history + status).
 * Partial receive is rejected unless request lines match all PO line quantities exactly.
 */
export async function receiveAdminPurchaseOrder(
  supabase: SupabaseClient,
  poId: number,
  operatorId: string,
  receivedLines: AdminPurchaseOrderReceiveLine[],
): Promise<{
  success: boolean;
  po: AdminPurchaseOrderRow | null;
  error: string | null;
  code: string | null;
  status: number;
}> {
  const id = parsePoId(poId);
  if (id == null) {
    return { success: false, po: null, error: "Invalid PO ID", code: null, status: 400 };
  }
  if (!receivedLines.length) {
    return {
      success: false,
      po: null,
      error: "lines array required: [{ canonical_product_id (UUID), quantity_received }]",
      code: null,
      status: 400,
    };
  }

  try {
    const { po: preview, error: previewErr, status: previewStatus } = await fetchAdminPurchaseOrderById(
      supabase,
      id,
    );
    if (previewErr || !preview) {
      return {
        success: false,
        po: null,
        error: previewErr ?? "Purchase order not found",
        code: null,
        status: previewStatus,
      };
    }
    if (preview.status === "received" || preview.received_at) {
      return {
        success: false,
        po: null,
        error: "Purchase order has already been received",
        code: PO_ALREADY_RECEIVED,
        status: 409,
      };
    }
    if (!PO_RECEIVABLE_STATUSES.has(preview.status)) {
      return {
        success: false,
        po: null,
        error: `Purchase order status ${preview.status} is not eligible for receive`,
        code: PO_INVALID_STATUS,
        status: 400,
      };
    }

    const { data, error: rpcErr } = await supabase.rpc("admin_receive_purchase_order_full_atomic", {
      p_po_id: id,
      p_operator_user_id: operatorId,
      p_lines: receivedLines,
    });
    if (rpcErr) {
      return { success: false, po: null, error: rpcErr.message, code: null, status: 500 };
    }

    const rpcResult = (data ?? {}) as RpcReceiveResult;
    if (!rpcResult.ok) {
      const mapped = mapRpcReceiveFailure(rpcResult);
      return {
        success: false,
        po: null,
        error: mapped.error,
        code: mapped.code,
        status: mapped.status,
      };
    }

    const detail = await fetchAdminPurchaseOrderById(supabase, id);
    return {
      success: true,
      po: detail.po,
      error: null,
      code: null,
      status: 200,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to receive PO";
    return { success: false, po: null, error: message, code: null, status: 500 };
  }
}

export function buildReceiveLinesFromPo(po: {
  lines?: { canonical_product_id?: string; product_id?: string; quantity?: number }[];
}): AdminPurchaseOrderReceiveLine[] {
  const out: AdminPurchaseOrderReceiveLine[] = [];
  for (const line of po.lines ?? []) {
    const canon = line.canonical_product_id || line.product_id;
    if (!canon || typeof canon !== "string") continue;
    const qty = Math.max(1, parseInt(String(line.quantity ?? 1), 10) || 1);
    out.push({ canonical_product_id: canon, quantity_received: qty });
  }
  return out;
}

export { parsePoId };

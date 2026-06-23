import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildReceiveLinesFromPo,
  fetchAdminPurchaseOrders,
  parsePoId,
  PO_ALREADY_RECEIVED,
  PO_ALREADY_SENT,
  PO_INVALID_STATUS,
  receiveAdminPurchaseOrder,
  sendAdminPurchaseOrder,
} from "./admin-purchase-orders";

vi.mock("@/lib/email/smtp", () => ({
  sendSmtpMail: vi.fn(),
}));

import { sendSmtpMail } from "@/lib/email/smtp";

const PO_ID = 42;
const MFR_ID = 7;
const ADMIN_ID = "00000000-0000-4000-8000-000000000099";
const CANON_ID = "00000000-0000-4000-8000-000000000001";
const VARIANT_ID = "00000000-0000-4000-8000-000000000002";

function basePo(overrides: Record<string, unknown> = {}) {
  return {
    id: PO_ID,
    po_number: "PO-00001",
    manufacturer_id: MFR_ID,
    status: "draft",
    purchase_order_type: "inbound_stock",
    fulfillment_status: "pending",
    created_at: "2026-01-01T00:00:00Z",
    customer_order_number: "ORD-100",
    shipping_address: "123 Ship St",
    lines: [
      {
        catalog_variant_id: VARIANT_ID,
        canonical_product_id: CANON_ID,
        sku: "SKU-1",
        name: "Glove",
        quantity: 10,
        unit_cost: 2.5,
      },
    ],
    received_lines: [],
    ...overrides,
  };
}

function mockSupabase(options: {
  po?: Record<string, unknown> | null;
  pos?: Record<string, unknown>[];
  mfr?: Record<string, unknown> | null;
  rpcResult?: Record<string, unknown>;
  rpcError?: { message: string } | null;
  draftUpdateFails?: boolean;
} = {}) {
  let poRow = options.po ?? basePo();

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "purchase_orders") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: options.pos ?? [poRow],
              error: null,
            })),
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: poRow, error: null })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn((col: string, val: unknown) => {
              if (col === "status" && val === "draft" && options.draftUpdateFails) {
                return {
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                };
              }
              if (payload.status === "sent") {
                poRow = { ...poRow, ...payload, status: "sent" };
              }
              return {
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: { id: PO_ID }, error: null })),
                  })),
                })),
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: PO_ID }, error: null })),
                })),
              };
            }),
          })),
        };
      }
      if (table === "manufacturers") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: [
                options.mfr ?? {
                  id: MFR_ID,
                  name: "Acme Vendor",
                  po_email: "vendor@example.com",
                },
              ],
              error: null,
            })),
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: options.mfr ?? {
                  id: MFR_ID,
                  name: "Acme Vendor",
                  po_email: "vendor@example.com",
                },
                error: null,
              })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(async () => ({
      data: options.rpcResult ?? { ok: true, po_id: PO_ID },
      error: options.rpcError ?? null,
    })),
  };

  return supabase as unknown as Parameters<typeof fetchAdminPurchaseOrders>[0];
}

describe("admin-purchase-orders hardening", () => {
  beforeEach(() => {
    vi.mocked(sendSmtpMail).mockReset();
  });

  it("parsePoId validates positive integers", () => {
    expect(parsePoId("42")).toBe(42);
    expect(parsePoId("bad")).toBeNull();
  });

  it("fetchAdminPurchaseOrders returns rows without secrets", async () => {
    const result = await fetchAdminPurchaseOrders(mockSupabase());
    expect(result.error).toBeNull();
    expect(JSON.stringify(result.rows)).not.toContain("JWT_SECRET");
  });

  it("sendAdminPurchaseOrder rejects already-sent POs", async () => {
    const supabase = mockSupabase({ po: basePo({ status: "sent" }) });
    const result = await sendAdminPurchaseOrder(supabase, PO_ID, ADMIN_ID);
    expect(result.status).toBe(409);
    expect(result.code).toBe(PO_ALREADY_SENT);
  });

  it("sendAdminPurchaseOrder rejects received POs", async () => {
    const supabase = mockSupabase({ po: basePo({ status: "received", received_at: "2026-01-02T00:00:00Z" }) });
    const result = await sendAdminPurchaseOrder(supabase, PO_ID, ADMIN_ID);
    expect(result.status).toBe(409);
    expect(result.code).toBe(PO_ALREADY_RECEIVED);
  });

  it("sendAdminPurchaseOrder sends email and records sent_by metadata", async () => {
    vi.mocked(sendSmtpMail).mockResolvedValue({ sent: true });
    const supabase = mockSupabase();
    const result = await sendAdminPurchaseOrder(supabase, PO_ID, ADMIN_ID);
    expect(result.success).toBe(true);
    expect(sendSmtpMail).toHaveBeenCalled();
  });

  it("sendAdminPurchaseOrder handles missing SMTP safely", async () => {
    vi.mocked(sendSmtpMail).mockResolvedValue({ sent: false, error: "SMTP not configured" });
    const result = await sendAdminPurchaseOrder(mockSupabase(), PO_ID, ADMIN_ID);
    expect(result.status).toBe(500);
  });

  it("receiveAdminPurchaseOrder rejects already-received POs before RPC", async () => {
    const supabase = mockSupabase({
      po: basePo({ status: "received", received_at: "2026-01-02T00:00:00Z" }),
    });
    const lines = buildReceiveLinesFromPo(basePo());
    const result = await receiveAdminPurchaseOrder(supabase, PO_ID, ADMIN_ID, lines);
    expect(result.status).toBe(409);
    expect(result.code).toBe(PO_ALREADY_RECEIVED);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("receiveAdminPurchaseOrder rejects invalid status", async () => {
    const supabase = mockSupabase({ po: basePo({ status: "cancelled" }) });
    const lines = buildReceiveLinesFromPo(basePo());
    const result = await receiveAdminPurchaseOrder(supabase, PO_ID, ADMIN_ID, lines);
    expect(result.status).toBe(400);
    expect(result.code).toBe(PO_INVALID_STATUS);
  });

  it("receiveAdminPurchaseOrder calls atomic RPC with operator id", async () => {
    const supabase = mockSupabase({ po: basePo({ status: "sent" }) });
    const lines = buildReceiveLinesFromPo(basePo());
    const result = await receiveAdminPurchaseOrder(supabase, PO_ID, ADMIN_ID, lines);
    expect(result.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("admin_receive_purchase_order_shipment_atomic", {
      p_po_id: PO_ID,
      p_operator_user_id: ADMIN_ID,
      p_lines: lines,
      p_idempotency_key: null,
      p_receipt_notes: null,
      p_allow_overage: false,
    });
  });

  it("receiveAdminPurchaseOrder surfaces RPC duplicate protection", async () => {
    const supabase = mockSupabase({
      po: basePo({ status: "sent" }),
      rpcResult: { ok: false, code: PO_ALREADY_RECEIVED, error: "Purchase order has already been received" },
    });
    const lines = buildReceiveLinesFromPo(basePo());
    const result = await receiveAdminPurchaseOrder(supabase, PO_ID, ADMIN_ID, lines);
    expect(result.status).toBe(409);
    expect(result.code).toBe(PO_ALREADY_RECEIVED);
  });

  it("buildReceiveLinesFromPo produces remaining line quantities", () => {
    expect(buildReceiveLinesFromPo(basePo())).toEqual([
      { catalog_variant_id: VARIANT_ID, quantity_received: 10 },
    ]);
  });

  it("receiveAdminPurchaseOrder rejects dropship fulfillment PO type", async () => {
    const supabase = mockSupabase({ po: basePo({ status: "sent", purchase_order_type: "dropship_fulfillment" }) });
    const lines = buildReceiveLinesFromPo(basePo());
    const result = await receiveAdminPurchaseOrder(supabase, PO_ID, ADMIN_ID, lines);
    expect(result.status).toBe(400);
    expect(result.code).toBe("PO_INVALID_TYPE");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("buildReceiveLinesFromPo respects partial receipts", () => {
    expect(
      buildReceiveLinesFromPo(
        basePo({
          received_lines: [{ catalog_variant_id: VARIANT_ID, quantity_received: 4 }],
        }),
      ),
    ).toEqual([{ catalog_variant_id: VARIANT_ID, quantity_received: 6 }]);
  });
});

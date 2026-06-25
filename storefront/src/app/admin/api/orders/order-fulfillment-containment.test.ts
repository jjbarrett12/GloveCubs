// FOLLOW-UP CONTRACT: when the uncommitted `POST /admin/api/orders` auto-create-PO
// path and `NewOrderForm` are landed, they MUST be gated by
// `resolveOrderFulfillmentAvailability()` (503 + ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE
// before any expressAdminFetch call) and covered by tests in this file before merge.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { expressAdminFetch } = vi.hoisted(() => ({ expressAdminFetch: vi.fn() }));

vi.mock("@/lib/admin/express-admin-bridge", () => ({ expressAdminFetch }));

vi.mock("@/lib/admin/get-admin-user", () => ({
  getAdminOperator: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    email: "op@test.com",
  })),
}));

import { PATCH } from "./[orderId]/route";
import { POST as invoicePayment } from "./[orderId]/invoice-payment/route";
import { POST as createPo } from "./[orderId]/create-po/route";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const CODE = "ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE";
const MESSAGE = "Order fulfillment actions are temporarily unavailable. No changes were made.";

function fakeRequest(json: unknown) {
  return {
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as unknown as Parameters<typeof PATCH>[0];
}

describe("order fulfillment BFF containment", () => {
  beforeEach(() => {
    expressAdminFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("when fulfillment actions are unavailable (fail closed)", () => {
    beforeEach(() => {
      vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "");
      vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "");
      vi.stubEnv("JWT_SECRET", "");
    });

    it("PATCH order status/ship returns 503 + code and never calls the bridge", async () => {
      const res = await PATCH(fakeRequest({ status: "shipped" }), { params: { orderId: ORDER_ID } });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code?: string; error?: string };
      expect(body.code).toBe(CODE);
      expect(body.error).toBe(MESSAGE);
      expect(expressAdminFetch).not.toHaveBeenCalled();
    });

    it("invoice-payment returns 503 + code and never calls the bridge", async () => {
      const res = await invoicePayment(fakeRequest({ amount: 100 }), { params: { orderId: ORDER_ID } });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code?: string; error?: string };
      expect(body.code).toBe(CODE);
      expect(body.error).toBe(MESSAGE);
      expect(expressAdminFetch).not.toHaveBeenCalled();
    });

    it("create-po returns 503 + code and never calls the bridge", async () => {
      const res = await createPo(fakeRequest({}), { params: { orderId: ORDER_ID } });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code?: string; error?: string };
      expect(body.code).toBe(CODE);
      expect(body.error).toBe(MESSAGE);
      expect(expressAdminFetch).not.toHaveBeenCalled();
    });

    it("does not leak env names or host internals in the 503 body", async () => {
      const res = await PATCH(fakeRequest({ status: "shipped" }), { params: { orderId: ORDER_ID } });
      const raw = JSON.stringify(await res.json());
      expect(raw).not.toContain("JWT_SECRET");
      expect(raw).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
      expect(raw.toLowerCase()).not.toContain("glovecubs.com");
    });
  });

  describe("when fulfillment actions are intentionally enabled", () => {
    beforeEach(() => {
      vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "1");
      vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "http://localhost:3004");
      vi.stubEnv("JWT_SECRET", "test-secret-for-bridge-only");
    });

    it("PATCH proceeds to the bridge (gate is the only block)", async () => {
      expressAdminFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { success: true } });
      const res = await PATCH(fakeRequest({ status: "shipped" }), { params: { orderId: ORDER_ID } });
      expect(expressAdminFetch).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(200);
    });
  });
});

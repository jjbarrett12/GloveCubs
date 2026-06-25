import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

describe("Phase 1C-ops admin order BFF", () => {
  it("order PATCH route requires operator and proxies Express PUT", () => {
    const s = read("[orderId]/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("401");
    expect(s).toContain("expressAdminFetch");
    expect(s).toContain("/api/admin/orders/");
    expect(s).toContain('method: "PUT"');
    expect(s).toContain("logAdminOrderMutation");
    expect(s).toContain("order_update");
    expect(s).not.toContain("localStorage");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("invoice-payment route proxies Express POST", () => {
    const s = read("[orderId]/invoice-payment/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("/invoice/payment");
    expect(s).toContain("invoice_payment");
  });

  it("create-po route proxies Express POST and forwards blocked_lines", () => {
    const s = read("[orderId]/create-po/route.ts");
    expect(s).toContain("getAdminOperator");
    expect(s).toContain("/create-po");
    expect(s).toContain("blocked_lines");
    expect(s).toContain("create_po");
  });

  it("bridge mints JWT server-side only", () => {
    const s = readFileSync(join(__dirname, "../../../../lib/admin/express-admin-bridge.ts"), "utf8");
    expect(s).toContain("jwt.sign");
    expect(s).toContain("JWT_SECRET");
    expect(s).toContain("Authorization");
    expect(s).toContain("buildExpressCommerceApiUrl");
  });

  it("operator actions call Next BFF only", () => {
    const s = readFileSync(join(__dirname, "../../orders/[orderId]/OrderOperatorActions.tsx"), "utf8");
    expect(s).toContain("/admin/api/orders/");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
    expect(s).not.toContain("localStorage");
    expect(s).not.toMatch(/api\.glovecubs/i);
  });
});

describe("Order fulfillment containment (Express bridge unavailable)", () => {
  const ROUTES = ["[orderId]/route.ts", "[orderId]/invoice-payment/route.ts", "[orderId]/create-po/route.ts"];

  for (const rel of ROUTES) {
    it(`${rel} gates fail-closed (503 + code) before any expressAdminFetch call`, () => {
      const s = read(rel);
      expect(s).toContain("resolveOrderFulfillmentAvailability");
      expect(s).toContain("ORDER_FULFILLMENT_ACTIONS_UNAVAILABLE_MESSAGE");
      expect(s).toContain("status: 503");
      // The availability gate must run before the bridge call.
      const gateIdx = s.indexOf("if (!availability.available)");
      const bridgeIdx = s.indexOf("await expressAdminFetch");
      expect(gateIdx).toBeGreaterThan(-1);
      expect(bridgeIdx).toBeGreaterThan(-1);
      expect(gateIdx).toBeLessThan(bridgeIdx);
    });
  }

  it("operator actions disable/hide bridge-dependent controls when unavailable", () => {
    const s = readFileSync(join(__dirname, "../../orders/[orderId]/OrderOperatorActions.tsx"), "utf8");
    expect(s).toContain("fulfillmentActionsAvailable");
    expect(s).toContain("unavailableReason");
    expect(s).toContain("controlsDisabled");
    // Save fulfillment + create PO controls keyed off the disabled flag.
    expect(s).toContain("disabled={controlsDisabled}");
    // Net-30 record payment section is hidden when unavailable.
    expect(s).toContain("fulfillmentActionsAvailable && isNet30");
    // Operator-facing containment banner (accurate to the d48173c base: no payment portal present).
    expect(s).toContain("Order fulfillment actions are temporarily unavailable. You can still view this order record");
    expect(s).not.toContain("Payment portal links still work");
    // No env/host leakage in the rendered client component.
    expect(s).not.toContain("JWT_SECRET");
    expect(s).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("order detail page computes availability server-side and passes it down", () => {
    const s = readFileSync(join(__dirname, "../../orders/[orderId]/page.tsx"), "utf8");
    expect(s).toContain("resolveOrderFulfillmentAvailability");
    expect(s).toContain("fulfillmentActionsAvailable");
    expect(s).not.toContain("ORDER_FULFILLMENT_BRIDGE_ENABLED");
  });
});

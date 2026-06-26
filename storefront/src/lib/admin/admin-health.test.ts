import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPRESS_ADMIN_MODULE_IDS,
  EXPRESS_BRIDGE_ACTION_MODULE_IDS,
  getAdminHealthShellDisplay,
  getAdminModuleAvailability,
  resolveAdminHealth,
  sanitizeExpressModuleRuntimeError,
} from "./admin-health";

describe("admin-health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubHealthySupabase() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  }

  // Intentionally re-enable the canonical fulfillment policy so tests can isolate
  // non-fulfillment signals. This never appears as production env.
  function stubFulfillmentEnabled() {
    vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "http://localhost:3004");
    vi.stubEnv("JWT_SECRET", "test-secret-for-bridge-only");
  }

  it("does not surface Express origin/JWT as standalone or critical issues (prod, Supabase ok, Express absent)", () => {
    stubHealthySupabase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "");

    const health = resolveAdminHealth();
    const ids = health.issues.map((i) => i.id);
    expect(ids).not.toContain("express-origin-missing");
    expect(ids).not.toContain("express-jwt-missing");
    expect(health.issues.every((i) => i.severity !== "critical")).toBe(true);
    expect(health.status).not.toBe("production_blocking");

    const warnings = health.issues.filter((i) => i.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.id).toBe("order-fulfillment-paused");
    expect(warnings[0]?.title).toBe("Order fulfillment actions are paused");

    expect(getAdminHealthShellDisplay(health).pillLabel).toBe("Operating with limits");
  });

  it("shell says All core systems healthy when only optional CatalogOS/import are missing", () => {
    stubHealthySupabase();
    stubFulfillmentEnabled();
    vi.stubEnv("CATALOGOS_INTERNAL_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CATALOGOS_URL", "");
    vi.stubEnv("INTERNAL_API_KEY", "");

    const health = resolveAdminHealth();
    expect(health.issues).toHaveLength(0);

    const display = getAdminHealthShellDisplay(health);
    expect(display.pillLabel).toBe("All core systems healthy");
    expect(display.showStrip).toBe(false);

    const catalogos = health.integrations.find((i) => i.id === "catalogos");
    const importKey = health.integrations.find((i) => i.id === "import_internal_key");
    expect(catalogos?.configured).toBe(false);
    expect(catalogos?.severity).toBe("info");
    expect(importKey?.configured).toBe(false);
    expect(importKey?.severity).toBe("info");
  });

  it("shell says Action required when core Supabase is unavailable", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    stubFulfillmentEnabled();

    const health = resolveAdminHealth();
    const supa = health.issues.find((i) => i.id === "supabase-missing");
    expect(supa?.severity).toBe("critical");
    expect(getAdminHealthShellDisplay(health).pillLabel).toBe("Action required");
  });

  it("fulfillment stays a warning even when legacy Express env is present but not intentionally enabled", () => {
    stubHealthySupabase();
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "http://localhost:3004");
    vi.stubEnv("JWT_SECRET", "test-secret-for-bridge-only");
    vi.stubEnv("ORDER_FULFILLMENT_BRIDGE_ENABLED", "");

    const health = resolveAdminHealth();
    const warning = health.issues.find((i) => i.id === "order-fulfillment-paused");
    expect(warning?.severity).toBe("warning");
    expect(warning?.status).not.toBe("production_blocking");
    expect(getAdminHealthShellDisplay(health).pillLabel).toBe("Operating with limits");
  });

  it("keeps PO/inventory/users/net-terms available as native Supabase modules regardless of Express env", () => {
    stubHealthySupabase();
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "");
    vi.stubEnv("JWT_SECRET", "");

    const health = resolveAdminHealth();
    expect(EXPRESS_ADMIN_MODULE_IDS).toHaveLength(0);
    expect(getAdminModuleAvailability(health, "purchase-orders").available).toBe(true);
    expect(getAdminModuleAvailability(health, "inventory").available).toBe(true);
    expect(getAdminModuleAvailability(health, "users").available).toBe(true);
    expect(getAdminModuleAvailability(health, "net-terms").available).toBe(true);
    expect(EXPRESS_BRIDGE_ACTION_MODULE_IDS).toContain("orders");
  });

  it("never includes secret values or legacy Express env names in the health summary", () => {
    stubHealthySupabase();
    vi.stubEnv("JWT_SECRET", "super-secret-value-should-not-appear");
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "http://localhost:3004");

    const health = resolveAdminHealth();
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain("super-secret-value-should-not-appear");
    expect(serialized).not.toContain("JWT_SECRET");
    expect(serialized).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("sanitizes runtime errors that mention env configuration", () => {
    const msg = sanitizeExpressModuleRuntimeError(
      "JWT_SECRET is not configured on the storefront server",
      503,
    );
    expect(msg).not.toContain("JWT_SECRET");
    expect(msg).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("getAdminHealthShellDisplay maps the three severity tiers", () => {
    expect(
      getAdminHealthShellDisplay({ status: "healthy", severity: "info", issues: [] }).pillLabel,
    ).toBe("All core systems healthy");

    expect(
      getAdminHealthShellDisplay({
        status: "unavailable",
        severity: "warning",
        issues: [
          {
            id: "order-fulfillment-paused",
            integrationId: "order_fulfillment",
            status: "unavailable",
            severity: "warning",
            title: "Order fulfillment actions are paused",
            message: "Intentionally disabled pending native migration.",
            moduleIds: ["orders"],
          },
        ],
      }).pillLabel,
    ).toBe("Operating with limits");

    expect(
      getAdminHealthShellDisplay({
        status: "production_blocking",
        severity: "critical",
        issues: [
          {
            id: "supabase-missing",
            integrationId: "supabase",
            status: "production_blocking",
            severity: "critical",
            title: "Database not fully configured",
            message: "Supabase credentials are required.",
            moduleIds: ["dashboard"],
          },
        ],
      }).pillLabel,
    ).toBe("Action required");
  });
});

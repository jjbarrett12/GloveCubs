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

  it("marks no admin module pages unavailable when JWT_SECRET is missing", () => {
    stubHealthySupabase();
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "http://localhost:3004");
    vi.stubEnv("JWT_SECRET", "");

    const health = resolveAdminHealth();
    expect(EXPRESS_ADMIN_MODULE_IDS).toHaveLength(0);
    expect(getAdminModuleAvailability(health, "purchase-orders").available).toBe(true);
    expect(getAdminModuleAvailability(health, "inventory").available).toBe(true);
    expect(getAdminModuleAvailability(health, "users").available).toBe(true);
    expect(getAdminModuleAvailability(health, "net-terms").available).toBe(true);
  });

  it("keeps purchase orders available when Express env is missing", () => {
    stubHealthySupabase();
    vi.stubEnv("JWT_SECRET", "test-secret-for-bridge-only");
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "");

    const health = resolveAdminHealth();
    expect(getAdminModuleAvailability(health, "purchase-orders").available).toBe(true);
    expect(getAdminModuleAvailability(health, "inventory").available).toBe(true);
    expect(EXPRESS_BRIDGE_ACTION_MODULE_IDS).toContain("orders");
  });

  it("treats production missing Express bridge as production_blocking for order actions scope only", () => {
    stubHealthySupabase();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "");

    const health = resolveAdminHealth();
    expect(health.isProduction).toBe(true);
    expect(getAdminModuleAvailability(health, "purchase-orders").available).toBe(true);
    expect(getAdminModuleAvailability(health, "orders").available).toBe(true);
    const expressIssue = health.issues.find((i) => i.integrationId === "express_jwt_signing");
    expect(expressIssue?.moduleIds).toEqual(["orders"]);
  });

  it("never includes secret values in the health summary", () => {
    stubHealthySupabase();
    vi.stubEnv("JWT_SECRET", "super-secret-value-should-not-appear");
    vi.stubEnv("NEXT_PUBLIC_GLOVECUBS_API", "http://localhost:3004");

    const health = resolveAdminHealth();
    const serialized = JSON.stringify(health);
    expect(serialized).not.toContain("super-secret-value-should-not-appear");
  });

  it("sanitizes runtime errors that mention env configuration", () => {
    const msg = sanitizeExpressModuleRuntimeError(
      "JWT_SECRET is not configured on the storefront server",
      503,
    );
    expect(msg).not.toContain("JWT_SECRET");
    expect(msg).not.toContain("NEXT_PUBLIC_GLOVECUBS_API");
  });

  it("getAdminHealthShellDisplay labels healthy vs issues", () => {
    const healthy = getAdminHealthShellDisplay({ status: "healthy", severity: "info", issues: [] });
    expect(healthy.pillLabel).toBe("All systems");
    expect(healthy.showStrip).toBe(false);

    const issues = getAdminHealthShellDisplay({
      status: "setup_required",
      severity: "warning",
      issues: [
        {
          id: "x",
          integrationId: "express_jwt_signing",
          status: "setup_required",
          severity: "warning",
          title: "Express JWT signing not configured",
          message: "Order fulfillment actions cannot authenticate.",
          moduleIds: ["orders"],
        },
      ],
    });
    expect(issues.pillLabel).toBe("1 issue");
    expect(issues.showStrip).toBe(true);
  });
});

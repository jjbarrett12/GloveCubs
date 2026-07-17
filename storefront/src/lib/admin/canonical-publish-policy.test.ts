import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  CATALOGOS_CANONICAL_PUBLISH_MESSAGE,
  catalogosPublishDashboardUrl,
  evaluateStorefrontManualActivePublishGuard,
  isEmergencyStorefrontActivePublishEnabled,
  isStorefrontManualActivePublishAllowed,
  URL_IMPORT_CATALOGOS_PUBLISH_REQUIRED_MESSAGE,
} from "@/lib/admin/canonical-publish-policy";

describe("canonical publish policy", () => {
  const prevEmergency = process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevEmergency === undefined) delete process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH;
    else process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH = prevEmergency;
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("blocks storefront active publish on production by default", () => {
    delete process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH;
    process.env.NODE_ENV = "production";
    expect(isStorefrontManualActivePublishAllowed()).toBe(false);
    expect(evaluateStorefrontManualActivePublishGuard("active")).toBe(CATALOGOS_CANONICAL_PUBLISH_MESSAGE);
    expect(evaluateStorefrontManualActivePublishGuard("draft")).toBeNull();
  });

  it("allows storefront active publish in local development", () => {
    delete process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH;
    process.env.NODE_ENV = "development";
    expect(isStorefrontManualActivePublishAllowed()).toBe(true);
    expect(evaluateStorefrontManualActivePublishGuard("active")).toBeNull();
  });

  it("allows emergency storefront active publish when flag enabled", () => {
    process.env.NODE_ENV = "production";
    process.env.GLOVECUBS_EMERGENCY_STOREFRONT_ACTIVE_PUBLISH = "1";
    expect(isEmergencyStorefrontActivePublishEnabled()).toBe(true);
    expect(evaluateStorefrontManualActivePublishGuard("active")).toBeNull();
  });

  it("builds CatalogOS publish dashboard URL", () => {
    expect(catalogosPublishDashboardUrl("https://catalog.example.com/")).toBe(
      "https://catalog.example.com/dashboard/publish"
    );
  });

  it("documents URL-import CatalogOS requirement message", () => {
    expect(URL_IMPORT_CATALOGOS_PUBLISH_REQUIRED_MESSAGE).toContain("CatalogOS");
    expect(URL_IMPORT_CATALOGOS_PUBLISH_REQUIRED_MESSAGE).toContain("runPublish");
  });
});

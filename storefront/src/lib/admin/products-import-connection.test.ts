import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";

describe("computeProductsImportConnectionStatus", () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...snapshot };
  });

  afterEach(() => {
    process.env = { ...snapshot };
  });

  it("returns offline in production when CATALOGOS_INTERNAL_URL is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    delete process.env.CATALOGOS_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_CATALOGOS_URL;
    delete process.env.INTERNAL_API_KEY;
    const s = computeProductsImportConnectionStatus();
    expect(s.status).toBe("offline");
    expect(s.configured).toBe(false);
    expect(s.catalogos_url_configured).toBe(false);
    expect(s.message.toLowerCase()).toContain("ingestion offline");
  });

  it("returns online in development with dev default URL when env is unset", () => {
    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "development";
    delete process.env.CATALOGOS_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_CATALOGOS_URL;
    delete process.env.INTERNAL_API_KEY;
    const s = computeProductsImportConnectionStatus();
    expect(s.status).toBe("online");
    expect(s.configured).toBe(true);
    expect(s.using_dev_default_url).toBe(true);
    expect(s.catalogos_base_url).toBe("http://localhost:3010");
  });

  it("returns online in development when URL is set even if INTERNAL_API_KEY is unset", () => {
    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "development";
    process.env.CATALOGOS_INTERNAL_URL = "https://catalogos.example.test";
    delete process.env.INTERNAL_API_KEY;
    const s = computeProductsImportConnectionStatus();
    expect(s.status).toBe("online");
    expect(s.configured).toBe(true);
    expect(s.internal_key_configured).toBe(false);
    expect(s.production_key_safe).toBe(true);
  });

  it("returns misconfigured in production when INTERNAL_API_KEY is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    process.env.CATALOGOS_INTERNAL_URL = "https://catalogos.example.test";
    delete process.env.INTERNAL_API_KEY;
    const s = computeProductsImportConnectionStatus();
    expect(s.status).toBe("misconfigured");
    expect(s.configured).toBe(false);
    expect(s.production_key_safe).toBe(false);
  });

  it("returns misconfigured in production when INTERNAL_API_KEY is default dev key", () => {
    process.env.NODE_ENV = "production";
    process.env.CATALOGOS_INTERNAL_URL = "https://catalogos.example.test";
    process.env.INTERNAL_API_KEY = "dev-internal-key";
    const s = computeProductsImportConnectionStatus();
    expect(s.status).toBe("misconfigured");
    expect(s.configured).toBe(false);
  });
});

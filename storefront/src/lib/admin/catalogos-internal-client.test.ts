import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildCatalogosInternalUrl,
  resolveCatalogosInternalApiKey,
  resolveCatalogosInternalBaseUrl,
} from "@/lib/admin/catalogos-internal-client";

describe("catalogos-internal-client", () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...snapshot };
  });

  afterEach(() => {
    process.env = { ...snapshot };
  });

  it("buildCatalogosInternalUrl avoids double slashes", () => {
    expect(buildCatalogosInternalUrl("https://x.com/", "/api/foo")).toBe("https://x.com/api/foo");
    expect(buildCatalogosInternalUrl("https://x.com", "api/foo")).toBe("https://x.com/api/foo");
  });

  it("uses localhost default in non-production when URL env is unset", () => {
    process.env.NODE_ENV = "development";
    delete process.env.CATALOGOS_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_CATALOGOS_URL;
    const r = resolveCatalogosInternalBaseUrl();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.baseUrl).toBe("http://localhost:3010");
  });

  it("requires CATALOGOS_INTERNAL_URL in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    delete process.env.CATALOGOS_INTERNAL_URL;
    delete process.env.NEXT_PUBLIC_CATALOGOS_URL;
    const r = resolveCatalogosInternalBaseUrl();
    expect(r.ok).toBe(false);
  });

  it("refuses unsafe production INTERNAL_API_KEY", () => {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    process.env.INTERNAL_API_KEY = "dev-internal-key";
    const r = resolveCatalogosInternalApiKey();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blockedInProduction).toBe(true);
  });

  it("allows default dev key outside production", () => {
    process.env.NODE_ENV = "test";
    delete process.env.INTERNAL_API_KEY;
    const r = resolveCatalogosInternalApiKey();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.key).toBe("dev-internal-key");
  });
});

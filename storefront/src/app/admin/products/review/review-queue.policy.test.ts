import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("URL staging POST route", () => {
  it("requires platform admin and stages before optional CatalogOS probe", () => {
    const p = join(__dirname, "../../api/products/url-staging/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("resolveAdminAccess");
    expect(s).toContain("createClipboardStaging");
    expect(s).toContain("catalogos_enrichment");
    expect(s.indexOf("createClipboardStaging")).toBeLessThan(s.indexOf("probeCatalogosHealth"));
    expect(s).not.toMatch(/if\s*\([^)]*catalogos[^)]*\)\s*return/i);
  });
});

describe("URL staging dismiss route", () => {
  it("requires admin, only dismisses needs_review, updates to dismissed", () => {
    const p = join(__dirname, "../../api/products/url-staging/[stagingId]/dismiss/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain('review_status", "needs_review"');
    expect(s).toContain('"dismissed"');
    expect(s).not.toMatch(/auto.?publish|publish\(/i);
  });
});

describe("Unified ingestion promote route", () => {
  it("uses staging_variant_id and confirm_awaiting_human", () => {
    const p = join(
      __dirname,
      "../../api/products/ingestion/staging/[stagingVariantId]/promote/route.ts"
    );
    const s = readFileSync(p, "utf8");
    expect(s).toContain("promoteUnifiedStagingVariant");
    expect(s).toContain("confirm_awaiting_human");
    expect(s).not.toContain("catalogos.products");
    expect(s).not.toMatch(/status:\s*[\"']active[\"']/);
  });
});

describe("Unified ingestion dismiss route", () => {
  it("does not delete evidence", () => {
    const p = join(
      __dirname,
      "../../api/products/ingestion/staging/[stagingVariantId]/dismiss/route.ts"
    );
    const s = readFileSync(p, "utf8");
    expect(s).toContain("dismissUnifiedStagingVariant");
    expect(s).not.toContain("ingestion_field_evidence");
    expect(s).not.toMatch(/\.delete\(/);
  });
});

describe("Admin products review page", () => {
  it("uses unified queue when flag enabled", () => {
    const p = join(__dirname, "page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("isUnifiedReviewQueueEnabled");
    expect(s).toContain("listUnifiedReviewQueue");
    expect(s).toContain("useUnifiedQueue");
  });

  it("falls back to clipboard when unified flag off", () => {
    const p = join(__dirname, "page.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("listClipboardStaging");
  });
});

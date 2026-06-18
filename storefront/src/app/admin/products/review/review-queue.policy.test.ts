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
  it("requires admin and dismisses needs_review via removeClipboardStagingImport", () => {
    const p = join(__dirname, "../../api/products/url-staging/[stagingId]/dismiss/route.ts");
    const lib = join(__dirname, "../../../../lib/admin/clipboard-url-staging.ts");
    const route = readFileSync(p, "utf8");
    const helper = readFileSync(lib, "utf8");
    expect(route).toContain("getAdminUser");
    expect(route).toContain("removeClipboardStagingImport");
    expect(helper).toContain('review_status", "needs_review"');
    expect(helper).toContain('"dismissed"');
    expect(route).not.toMatch(/auto.?publish|publish\(/i);
  });
});

describe("URL staging delete-draft route", () => {
  it("requires admin, only deletes converted drafts, does not publish", () => {
    const p = join(__dirname, "../../api/products/url-staging/[stagingId]/delete-draft/route.ts");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("getAdminUser");
    expect(s).toContain("discardClipboardStagingDraft");
    expect(s).not.toMatch(/auto.?publish|publish\(/i);
    expect(s).not.toMatch(/status:\s*[\"']active[\"']/);
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
    expect(s).toContain("loadAdminProductsReviewPageData");
    expect(s).toContain("useUnifiedQueue");
    expect(s).toContain("CatalogOS URL import batch");
  });

  it("does not pass server functions into the client review queue", () => {
    const page = readFileSync(join(__dirname, "page.tsx"), "utf8");
    const client = readFileSync(join(__dirname, "_components/ProductReviewQueueClient.tsx"), "utf8");
    expect(page).not.toMatch(/modeLabel=\{/);
    expect(client).toContain('from "@/lib/unified-ingestion/labels"');
  });

  it("labels CatalogOS runPublish as canonical publish path", () => {
    const page = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(page).toContain("Canonical publish");
    expect(page).toContain("runPublish");
  });
});

describe("ProductReviewQueueClient CatalogOS handoff", () => {
  const client = join(__dirname, "_components/ProductReviewQueueClient.tsx");
  const promoteRoute = join(
    __dirname,
    "../../api/products/ingestion/staging/[stagingVariantId]/promote/route.ts"
  );
  const promoteLib = join(__dirname, "../../../../lib/admin/unified-ingestion-promote.ts");
  const guards = join(__dirname, "../../../../lib/admin/unified-ingestion-promote-guards.ts");

  it("guides URL-import rows to CatalogOS instead of storefront promote", () => {
    const s = readFileSync(client, "utf8");
    expect(s).toContain("isCatalogosUrlImportUnifiedRow");
    expect(s).toContain("reviewed and published in CatalogOS");
    expect(s).toContain("catalogosHandoff");
    expect(s).not.toMatch(/\brunPublish\b/i);
  });

  it("unified promote API blocks CatalogOS URL import lineage", () => {
    const route = readFileSync(promoteRoute, "utf8");
    const lib = readFileSync(promoteLib, "utf8");
    const guardSrc = readFileSync(guards, "utf8");
    expect(route).toContain("promoteUnifiedStagingVariant");
    expect(lib).toContain("parseIngestionJobLineage");
    expect(lib).toContain("catalogosUrlImportJobId");
    expect(guardSrc).toContain("CatalogOS URL import rows must be reviewed and published in CatalogOS");
    expect(route).not.toMatch(/\brunPublish\b/i);
    expect(route).not.toMatch(/status:\s*[\"']active[\"']/);
  });
});

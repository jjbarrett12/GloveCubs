import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAdminContaminationCountMeta,
  countExcludingLikelyTest,
  countFlaggedForAdminVisibility,
  filterLikelyTestRows,
  isLikelyTestData,
  shouldExcludeFromAdminKpi,
  sumExcludedFromMetrics,
  sumFlaggedVisibleFromRows,
} from "./contamination-filters";

describe("admin contamination KPI suppression", () => {
  it("excludes contaminated users from KPI counts", () => {
    const rows = [
      { email: "demo@company.com", company_name: "Demo Co" },
      { email: "buyer@realfacility.com", company_name: "Real Facility" },
    ];
    const meta = buildAdminContaminationCountMeta(rows, "user", 2);
    expect(meta.total_count).toBe(2);
    expect(meta.excluded_test_count).toBe(1);
    expect(meta.trusted_count).toBe(1);
    expect(meta.scan_complete).toBe(true);
  });

  it("excludes contaminated quote requests from KPI counts", () => {
    const rows = [
      { email: "loadtest+1@glovecubs-test.com", company_name: "LoadTest Company abc" },
      { email: "procurement@hospital.org", company_name: "Regional Hospital" },
    ];
    const meta = buildAdminContaminationCountMeta(rows, "quote_request", 2);
    expect(meta.excluded_test_count).toBe(1);
    expect(meta.trusted_count).toBe(1);
  });

  it("excludes demo companies from KPI counts", () => {
    const rows = [
      { trade_name: "Demo Company Inc", legal_name: "Demo Company Inc" },
      { trade_name: "Bear Facility Supply", legal_name: "Bear Facility Supply LLC" },
    ];
    expect(shouldExcludeFromAdminKpi(rows[0], "company")).toBe(true);
    expect(shouldExcludeFromAdminKpi(rows[1], "company")).toBe(false);
    const meta = buildAdminContaminationCountMeta(rows, "company", 2);
    expect(meta.trusted_count).toBe(1);
  });

  it("excludes demo catalog products from KPI counts", () => {
    const rows = [
      { slug: "demo-product-1", product_type_code: "gc_demo_gloves" },
      { slug: "nitrile-exam-blue", product_type_code: "nitrile_gloves" },
    ];
    const meta = buildAdminContaminationCountMeta(rows, "catalog_product", 2);
    expect(meta.excluded_test_count).toBe(1);
    expect(meta.trusted_count).toBe(1);
  });

  it("preserves legitimate records in trusted counts", () => {
    const rows = [
      { email: "ops@acme.com", company_name: "Acme Industrial" },
      { email: "buyer@health.org", company_name: "Health Org" },
      { trade_name: "Acme Industrial", slug: "acme-industrial" },
    ];
    expect(filterLikelyTestRows(rows.slice(0, 2), "quote_request")).toHaveLength(2);
    expect(countExcludingLikelyTest(rows.slice(0, 2), "quote_request").included).toBe(2);
    expect(shouldExcludeFromAdminKpi(rows[2], "company")).toBe(false);
  });

  it("does not exclude medium-confidence GLV seed SKUs from KPI (manual review)", () => {
    const row = { sku: "GLV-GL-N105FX", image_url: "https://cdn.example.com/glove.jpg" };
    expect(isLikelyTestData(row, "product")).toBe(true);
    expect(shouldExcludeFromAdminKpi(row, "product")).toBe(false);
  });

  it("sums excluded counts across metrics", () => {
    const a = buildAdminContaminationCountMeta([{ email: "demo@company.com" }], "user", 1);
    const b = buildAdminContaminationCountMeta([{ slug: "demo-product-2" }], "catalog_product", 1);
    expect(sumExcludedFromMetrics(a, b)).toBe(2);
  });

  it("marks partial scan when sample is smaller than head count", () => {
    const rows = [{ email: "demo@company.com" }];
    const meta = buildAdminContaminationCountMeta(rows, "user", 100);
    expect(meta.scan_complete).toBe(false);
    expect(meta.excluded_test_count).toBe(1);
    expect(meta.trusted_count).toBe(99);
  });

  it("flags matrix @test.local quotes and test-product catalog rows", () => {
    expect(shouldExcludeFromAdminKpi({ email: "matrix3@test.local", contact_name: "Matrix Test" }, "quote_request")).toBe(true);
    expect(shouldExcludeFromAdminKpi({ slug: "test-product", name: "Test Product" }, "catalog_product")).toBe(true);
  });

  it("flags legacy matrix orders for KPI but not when payment signals present", () => {
    expect(shouldExcludeFromAdminKpi({ order_number: "MATRIX-R6-1", company_slug: "legacy-no-company-backfill" }, "order")).toBe(true);
    expect(
      shouldExcludeFromAdminKpi({ order_number: "MATRIX-R6-1", stripe_payment_intent_id: "pi_live_123" }, "order")
    ).toBe(false);
  });

  it("aligns banner flaggedVisibleTotal with strict report including suppliers", () => {
    const flagged = sumFlaggedVisibleFromRows([
      { rows: [{ email: "matrix3@test.local" }], entityType: "quote_request" },
      { rows: [{ slug: "sample-supplier", name: "Sample Supplier" }], entityType: "supplier" },
      { rows: [{ order_number: "LEGACY-1" }], entityType: "order" },
    ]);
    expect(flagged).toBeGreaterThanOrEqual(3);
  });
});

describe("admin contamination — no public surface", () => {
  it("contamination notice is only imported under admin app routes", () => {
    const adminPage = readFileSync(join(__dirname, "../../app/admin/page.tsx"), "utf8");
    expect(adminPage).toContain("ContaminationExclusionNotice");
    const analyticsPage = readFileSync(join(__dirname, "../../app/admin/analytics/page.tsx"), "utf8");
    expect(analyticsPage).toContain("ContaminationExclusionNotice");
  });

  it("storefront public layout does not reference contamination exclusion notice", () => {
    const layout = readFileSync(join(__dirname, "../../app/layout.tsx"), "utf8");
    expect(layout).not.toContain("ContaminationExclusionNotice");
    expect(layout).not.toContain("contamination-filters");
  });
});

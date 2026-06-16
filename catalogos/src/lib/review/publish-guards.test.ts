import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/review/data", () => ({
  getStagingById: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSupabase: vi.fn(() => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
          neq: () => ({ data: [] }),
        }),
        maybeSingle: async () => ({ data: null }),
      }),
    }),
  })),
}));

import { getStagingById } from "@/lib/review/data";
import { evaluatePublishReadiness } from "./publish-guards";

const disposableAttrs = {
  category: "disposable_gloves",
  material: "nitrile",
  size: "m",
  color: "blue",
  brand: "Acme",
  packaging: "box_100_ct",
  powder: "powder_free",
  grade: "industrial_grade",
};

const commerceStagingNd = {
  boxes_per_case: 10,
  gloves_per_box: 100,
  total_gloves_per_case: 1000,
  supplier_cost: 10,
  supplier_sku: "GLV-GL-N125M",
  sku_proposals: {
    schema_version: 1,
    proposed_parent_sku: "GLV-GL-N125",
    parent_confidence: 0.95,
    parent_source: "test",
    parent_warnings: [],
    applied_parent_sku: "GLV-GL-N125",
    applied_variant_skus: { M: "GLV-GL-N125M" },
    variants: [
      {
        size_code: "M",
        manufacturer_sku: "GL-N125F-M",
        proposed_glovecubs_sku: "GLV-GL-N125M",
        confidence: 0.95,
        source: "test",
        warnings: [],
      },
    ],
    warnings: [],
  },
};

describe("evaluatePublishReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks when staged row missing", async () => {
    vi.mocked(getStagingById).mockResolvedValue(null);
    const r = await evaluatePublishReadiness("n1");
    expect(r.canPublish).toBe(false);
    expect(r.blockers.some((b) => /not found/i.test(b))).toBe(true);
  });

  it("blocks when status is pending", async () => {
    vi.mocked(getStagingById).mockResolvedValue({
      status: "pending",
      master_product_id: "m1",
      supplier_id: "s1",
      raw_id: "r1",
      normalized_data: {
        name: "Gloves",
        category_slug: "disposable_gloves",
        pricing: { sell_unit: "case", normalized_case_cost: 10 },
        ...commerceStagingNd,
      },
      attributes: disposableAttrs,
    });
    const r = await evaluatePublishReadiness("n1");
    expect(r.canPublish).toBe(false);
    expect(r.blockers.some((b) => /approved or merged/i.test(b))).toBe(true);
  });

  it("blocks when master_product_id missing", async () => {
    vi.mocked(getStagingById).mockResolvedValue({
      status: "approved",
      master_product_id: null,
      supplier_id: "s1",
      raw_id: "r1",
      normalized_data: {
        name: "Gloves",
        category_slug: "disposable_gloves",
        pricing: { sell_unit: "case", normalized_case_cost: 10 },
        ...commerceStagingNd,
      },
      attributes: disposableAttrs,
    });
    const r = await evaluatePublishReadiness("n1");
    expect(r.canPublish).toBe(false);
    expect(r.blockers.some((b) => /master/i.test(b))).toBe(true);
  });

  it("blocks when units_per_case missing from commerce packaging", async () => {
    vi.mocked(getStagingById).mockResolvedValue({
      status: "approved",
      master_product_id: "m1",
      supplier_id: "s1",
      raw_id: "r1",
      normalized_data: {
        name: "Gloves",
        category_slug: "disposable_gloves",
        pricing: { sell_unit: "case", normalized_case_cost: 10 },
      },
      attributes: disposableAttrs,
    });
    const r = await evaluatePublishReadiness("n1");
    expect(r.canPublish).toBe(false);
    expect(r.blockers.some((b) => /units per case/i.test(b))).toBe(true);
  });

  it("passes for approved row with full attrs and case cost", async () => {
    vi.mocked(getStagingById).mockResolvedValue({
      status: "approved",
      master_product_id: "m1",
      supplier_id: "s1",
      raw_id: "r1",
      normalized_data: {
        name: "Gloves",
        category_slug: "disposable_gloves",
        pricing: { sell_unit: "case", normalized_case_cost: 10 },
        ...commerceStagingNd,
      },
      attributes: disposableAttrs,
    });
    const r = await evaluatePublishReadiness("n1");
    expect(r.canPublish).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.categorySlug).toBe("disposable_gloves");
    expect(r.categoryRequirementsEnforced).toBe(true);
    expect(r.blockerSections.workflow).toHaveLength(0);
  });

  it("warns when category slug is not an implemented product type", async () => {
    vi.mocked(getStagingById).mockResolvedValue({
      status: "approved",
      master_product_id: "m1",
      supplier_id: "s1",
      raw_id: "r1",
      normalized_data: {
        name: "Gloves",
        category_slug: "legacy_other_type",
        pricing: { sell_unit: "case", normalized_case_cost: 10 },
        ...commerceStagingNd,
      },
      attributes: { ...disposableAttrs, category: "legacy_other_type" },
    });
    const r = await evaluatePublishReadiness("n1");
    expect(r.canPublish).toBe(true);
    expect(r.categoryRequirementsEnforced).toBe(false);
    expect(r.warnings.some((w) => /No attribute requirements enforced/i.test(w))).toBe(true);
  });

  it("blocks when validation_errors present", async () => {
    vi.mocked(getStagingById).mockResolvedValue({
      status: "approved",
      master_product_id: "m1",
      supplier_id: "s1",
      raw_id: "r1",
      normalized_data: {
        name: "Gloves",
        category_slug: "disposable_gloves",
        pricing: { sell_unit: "case", normalized_case_cost: 10 },
        ...commerceStagingNd,
        validation_errors: [{ code: "x" }],
      },
      attributes: disposableAttrs,
    });
    const r = await evaluatePublishReadiness("n1");
    expect(r.canPublish).toBe(false);
    expect(r.blockers.some((b) => /validation_errors/i.test(b))).toBe(true);
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import type { ProductWriteInput } from "@/lib/admin/product-write";
import {
  buildManualSupplierOfferRow,
  resolveManualCasePricing,
  resolveManualPublishSupplierId,
  resolveManualSupplierSku,
  runManualPostActiveSideEffects,
  shouldRunManualPostActiveSideEffects,
} from "@/lib/admin/product-write-manual-post-active";
import * as snapshotModule from "@/lib/admin/product-attributes-json-snapshot";

const commercePackaging = normalizeCommercePackaging(
  {
    units_per_case: 1000,
    case_price: 42,
    inner_unit_type: "box",
    units_per_inner: 100,
    inners_per_case: 10,
    unit_noun: "gloves",
  },
  "disposable_gloves"
);

function activeInput(overrides: Partial<ProductWriteInput> = {}): ProductWriteInput {
  return {
    name: "Nitrile Glove",
    brandName: "Acme",
    categoryId: "cat-1",
    description: "",
    primaryImageUrl: "https://example.com/img.jpg",
    status: "active",
    quoteOnly: true,
    variants: [{ sizeCode: "M", variantSku: "GLV-ACME-M", listPrice: "" }],
    attributes: { color: "blue_violet" },
    commercePackaging,
    ...overrides,
  };
}

describe("shouldRunManualPostActiveSideEffects", () => {
  it("does not run for draft saves", () => {
    expect(shouldRunManualPostActiveSideEffects({}, "draft")).toBe(false);
  });

  it("runs for URL-import metadata after admin review", () => {
    expect(
      shouldRunManualPostActiveSideEffects({ import_staging_id: "st-1" }, "active")
    ).toBe(true);
  });

  it("does not run when importStagingId is set", () => {
    expect(shouldRunManualPostActiveSideEffects({}, "active", "st-1")).toBe(false);
  });

  it("runs for manual active products", () => {
    expect(shouldRunManualPostActiveSideEffects({ category_id: "cat-1" }, "active")).toBe(true);
  });
});

describe("runManualPostActiveSideEffects", () => {
  beforeEach(() => {
    vi.spyOn(snapshotModule, "refreshProductAttributesJsonSnapshot").mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when snapshot refresh fails", async () => {
    vi.mocked(snapshotModule.refreshProductAttributesJsonSnapshot).mockResolvedValue({
      ok: false,
      message: "snapshot failed",
    });

    const result = await runManualPostActiveSideEffects({
      supabase: {},
      productId: "prod-1",
      input: activeInput(),
      metadata: {},
      internalSku: "GC-ABC123",
      productName: "Nitrile Glove",
    });

    expect(result).toEqual({ ok: false, error: "Active publish blocked: snapshot failed" });
  });

  it("calls snapshot refresh for manual active publish", async () => {
    const supabase = {
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    };

    const result = await runManualPostActiveSideEffects({
      supabase,
      productId: "prod-1",
      input: activeInput(),
      metadata: {},
      internalSku: "GC-ABC123",
      productName: "Nitrile Glove",
    });

    expect(snapshotModule.refreshProductAttributesJsonSnapshot).toHaveBeenCalledWith(supabase, "prod-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skipped).toContain("supplier_id_unconfigured");
    }
  });

  it("upserts supplier offer when supplier id is configured", async () => {
    const prev = process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID;
    process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      schema: vi.fn((schema: string) => ({
        from: vi.fn(() => ({
          upsert,
        })),
      })),
    };

    const result = await runManualPostActiveSideEffects({
      supabase,
      productId: "prod-1",
      input: activeInput(),
      metadata: {},
      internalSku: "GC-ABC123",
      productName: "Nitrile Glove",
    });

    process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID = prev;

    expect(result.ok).toBe(true);
    expect(upsert).toHaveBeenCalled();
    const offerCall = upsert.mock.calls.find((call) => {
      const row = call[0] as Record<string, unknown>;
      return row.product_id === "prod-1";
    });
    expect(offerCall).toBeTruthy();
  });

  it("skips supplier offer safely when supplier id is missing", async () => {
    const prev = process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID;
    delete process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID;

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      schema: vi.fn(() => ({
        from: vi.fn(() => ({ upsert })),
      })),
    };

    const result = await runManualPostActiveSideEffects({
      supabase,
      productId: "prod-1",
      input: activeInput(),
      metadata: {},
      internalSku: "GC-ABC123",
      productName: "Nitrile Glove",
    });

    process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID = prev;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skipped).toContain("supplier_id_unconfigured");
    }
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe("manual offer helpers", () => {
  it("buildManualSupplierOfferRow uses buildSupplierOfferUpsertRow normalization", () => {
    const row = buildManualSupplierOfferRow({
      supplierId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      productId: "prod-1",
      supplierSku: "GLV-ACME-M",
      casePrice: 42,
      unitsPerCase: 1000,
    });
    expect(row.supplier_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(row.cost_basis).toBe("per_case");
    expect(row.currency_code).toBe("USD");
  });

  it("resolveManualCasePricing reads commerce packaging case price", () => {
    const pricing = resolveManualCasePricing(commercePackaging);
    expect(pricing.casePrice).toBe(42);
    expect(pricing.unitsPerCase).toBe(1000);
  });

  it("resolveManualSupplierSku prefers variant sku", () => {
    expect(resolveManualSupplierSku(activeInput(), "GC-PARENT")).toBe("GLV-ACME-M");
  });

  it("resolveManualPublishSupplierId returns null when env unset", () => {
    const prev = process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID;
    delete process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID;
    expect(resolveManualPublishSupplierId()).toBeNull();
    process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID = prev;
  });
});

describe("product-write wiring policy", () => {
  it("insert/update active path delegates to manual post-active helper", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const s = readFileSync(join(__dirname, "product-write.ts"), "utf8");
    expect(s).toContain("runManualPostActiveSideEffects");
    expect(s).toContain("finalizeManualActivePublish");
    expect(s).not.toMatch(/\brunPublish\b/);
  });
});

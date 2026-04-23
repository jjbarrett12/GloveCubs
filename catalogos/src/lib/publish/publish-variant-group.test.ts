/**
 * Variant group publish: partial batch contract when a later variant's attribute sync fails.
 *
 * Expected partial behavior: earlier variants complete insert + sync + snapshot + offer + staging update;
 * a later variant can fail at sync — publish returns success: false. productIds includes every variant
 * product row already inserted in loop order (id pushed before sync), including the failed variant's id.
 * Snapshot must not run for the failed variant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as productAttributeSync from "./product-attribute-sync";
import * as productAttributesSnapshot from "./product-attributes-snapshot";
import * as dictService from "@/lib/catalogos/dictionary-service";
import * as dbClient from "@/lib/db/client";

vi.mock("./canonical-sync-service", () => ({
  finalizePublishSearchSync: vi.fn().mockResolvedValue({ ok: true, searchPublishStatus: "synced" }),
}));

vi.mock("@/lib/catalog-expansion/lifecycle", () => ({
  setLifecycleStatus: vi.fn().mockResolvedValue(undefined),
}));

const disposableAttrs = {
  category: "disposable_gloves",
  material: "nitrile",
  size: "s",
  color: "blue",
  brand: "Acme",
  packaging: "case_1000_ct",
  powder: "powder_free",
  grade: "industrial_grade",
};

function stagingRow(id: string, sku: string, size: string) {
  return {
    id,
    batch_id: "batch-1",
    raw_id: `raw-${id}`,
    supplier_id: "sup-1",
    normalized_data: {
      supplier_sku: sku,
      canonical_title: "Glove",
      category_slug: "disposable_gloves",
      normalized_case_cost: 10,
    },
    attributes: { ...disposableAttrs, size },
    inferred_base_sku: "BASE-SKU",
    inferred_size: size,
    family_group_key: "fg-1",
    grouping_confidence: 0.9,
  };
}

describe("runPublishVariantGroup partial batch contract", () => {
  beforeEach(() => {
    vi.spyOn(dictService, "getCategoryIdBySlug").mockResolvedValue("category-uuid-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("variant 1 completes snapshot; variant 2 sync errors: no snapshot for v2; returns success false", async () => {
    const { runPublishVariantGroup } = await import("./publish-variant-group");

    let insertCount = 0;
    const productsApi = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => {
            insertCount += 1;
            const id = insertCount === 1 ? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
            return { data: { id }, error: null };
          }),
        })),
      })),
    };

    let supplierNormalizedFromCount = 0;
    const supabaseMock = {
      from: vi.fn((table: string) => {
        if (table === "supplier_products_normalized") {
          supplierNormalizedFromCount += 1;
          if (supplierNormalizedFromCount === 1) {
            return {
              select: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({
                  data: [stagingRow("norm-1", "V1-SKU", "s"), stagingRow("norm-2", "V2-SKU", "m")],
                  error: null,
                }),
              })),
            };
          }
          return {
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          };
        }
        if (table === "brands") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "brand-uuid" }, error: null }),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: "brand-uuid" }, error: null }),
              })),
            })),
          };
        }
        if (table === "product_families") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: "family-uuid-1" }, error: null }),
              })),
            })),
          };
        }
        if (table === "products") return productsApi;
        if (table === "supplier_offers") {
          return { upsert: vi.fn().mockResolvedValue({ error: null }) };
        }
        if (table === "publish_events") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        if (table === "catalog_sync_item_results") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    vi.spyOn(dbClient, "getSupabaseCatalogos").mockReturnValue(supabaseMock as never);

    let syncCalls = 0;
    vi.spyOn(productAttributeSync, "syncProductAttributesFromStaged").mockImplementation(async () => {
      syncCalls += 1;
      if (syncCalls === 1) return { errors: [], synced: 8 };
      return { errors: ["size: failed"], synced: 0 };
    });

    const snapshotSpy = vi.spyOn(productAttributesSnapshot, "refreshProductAttributesJsonSnapshot").mockResolvedValue({
      ok: true,
    });

    const result = await runPublishVariantGroup({ normalizedIds: ["norm-1", "norm-2"] });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/product_attributes sync failed/);
    expect(result.error).toMatch(/V2-SKU/);
    expect(result.productIds).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(snapshotSpy).toHaveBeenCalledWith(
      supabaseMock,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    );
    expect(syncCalls).toBe(2);
  });
});

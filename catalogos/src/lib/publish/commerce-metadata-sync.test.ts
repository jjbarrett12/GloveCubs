import { describe, expect, it, vi } from "vitest";
import { applyCommercePackagingToMetadata } from "@commerce-packaging/metadata-mirror";
import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import { syncCommercePackagingToCatalogV2Metadata } from "./commerce-metadata-sync";

describe("syncCommercePackagingToCatalogV2Metadata", () => {
  it("writes metadata.commerce_packaging and legacy units_per_case", async () => {
    const cp = normalizeCommercePackaging(
      { units_per_case: 1000, inners_per_case: 10, units_per_inner: 100, inner_unit_type: "box", case_price: 42 },
      "disposable_gloves"
    );
    const nd = { commerce_packaging: cp, boxes_per_case: 10, gloves_per_box: 100 };

    let savedMeta: Record<string, unknown> | null = null;
    const admin = {
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { metadata: { existing: true } }, error: null }),
            }),
          }),
          update: (payload: { metadata: Record<string, unknown> }) => ({
            eq: async () => {
              savedMeta = payload.metadata;
              return { error: null };
            },
          }),
        }),
      }),
    };

    const result = await syncCommercePackagingToCatalogV2Metadata(admin as never, "prod-1", nd);
    expect(result.ok).toBe(true);
    expect(savedMeta?.existing).toBe(true);
    expect(savedMeta?.units_per_case).toBe(1000);
    expect((savedMeta?.commerce_packaging as { units_per_case?: number }).units_per_case).toBe(1000);
    expect(nd.boxes_per_case).toBe(10);
  });

  it("applyCommercePackagingToMetadata preserves unrelated keys", () => {
    const meta: Record<string, unknown> = { foo: "bar" };
    const cp = normalizeCommercePackaging({ units_per_case: 72, case_price: 168 }, "reusable_work_gloves");
    applyCommercePackagingToMetadata(meta, cp);
    expect(meta.foo).toBe("bar");
  });
});

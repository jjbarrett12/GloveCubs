/**
 * Optional smoke test: PostgREST accepts product_attributes → attribute_definitions embed
 * and snapshot refresh updates catalog_v2.catalog_products.metadata.facet_attributes.
 */

import { describe, it, expect } from "vitest";
import { getSupabase, getSupabaseCatalogos } from "@/lib/db/client";
import { refreshProductAttributesJsonSnapshot } from "./product-attributes-snapshot";
import { CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID } from "./ensure-catalog-v2-link";

const hasDb =
  !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasDb)("refreshProductAttributesJsonSnapshot (integration)", () => {
  it("runs select with embed and updates v2 metadata facet snapshot for a stub product", async () => {
    const catalogos = getSupabaseCatalogos(true);
    const admin = getSupabase(true);

    const ghostProductId = crypto.randomUUID();
    await catalogos.from("product_attributes").delete().eq("product_id", ghostProductId);
    await admin.schema("catalog_v2").from("catalog_products").delete().eq("id", ghostProductId);

    const { data: cat } = await catalogos.from("categories").select("id").eq("slug", "disposable_gloves").maybeSingle();
    if (!cat || !(cat as { id: string }).id) {
      throw new Error("integration requires disposable_gloves category");
    }
    const categoryId = (cat as { id: string }).id;
    const slug = `snap-int-${Date.now()}`;
    const sku = `snap-int-${Date.now()}`;

    const { error: insProd } = await admin.schema("catalog_v2").from("catalog_products").insert({
      id: ghostProductId,
      product_type_id: CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID,
      slug,
      internal_sku: sku,
      name: "Snapshot integration stub",
      status: "draft",
      metadata: {
        category_id: categoryId,
        facet_attributes: { legacy_key: "should_be_removed_after_snapshot" },
      },
    });
    expect(insProd).toBeNull();

    const r = await refreshProductAttributesJsonSnapshot(catalogos, ghostProductId);
    expect(r).toEqual({ ok: true });

    const { data: row } = await admin.schema("catalog_v2").from("catalog_products").select("metadata").eq("id", ghostProductId).single();
    const meta = (row as { metadata: { facet_attributes?: Record<string, unknown> } }).metadata;
    expect(meta.facet_attributes ?? {}).toEqual({});

    await admin.schema("catalog_v2").from("catalog_products").delete().eq("id", ghostProductId);
  });
});

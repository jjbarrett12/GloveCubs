/**
 * Publish a variant group: one product_families row + N variant products + N supplier_offers.
 * Staging rows must share the same family_group_key and be approved for grouping.
 */

import { getSupabaseCatalogos, getSupabase } from "@/lib/db/client";
import { getCategoryIdBySlug } from "@/lib/catalogos/dictionary-service";
import { syncProductAttributesFromStaged } from "./product-attribute-sync";
import { refreshProductAttributesJsonSnapshot } from "./product-attributes-snapshot";
import { setLifecycleStatus } from "@/lib/catalog-expansion/lifecycle";
import { publishSafe, stageSafe } from "@/lib/catalogos/validation-modes";
import { finalizePublishSearchSync } from "./canonical-sync-service";
import { CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID, upsertSellableForCatalogV2Product } from "./ensure-catalog-v2-link";
import {
  buildSupplierOfferUpsertRow,
  costBasisFromSellUnit,
  unitsPerCaseFromStagingNormalizedContent,
} from "../../../../lib/supplier-offer-normalization";
import type { SearchPublishStatus } from "./types";

export interface PublishVariantGroupInput {
  normalizedIds: string[];
  publishedBy?: string;
}

export interface PublishVariantGroupResult {
  success: boolean;
  familyId?: string;
  productIds?: string[];
  error?: string;
  warnings?: string[];
  publishComplete?: boolean;
  searchPublishStatus?: SearchPublishStatus;
}

function slugFrom(sku: string, name?: string): string {
  const base = (name || sku || "product").trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getOrCreateBrandId(brandName: string): Promise<string | null> {
  if (!brandName?.trim()) return null;
  const supabase = getSupabaseCatalogos(true);
  const slug = slugFrom(brandName);
  const { data: existing } = await supabase.from("brands").select("id").eq("slug", slug).maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: inserted, error } = await supabase
    .from("brands")
    .insert({ name: brandName.trim(), slug: slug || `brand-${Date.now()}` })
    .select("id")
    .single();
  if (error) return null;
  return (inserted as { id: string }).id;
}

/** Shared attributes to store on family (exclude size; size is per variant). */
const FAMILY_ATTR_KEYS = [
  "brand",
  "material",
  "thickness_mil",
  "color",
  "powder",
  "grade",
  "packaging",
  "industries",
  "compliance_certifications",
  "texture",
  "cuff_style",
  "hand_orientation",
  "sterility",
];

function pickSharedAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of FAMILY_ATTR_KEYS) {
    if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== "") out[k] = attrs[k];
  }
  return out;
}

/**
 * Publish a group of staging rows as one family + size variants.
 * All rows must have the same family_group_key and inferred_base_sku.
 */
export async function runPublishVariantGroup(
  input: PublishVariantGroupInput
): Promise<PublishVariantGroupResult> {
  const supabase = getSupabaseCatalogos(true);
  const warnings: string[] = [];

  if (input.normalizedIds.length === 0) {
    return { success: false, error: "No normalized IDs provided" };
  }

  const { data: rows, error: fetchErr } = await supabase
    .from("supplier_products_normalized")
    .select(
      "id, batch_id, raw_id, supplier_id, normalized_data, attributes, inferred_base_sku, inferred_size, family_group_key, grouping_confidence"
    )
    .in("id", input.normalizedIds);

  if (fetchErr || !rows?.length) {
    return { success: false, error: fetchErr?.message ?? "No staging rows found" };
  }

  const first = rows[0] as {
    id: string;
    batch_id: string;
    raw_id: string;
    supplier_id: string;
    normalized_data?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    inferred_base_sku?: string | null;
    inferred_size?: string | null;
    family_group_key?: string | null;
    grouping_confidence?: number | null;
    variant_axis?: string | null;
    variant_value?: string | null;
  };

  const key = first.family_group_key;
  if (!key) {
    return { success: false, error: "Staging rows do not have a family_group_key; run family inference first" };
  }

  const baseSku = first.inferred_base_sku?.trim();
  if (!baseSku) {
    return { success: false, error: "Missing inferred_base_sku on staging rows" };
  }

  for (const r of rows as typeof first[]) {
    if (r.family_group_key !== key) {
      return { success: false, error: "All rows must share the same family_group_key" };
    }
  }

  const nd = first.normalized_data ?? {};
  const attrs = (first.attributes ?? nd.filter_attributes ?? nd) as Record<string, unknown>;
  const categorySlug = (nd.category_slug ?? attrs.category ?? "disposable_gloves") as string;
  const categoryId = await getCategoryIdBySlug(categorySlug);
  if (!categoryId) {
    return { success: false, error: `Category not found for slug: ${categorySlug}` };
  }

  const publishCheck = publishSafe(categorySlug as "disposable_gloves" | "reusable_work_gloves", attrs);
  if (!publishCheck.publishable) {
    return { success: false, error: publishCheck.error };
  }

  const brandId = attrs.brand
    ? await getOrCreateBrandId(String(attrs.brand))
    : (nd.brand ? await getOrCreateBrandId(String(nd.brand)) : null);

  const familyName = (nd.canonical_title ?? nd.name ?? baseSku) as string;
  const sharedAttrs = pickSharedAttributes(attrs);

  const { data: familyRow, error: familyErr } = await supabase
    .from("product_families")
    .insert({
      base_sku: baseSku,
      name: familyName,
      category_id: categoryId,
      brand_id: brandId,
      description: (nd.description as string) ?? null,
      attributes: sharedAttrs,
    })
    .select("id")
    .single();

  if (familyErr || !familyRow) {
    if (familyErr?.code === "23505") {
      const { data: existing } = await supabase
        .from("product_families")
        .select("id")
        .eq("base_sku", baseSku)
        .maybeSingle();
      if (existing) {
        const familyId = (existing as { id: string }).id;
        return runPublishVariantGroupAddVariants({
          familyId,
          baseSku,
          rows: rows as typeof first[],
          categoryId,
          categorySlug,
          publishedBy: input.publishedBy,
          warnings,
        });
      }
    }
    return { success: false, error: `product_families insert: ${familyErr?.message ?? "unknown"}` };
  }

  const familyId = (familyRow as { id: string }).id;
  return runPublishVariantGroupAddVariants({
    familyId,
    baseSku,
    rows: rows as typeof first[],
    categoryId,
    categorySlug,
    publishedBy: input.publishedBy,
    warnings,
  });
}

async function runPublishVariantGroupAddVariants(params: {
  familyId: string;
  baseSku: string;
  rows: Array<{
    id: string;
    batch_id: string;
    raw_id: string;
    supplier_id: string;
    normalized_data?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    inferred_base_sku?: string | null;
    inferred_size?: string | null;
    variant_axis?: string | null;
    variant_value?: string | null;
  }>;
  categoryId: string;
  categorySlug: string;
  publishedBy?: string;
  warnings: string[];
}): Promise<PublishVariantGroupResult> {
  const supabase = getSupabaseCatalogos(true);
  const admin = getSupabase(true);
  const productIds: string[] = [];

  for (const row of params.rows) {
    const nd = row.normalized_data ?? {};
    const attrs = (row.attributes ?? nd.filter_attributes ?? nd) as Record<string, unknown>;
    const variantSku = (nd.supplier_sku ?? nd.sku ?? row.id) as string;
    const variantName = (nd.canonical_title ?? nd.name ?? variantSku) as string;
    const size = row.inferred_size ?? attrs.size;
    const axis = row.variant_axis ?? "size";
    const vVal = row.variant_value;
    const variantAttrPatch: Record<string, unknown> = {};
    if (axis === "size" && size) variantAttrPatch.size = size;
    else if (axis === "color" && vVal) variantAttrPatch.color = vVal;
    else if (axis === "pack" && vVal) variantAttrPatch.case_qty = vVal;
    else if (axis === "thickness" && vVal) variantAttrPatch.thickness_mil = vVal;
    else if (size) variantAttrPatch.size = size;
    const mergedAttrs = { ...attrs, ...variantAttrPatch };

    const stageCheck = stageSafe(params.categorySlug as "disposable_gloves" | "reusable_work_gloves", mergedAttrs);
    if (stageCheck.missing_strongly_preferred.length > 0) {
      params.warnings.push(
        `Variant ${variantSku}: strongly preferred missing: ${stageCheck.missing_strongly_preferred.join(", ")}`
      );
    }

    const slug = slugFrom(variantSku, variantName);
    const { data: existingSlug } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

    const brandId = attrs.brand
      ? await getOrCreateBrandId(String(attrs.brand))
      : (nd.brand ? await getOrCreateBrandId(String(nd.brand)) : null);

    const { data: inserted, error: insertErr } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .insert({
        product_type_id: CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID,
        slug: finalSlug,
        internal_sku: variantSku,
        name: variantName,
        description: (nd.description as string) ?? null,
        brand_id: brandId,
        status: "active",
        metadata: { ...mergedAttrs, family_id: params.familyId },
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      return {
        success: false,
        familyId: params.familyId,
        productIds,
        error: `catalog_v2 insert ${variantSku}: ${insertErr?.message ?? "failed"}`,
        warnings: params.warnings.length ? params.warnings : undefined,
      };
    }

    const productId = (inserted as { id: string }).id;

    const { error: vInsErr } = await admin.schema("catalog_v2").from("catalog_variants").insert({
      catalog_product_id: productId,
      variant_sku: variantSku,
      sort_order: 0,
      is_active: true,
      metadata: {},
    });
    if (vInsErr) {
      return {
        success: false,
        familyId: params.familyId,
        productIds,
        error: `catalog_variants ${variantSku}: ${vInsErr.message}`,
        warnings: params.warnings.length ? params.warnings : undefined,
      };
    }
    productIds.push(productId);

    const { errors: attrErrors } = await syncProductAttributesFromStaged(
      productId,
      params.categoryId,
      mergedAttrs
    );
    if (attrErrors.length > 0) {
      return {
        success: false,
        familyId: params.familyId,
        productIds,
        error: `Publish blocked (variant ${variantSku}): product_attributes sync failed (${attrErrors.length} error(s)): ${attrErrors.join("; ")}`,
        warnings: params.warnings.length ? params.warnings : undefined,
      };
    }

    const snapshot = await refreshProductAttributesJsonSnapshot(supabase, productId);
    if (!snapshot.ok) {
      return {
        success: false,
        familyId: params.familyId,
        productIds,
        error: `Publish blocked (variant ${variantSku}): could not refresh product attributes snapshot (${snapshot.message}).`,
        warnings: params.warnings.length ? params.warnings : undefined,
      };
    }

    const cost = Number(nd.normalized_case_cost ?? nd.supplier_cost ?? nd.cost ?? 0);
    const costNum = Number.isFinite(cost) ? cost : 0;
    const pricingNd = nd.pricing as { sell_unit?: string } | undefined;
    const offerCostBasis = costBasisFromSellUnit(pricingNd?.sell_unit ?? "case");
    const unitsPer = unitsPerCaseFromStagingNormalizedContent(
      nd as Record<string, unknown>,
      mergedAttrs as Record<string, unknown>
    );
    const offerRow = buildSupplierOfferUpsertRow(
      {
        supplier_id: row.supplier_id,
        product_id: productId,
        supplier_sku: variantSku,
        cost: costNum,
        sell_price: Number.isFinite(cost) ? cost : null,
        raw_id: row.raw_id,
        normalized_id: row.id,
        is_active: true,
        units_per_case: unitsPer ?? null,
      },
      { currency_code: "USD", cost_basis: offerCostBasis, cost: costNum, units_per_case: unitsPer }
    );
    const { error: offerErr } = await supabase.from("supplier_offers").upsert(offerRow, {
      onConflict: "supplier_id,product_id,supplier_sku",
    });
    if (offerErr) {
      return {
        success: false,
        familyId: params.familyId,
        productIds,
        error: `Supplier offer ${variantSku}: ${offerErr.message}`,
        warnings: params.warnings.length ? params.warnings : undefined,
      };
    }

    const listPriceMinor =
      cost != null && Number.isFinite(Number(cost)) ? Math.round(Number(cost) * 100) : null;
    if (listPriceMinor == null || !Number.isFinite(listPriceMinor)) {
      return {
        success: false,
        familyId: params.familyId,
        productIds,
        error: `Publish blocked (variant ${variantSku}): sellable list price missing`,
        warnings: params.warnings.length ? params.warnings : undefined,
      };
    }
    const unitCostMinor =
      cost != null && Number.isFinite(Number(cost)) ? Math.round(Number(cost) * 100) : null;
    const sellable = await upsertSellableForCatalogV2Product(productId, {
      name: variantName,
      internalSku: variantSku,
      listPriceMinor,
      bulkPriceMinor: null,
      unitCostMinor,
      isActive: true,
    });
    if (!sellable.ok) {
      return {
        success: false,
        familyId: params.familyId,
        productIds,
        error: `Publish blocked (variant ${variantSku}): sellable — ${sellable.message}`,
        warnings: params.warnings.length ? params.warnings : undefined,
      };
    }

    await supabase.from("publish_events").insert({
      normalized_id: row.id,
      product_id: productId,
      published_by: params.publishedBy ?? null,
    });

    await supabase
      .from("supplier_products_normalized")
      .update({
        status: "approved",
        master_product_id: productId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    const { data: syncItems } = await supabase
      .from("catalog_sync_item_results")
      .select("id")
      .eq("promoted_normalized_id", row.id);
    for (const syncRow of syncItems ?? []) {
      try {
        await setLifecycleStatus(syncRow.id as string, "published", { published_product_id: productId });
      } catch {
        // non-fatal
      }
    }
  }

  const normalizedIds = params.rows.map((r) => r.id as string);
  const searchResult = await finalizePublishSearchSync({
    catalogos: supabase,
    normalizedIds,
    productIds,
  });

  if (!searchResult.ok) {
    return {
      success: false,
      familyId: params.familyId,
      productIds,
      error: `Publish not successful: live catalog was updated but storefront search is NOT synced (${searchResult.message}).`,
      warnings: params.warnings.length ? params.warnings : undefined,
      publishComplete: false,
      searchPublishStatus: searchResult.searchPublishStatus,
    };
  }

  return {
    success: true,
    familyId: params.familyId,
    productIds,
    warnings: params.warnings.length ? params.warnings : undefined,
    publishComplete: true,
    searchPublishStatus: searchResult.searchPublishStatus,
  };
}

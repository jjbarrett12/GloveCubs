/**
 * Publish pipeline: approved staged product → live master product + product_attributes + supplier_offer + publish_event.
 * Idempotent: re-publish updates existing product/offer; no duplicate attribute rows or offers.
 * Fails clearly when required attributes (per dictionary) are missing.
 *
 * Product rows are catalog_v2.catalog_products only — no catalogos.products listing.
 */

import { getSupabaseCatalogos, getSupabase } from "@/lib/db/client";
import { syncProductAttributesFromStaged } from "./product-attribute-sync";
import { refreshProductAttributesJsonSnapshot } from "./product-attributes-snapshot";
import { setLifecycleStatus } from "@/lib/catalog-expansion/lifecycle";
import { publishSafe, stageSafe } from "@/lib/catalogos/validation-modes";
import type { CategorySlug } from "@/lib/catalogos/attribute-dictionary-types";
import { DEFAULT_PRODUCT_TYPE_KEY } from "@/lib/product-types";
import type { PublishInput, PublishResult } from "./types";
import { finalizePublishSearchSync } from "./canonical-sync-service";
import { CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID, upsertSellableForCatalogV2Product } from "./ensure-catalog-v2-link";
import {
  buildSupplierOfferUpsertRow,
  costBasisFromSellUnit,
  unitsPerCaseFromStagingNormalizedContent,
} from "../../../../lib/supplier-offer-normalization";
import {
  extractSizeCodeFromFilterAttributes,
  isGloveCategorySlug,
  omitSizeFromProductAttributesFilter,
  upsertCatalogVariantFromGloveIngest,
  validatePurchaseItemNumber,
} from "./catalog-variant-ingest";

function firstNonEmptyTrimmedString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return undefined;
}

/** Staged UPC/GTIN/EAN/barcode → catalog_variants.gtin (first non-empty wins). */
function extractStagedVariantGtin(content: Record<string, unknown>, attrs: Record<string, unknown>): string | undefined {
  return firstNonEmptyTrimmedString(
    content.upc,
    content.gtin,
    content.ean,
    content.barcode,
    attrs.upc,
    attrs.gtin,
    attrs.ean,
    attrs.barcode
  );
}

/** Staged MPN → catalog_variants.mpn (column is `mpn`; no separate manufacturer_item_number in schema). */
function extractStagedVariantMpn(content: Record<string, unknown>, attrs: Record<string, unknown>): string | undefined {
  return firstNonEmptyTrimmedString(
    content.manufacturer_part_number,
    content.mpn,
    attrs.manufacturer_part_number,
    attrs.mpn
  );
}

/**
 * Build PublishInput from a normalized row (from getStagingById).
 * Use when integrating publish into review approval flow.
 */
export function buildPublishInputFromStaged(
  normalizedId: string,
  row: {
    normalized_data?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    supplier_id?: string;
    raw_id?: string;
    master_product_id?: string | null;
  },
  options: {
    masterProductId?: string;
    newProductPayload?: PublishInput["newProductPayload"];
    publishedBy?: string;
  }
): PublishInput | null {
  const nd = row.normalized_data ?? {};
  const attrs = row.attributes ?? (nd.filter_attributes as Record<string, unknown>) ?? {};
  const supplierId = row.supplier_id;
  const rawId = row.raw_id;
  if (!supplierId || !rawId) return null;
  const content = nd as Record<string, unknown>;
  const pricing = content.pricing as { sell_unit?: string; normalized_case_cost?: number | null } | undefined;
  const normalizedCaseCost = content.normalized_case_cost ?? pricing?.normalized_case_cost;
  const cost = Number(normalizedCaseCost ?? content.supplier_cost ?? content.cost ?? 0);
  const sellUnit = pricing?.sell_unit ?? "case";
  const offerCostBasis = costBasisFromSellUnit(sellUnit);
  const unitsPerCase = unitsPerCaseFromStagingNormalizedContent(content, attrs);
  const pricingCaseCostUnavailable =
    sellUnit === "case" &&
    (normalizedCaseCost == null || !Number.isFinite(Number(normalizedCaseCost)));
  const stagedGtin = extractStagedVariantGtin(content, attrs);
  const stagedMpn = extractStagedVariantMpn(content, attrs);
  return {
    normalizedId,
    masterProductId: options.masterProductId ?? (row.master_product_id as string | undefined),
    newProductPayload: options.newProductPayload,
    stagedContent: {
      canonical_title: (content.canonical_title ?? content.name) as string,
      supplier_sku: (content.supplier_sku ?? content.sku ?? "") as string,
      supplier_cost: Number.isFinite(cost) ? cost : 0,
      units_per_case: unitsPerCase ?? null,
      offer_cost_basis: offerCostBasis,
      brand: (content.brand ?? attrs.brand) as string | undefined,
      description: content.description as string | undefined,
      images: Array.isArray(content.images) ? (content.images as string[]) : undefined,
      ...(stagedGtin ? { gtin: stagedGtin } : {}),
      ...(stagedMpn ? { mpn: stagedMpn } : {}),
    },
    stagedFilterAttributes: attrs,
    categorySlug: (content.category_slug ?? attrs.category ?? DEFAULT_PRODUCT_TYPE_KEY) as string,
    supplierId,
    rawId,
    overrideSellPrice: (content.override_sell_price as number | null) ?? null,
    pricingCaseCostUnavailable: pricingCaseCostUnavailable || undefined,
    publishedBy: options.publishedBy,
  };
}

function slugFrom(sku: string, name?: string): string {
  const base = (name || sku || "product").trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Ensure brand exists; return brand_id. Creates brand by name if missing.
 */
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

/**
 * Run full publish: create/update product, sync attributes, upsert offer, record event.
 * Uses publish_safe: blocks when required attributes are missing or invalid.
 */
export async function runPublish(input: PublishInput): Promise<PublishResult> {
  const warnings: string[] = [];

  if (input.pricingCaseCostUnavailable) {
    return {
      success: false,
      error:
        "Cannot publish: GloveCubs sells by the case only. Normalized case cost could not be computed (missing or invalid packaging/conversion data). Add case_qty, boxes_per_case, or other conversion data in the feed, or fix pricing basis.",
    };
  }

  const supabase = getSupabaseCatalogos(true);
  const admin = getSupabase(true);
  const categorySlug = (input.categorySlug ?? DEFAULT_PRODUCT_TYPE_KEY) as CategorySlug;
  const stagedAttrs = input.stagedFilterAttributes ?? {};
  const attrsForProductAttributes = omitSizeFromProductAttributesFilter(stagedAttrs);

  const publishCheck = publishSafe(categorySlug, attrsForProductAttributes);
  if (!publishCheck.publishable) {
    return { success: false, error: publishCheck.error };
  }
  const stageCheck = stageSafe(categorySlug, attrsForProductAttributes);
  if (stageCheck.missing_strongly_preferred.length > 0) {
    warnings.push(`Strongly preferred attributes missing (non-blocking): ${stageCheck.missing_strongly_preferred.join(", ")}`);
  }

  let gloveIngestSize: string | null = null;
  if (isGloveCategorySlug(categorySlug)) {
    const skuRes = validatePurchaseItemNumber(input.stagedContent.supplier_sku);
    if (!skuRes.ok) return { success: false, error: skuRes.error };
    gloveIngestSize = extractSizeCodeFromFilterAttributes(stagedAttrs);
    if (!gloveIngestSize) {
      return {
        success: false,
        error:
          "Cannot publish glove row: staged filter_attributes must include a normalized size for catalog_variants (size is not written to product_attributes).",
      };
    }
  }

  let productId: string;
  let slug: string | null = null;
  let internalSkuForSellable = "";

  if (input.masterProductId) {
    productId = input.masterProductId;
    const { data: prod, error: pe } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, internal_sku, slug, name, description, brand_id")
      .eq("id", productId)
      .single();
    if (pe || !prod) return { success: false, error: "Master catalog product not found" };
    const prodRow = prod as {
      internal_sku: string | null;
      slug: string;
      name: string;
      description: string | null;
      brand_id: string | null;
    };
    internalSkuForSellable = (prodRow.internal_sku || "").trim() || `sku-${productId.slice(0, 8)}`;
    slug = prodRow.slug ?? null;
    const name = input.stagedContent.canonical_title || prodRow.name;
    const desc = input.stagedContent.description ?? prodRow.description;
    const brandId = input.stagedContent.brand ? await getOrCreateBrandId(input.stagedContent.brand) : null;
    if (!slug) slug = slugFrom(internalSkuForSellable, name);
    const { error: updateErr } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .update({
        name: name || prodRow.name,
        description: desc ?? prodRow.description,
        brand_id: brandId ?? prodRow.brand_id,
        slug: slug || undefined,
        status: "active",
        internal_sku: internalSkuForSellable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);
    if (updateErr) return { success: false, error: `catalog_v2.catalog_products update: ${updateErr.message}` };

    if (gloveIngestSize) {
      const vr = await upsertCatalogVariantFromGloveIngest(admin, {
        catalogProductId: productId,
        sizeCode: gloveIngestSize,
        variantSku: input.stagedContent.supplier_sku,
        gtin: input.stagedContent.gtin,
        mpn: input.stagedContent.mpn,
      });
      if (!vr.ok) return { success: false, error: vr.error };
    }
  } else if (input.newProductPayload) {
    const payload = input.newProductPayload;
    const brandId = input.stagedContent.brand ? await getOrCreateBrandId(input.stagedContent.brand) : payload.brand_id ?? null;
    slug = slugFrom(payload.sku, payload.name);
    const { data: existingSlug } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existingSlug) slug = `${slug}-${Date.now().toString(36)}`;

    const { data: inserted, error: insertErr } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .insert({
        product_type_id: CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID,
        slug: slug!,
        internal_sku: payload.sku,
        name: payload.name,
        description: payload.description ?? input.stagedContent.description ?? null,
        brand_id: brandId,
        status: "active",
        metadata: {},
      })
      .select("id, internal_sku")
      .single();
    if (insertErr || !inserted) return { success: false, error: insertErr?.message ?? "catalog_v2 insert failed" };
    productId = (inserted as { id: string }).id;
    internalSkuForSellable = (inserted as { internal_sku: string | null }).internal_sku || payload.sku;

    const variantMetadata = gloveIngestSize ? { size: gloveIngestSize } : {};
    const { error: vInsErr } = await admin.schema("catalog_v2").from("catalog_variants").insert({
      catalog_product_id: productId,
      variant_sku: payload.sku,
      sort_order: 0,
      is_active: true,
      metadata: variantMetadata,
      ...(gloveIngestSize ? { size_code: gloveIngestSize } : {}),
      ...(input.stagedContent.gtin ? { gtin: input.stagedContent.gtin } : {}),
      ...(input.stagedContent.mpn ? { mpn: input.stagedContent.mpn } : {}),
    });
    if (vInsErr) return { success: false, error: `catalog_variants insert: ${vInsErr.message}` };
  } else {
    return { success: false, error: "Either masterProductId or newProductPayload is required" };
  }

  const { data: catRow } = await supabase.from("categories").select("id").eq("slug", categorySlug).maybeSingle();
  const categoryId =
    (catRow as { id?: string } | null)?.id ??
    (input.newProductPayload?.category_id as string | undefined) ??
    null;
  if (!categoryId) return { success: false, error: "Product category missing (slug lookup failed)", productId, slug: slug ?? undefined };

  const { errors: attrErrors } = await syncProductAttributesFromStaged(
    productId,
    categoryId,
    attrsForProductAttributes
  );
  if (attrErrors.length > 0) {
    return {
      success: false,
      error: `Publish blocked: product_attributes sync failed (${attrErrors.length} error(s)): ${attrErrors.join("; ")}`,
      productId,
      slug: slug ?? undefined,
    };
  }

  const snapshot = await refreshProductAttributesJsonSnapshot(supabase, productId);
  if (!snapshot.ok) {
    return {
      success: false,
      error: `Publish blocked: could not refresh product attributes snapshot (${snapshot.message}).`,
      productId,
      slug: slug ?? undefined,
    };
  }

  const sellPrice = input.overrideSellPrice ?? input.stagedContent.supplier_cost;
  const offerRow = buildSupplierOfferUpsertRow(
    {
      supplier_id: input.supplierId,
      product_id: productId,
      supplier_sku: input.stagedContent.supplier_sku,
      cost: input.stagedContent.supplier_cost,
      sell_price: Number.isFinite(sellPrice) ? sellPrice : input.stagedContent.supplier_cost,
      raw_id: input.rawId,
      normalized_id: input.normalizedId,
      is_active: true,
      units_per_case: input.stagedContent.units_per_case ?? null,
    },
    {
      currency_code: "USD",
      cost_basis: input.stagedContent.offer_cost_basis ?? "per_case",
      cost: input.stagedContent.supplier_cost,
      units_per_case: input.stagedContent.units_per_case,
    }
  );
  const { error: offerErr } = await supabase.from("supplier_offers").upsert(offerRow, {
    onConflict: "supplier_id,product_id,supplier_sku",
  });
  if (offerErr) return { success: false, error: `Supplier offer: ${offerErr.message}`, productId, slug: slug ?? undefined };

  const listPriceMinor =
    sellPrice != null && Number.isFinite(Number(sellPrice)) ? Math.round(Number(sellPrice) * 100) : null;
  if (listPriceMinor == null || !Number.isFinite(listPriceMinor)) {
    return {
      success: false,
      error: "Publish blocked: sellable list price missing (invalid sell price / supplier cost)",
      productId,
      slug: slug ?? undefined,
    };
  }
  const unitCostMinor =
    input.stagedContent.supplier_cost != null && Number.isFinite(Number(input.stagedContent.supplier_cost))
      ? Math.round(Number(input.stagedContent.supplier_cost) * 100)
      : null;

  const { data: v2row } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("name, internal_sku")
    .eq("id", productId)
    .single();
  const v2n = v2row as { name: string; internal_sku: string | null } | null;
  const sellable = await upsertSellableForCatalogV2Product(productId, {
    name: v2n?.name ?? input.stagedContent.canonical_title ?? "Product",
    internalSku: (v2n?.internal_sku || internalSkuForSellable || "sku").trim(),
    listPriceMinor,
    bulkPriceMinor: null,
    unitCostMinor,
    isActive: true,
  });
  if (!sellable.ok) {
    return {
      success: false,
      error: `Publish blocked: sellable — ${sellable.message}`,
      productId,
      slug: slug ?? undefined,
    };
  }

  const { error: eventErr } = await supabase.from("publish_events").insert({
    normalized_id: input.normalizedId,
    product_id: productId,
    published_by: input.publishedBy ?? null,
  });
  if (eventErr) warnings.push(`publish_event: ${eventErr.message}`);

  const { data: syncItems } = await supabase
    .from("catalog_sync_item_results")
    .select("id")
    .eq("promoted_normalized_id", input.normalizedId);
  for (const row of syncItems ?? []) {
    try {
      await setLifecycleStatus(row.id as string, "published", { published_product_id: productId });
    } catch {
      // non-fatal: lifecycle update best-effort
    }
  }

  const searchResult = await finalizePublishSearchSync({
    catalogos: supabase,
    normalizedIds: [input.normalizedId],
    productIds: [productId],
  });

  if (!searchResult.ok) {
    return {
      success: false,
      error: `Publish not successful: live catalog and offers were updated but storefront search is NOT synced (${searchResult.message}). Treat as failure until status is "Live & searchable" or retry succeeds. A background retry was queued; operators were alerted.`,
      productId,
      slug: slug ?? undefined,
      offerCreated: true,
      publishComplete: false,
      searchPublishStatus: searchResult.searchPublishStatus,
      warnings: warnings.length ? warnings : undefined,
    };
  }

  return {
    success: true,
    productId,
    slug: slug ?? undefined,
    offerCreated: true,
    publishComplete: true,
    searchPublishStatus: searchResult.searchPublishStatus,
    warnings: warnings.length ? warnings : undefined,
  };
}

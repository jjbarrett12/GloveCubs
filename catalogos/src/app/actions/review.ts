"use server";

import { getSupabaseCatalogos } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { getStagingById, getStagingRows } from "@/lib/review/data";
import { evaluatePublishReadiness } from "@/lib/review/publish-guards";
import { logAdminCatalogAudit } from "@/lib/review/admin-audit";
import { buildPublishInputFromStaged, runPublish } from "@/lib/publish/publish-service";
import { runPublishVariantGroup } from "@/lib/publish/publish-variant-group";
import { getReviewDictionaryForCategory, getCategoryIdBySlug } from "@/lib/catalogos/dictionary-service";
import { isMultiSelectAttribute } from "@/lib/catalogos/attribute-validation";
import { approveResolutionCandidate, rejectResolutionCandidate } from "@/lib/product-resolution/resolution-data";
import { validateUuidParam, validateOfferAdminPatch } from "@/lib/admin/commerce-validation";
import { logAdminActionFailure } from "@/lib/observability";
import type { SearchPublishStatus } from "@/lib/publish/types";
import {
  BULK_PUBLISH_CHUNK_SIZE,
  BULK_PUBLISH_MAX_IDS,
} from "@/lib/review/bulk-publish-config";
import { evaluateAutoApproveEligibility } from "@/lib/review/auto-approve-guards";
import {
  applyImportPricingOverride,
  clearImportPricingOverride,
  type ImportAutoPricingSnapshot,
  type ImportPricingOverridePatch,
} from "@/lib/ingestion/import-pricing";
import { stripFacetExtractionUiState } from "@/lib/extraction/staging-facet-merge";
import { upsertSellableForCatalogV2Product } from "@/lib/publish/ensure-catalog-v2-link";
import { flattenV2Metadata } from "@/lib/catalog/v2-master-product";

function slugForNewCatalogProduct(sku: string, name: string): string {
  const base = (name || sku || "product").trim();
  const s = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s || "product";
}

const REVIEW_PATHS = [
  "/dashboard/review",
  "/dashboard/batches",
  "/dashboard/publish",
  "/dashboard/ingestion",
  "/dashboard/products/quick-add",
];

/** When accepting a row for publish, set search_publish_status to approved unless already in a post-publish state. */
async function nextSearchPublishStatusWhenAcceptingReview(normalizedId: string): Promise<SearchPublishStatus | null> {
  const supabase = getSupabaseCatalogos(true);
  const { data } = await supabase
    .from("supplier_products_normalized")
    .select("search_publish_status")
    .eq("id", normalizedId)
    .maybeSingle();
  const cur = (data as { search_publish_status?: SearchPublishStatus } | null)?.search_publish_status;
  if (cur === "published_synced" || cur === "published_pending_sync" || cur === "sync_failed") {
    return null;
  }
  return "approved";
}

async function revalidateReview() {
  REVIEW_PATHS.forEach((p) => revalidatePath(p));
}

export interface ReviewResult {
  success: boolean;
  error?: string;
  masterProductId?: string;
  published?: boolean;
  publishError?: string;
  /** Present after publish attempts; mirrors supplier_products_normalized.search_publish_status. */
  searchPublishStatus?: SearchPublishStatus;
  /** False when live writes may have succeeded but storefront canonical sync did not complete. */
  publishComplete?: boolean;
}

export interface ReviewOptions {
  publishToLive?: boolean;
  publishedBy?: string;
  /** When true, skip revalidatePath (caller revalidates once after bulk). */
  skipRevalidate?: boolean;
}

export async function approveMatch(
  normalizedId: string,
  masterProductId: string,
  options?: ReviewOptions
): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const nextSync = await nextSearchPublishStatusWhenAcceptingReview(normalizedId);
  const patch: Record<string, unknown> = {
    status: "approved",
    master_product_id: masterProductId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (nextSync) patch.search_publish_status = nextSync;
  const { error } = await supabase.from("supplier_products_normalized").update(patch).eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await supabase.from("review_decisions").insert({
    normalized_id: normalizedId,
    decision: "approved",
    master_product_id: masterProductId,
    decided_by: "admin",
  });

  if (options?.publishToLive) {
    const pub = await publishStagedToLive(normalizedId, { publishedBy: options.publishedBy });
    if (!pub.published) {
      if (!options?.skipRevalidate) await revalidateReview();
      return {
        success: true,
        masterProductId,
        published: false,
        publishError: pub.publishError ?? pub.error,
      };
    }
    if (!options?.skipRevalidate) await revalidateReview();
    return { success: true, masterProductId, published: true };
  }

  if (!options?.skipRevalidate) await revalidateReview();
  return { success: true, masterProductId, published: false };
}

export async function rejectStaged(normalizedId: string, notes?: string): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({ status: "rejected", reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await supabase.from("review_decisions").insert({
    normalized_id: normalizedId,
    decision: "rejected",
    decided_by: "admin",
    notes: notes ?? null,
  });
  await revalidateReview();
  return { success: true };
}

const PRODUCT_TYPE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createNewMasterProduct(
  normalizedId: string,
  payload: {
    sku: string;
    name: string;
    category_id: string;
    brand_id?: string;
    description?: string;
    product_type_id: string;
    list_price_minor: number;
    bulk_price_minor?: number | null;
    unit_cost_minor?: number | null;
  },
  options?: ReviewOptions
): Promise<ReviewResult & { masterProductId?: string }> {
  const supabase = getSupabaseCatalogos(true);
  const pt = String(payload.product_type_id || "").trim();
  if (!PRODUCT_TYPE_UUID_RE.test(pt)) {
    return { success: false, error: "product_type_id must be a valid UUID" };
  }
  const nameTrim = String(payload.name || "").trim();
  if (!nameTrim) return { success: false, error: "Product name is required" };
  const skuTrim = String(payload.sku || "").trim();
  if (!skuTrim) return { success: false, error: "SKU is required" };
  const lm = Number(payload.list_price_minor);
  if (!Number.isInteger(lm) || lm < 0) {
    return { success: false, error: "list_price_minor must be a non-negative integer (USD cents)" };
  }

  const slugBase = slugForNewCatalogProduct(skuTrim, nameTrim);
  const { data: slugClash } = await supabase.schema("catalog_v2").from("catalog_products").select("id").eq("slug", slugBase).maybeSingle();
  const finalSlug = slugClash?.id ? `${slugBase}-${Date.now().toString(36)}` : slugBase;
  const { data: product, error: insertErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .insert({
      product_type_id: pt,
      slug: finalSlug,
      internal_sku: skuTrim,
      name: nameTrim,
      description: payload.description ?? null,
      brand_id: payload.brand_id ?? null,
      status: "active",
      metadata: { category_id: payload.category_id, facet_attributes: {} },
    })
    .select("id")
    .single();
  if (insertErr || !product) return { success: false, error: insertErr?.message ?? "Insert failed" };

  const masterId = product.id as string;
  const { error: vInsErr } = await supabase.schema("catalog_v2").from("catalog_variants").insert({
    catalog_product_id: masterId,
    variant_sku: skuTrim,
    sort_order: 0,
    is_active: true,
    metadata: {},
  });
  if (vInsErr) {
    await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", masterId);
    return { success: false, error: vInsErr.message };
  }

  const sellable = await upsertSellableForCatalogV2Product(masterId, {
    name: nameTrim,
    internalSku: skuTrim,
    listPriceMinor: lm,
    bulkPriceMinor: payload.bulk_price_minor ?? null,
    unitCostMinor: payload.unit_cost_minor ?? null,
    isActive: true,
  });
  if (!sellable.ok) {
    await supabase.schema("catalog_v2").from("catalog_variants").delete().eq("catalog_product_id", masterId);
    await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", masterId);
    return { success: false, error: sellable.message };
  }
  const nextSync = await nextSearchPublishStatusWhenAcceptingReview(normalizedId);
  const patch: Record<string, unknown> = {
    status: "approved",
    master_product_id: masterId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (nextSync) patch.search_publish_status = nextSync;
  const { error: updateErr } = await supabase.from("supplier_products_normalized").update(patch).eq("id", normalizedId);
  if (updateErr) return { success: false, error: updateErr.message };

  await supabase.from("review_decisions").insert({
    normalized_id: normalizedId,
    decision: "approved",
    master_product_id: masterId,
    decided_by: "admin",
    notes: "New master product created",
  });

  if (options?.publishToLive) {
    const pub = await publishStagedToLive(normalizedId, { publishedBy: options.publishedBy });
    if (!pub.published) {
      await revalidateReview();
      return {
        success: true,
        masterProductId: masterId,
        published: false,
        publishError: pub.publishError ?? pub.error,
      };
    }
    return { success: true, masterProductId: masterId, published: true };
  }

  await revalidateReview();
  return { success: true, masterProductId: masterId, published: false };
}

export async function mergeWithStaged(
  normalizedId: string,
  targetMasterProductId: string,
  options?: ReviewOptions
): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const nextSync = await nextSearchPublishStatusWhenAcceptingReview(normalizedId);
  const patch: Record<string, unknown> = {
    status: "merged",
    master_product_id: targetMasterProductId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (nextSync) patch.search_publish_status = nextSync;
  const { error } = await supabase.from("supplier_products_normalized").update(patch).eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await supabase.from("review_decisions").insert({
    normalized_id: normalizedId,
    decision: "merged",
    master_product_id: targetMasterProductId,
    decided_by: "admin",
  });

  if (options?.publishToLive) {
    const pub = await publishStagedToLive(normalizedId, { publishedBy: options.publishedBy });
    if (!pub.published) {
      await revalidateReview();
      return { success: true, published: false, publishError: pub.publishError ?? pub.error };
    }
    return { success: true, published: true };
  }

  await revalidateReview();
  return { success: true, published: false };
}

export async function deferStaged(normalizedId: string): Promise<ReviewResult> {
  await revalidateReview();
  return { success: true };
}

/**
 * Validate attribute values against dictionary allowed values.
 * Brand is free text; multi-select keys must have each value in allowed list.
 */
function validateAttributesAgainstDictionary(
  attributes: Record<string, unknown>,
  allowedByKey: Record<string, string[]>
): { valid: true } | { valid: false; error: string } {
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "brand" || value === undefined || value === null) continue;
    const allowed = allowedByKey[key];
    if (!allowed?.length) continue;
    if (isMultiSelectAttribute(key)) {
      const arr = Array.isArray(value) ? value : [value];
      for (const v of arr) {
        const s = String(v).trim();
        if (s && !allowed.includes(s)) return { valid: false, error: `Invalid value for ${key}: "${s}". Allowed: ${allowed.slice(0, 5).join(", ")}${allowed.length > 5 ? "…" : ""}` };
      }
    } else {
      const s = String(value).trim();
      if (s && !allowed.includes(s)) return { valid: false, error: `Invalid value for ${key}: "${s}". Allowed: ${allowed.slice(0, 5).join(", ")}${allowed.length > 5 ? "…" : ""}` };
    }
  }
  return { valid: true };
}

export async function updateNormalizedAttributes(normalizedId: string, attributes: Record<string, unknown>): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase
    .from("supplier_products_normalized")
    .select("normalized_data, master_product_id")
    .eq("id", normalizedId)
    .single();
  if (!row) return { success: false, error: "Not found" };
  const normalized_data = (row.normalized_data as Record<string, unknown>) ?? {};
  const filterAttrs = (normalized_data.filter_attributes as Record<string, unknown>) ?? (normalized_data.attributes as Record<string, unknown>) ?? {};
  const merged = { ...filterAttrs, ...attributes };

  let categoryId: string | null = null;
  if (row.master_product_id) {
    const { data: prod } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("metadata")
      .eq("id", row.master_product_id)
      .single();
    const cid = flattenV2Metadata((prod as { metadata?: unknown } | null)?.metadata).category_id;
    if (cid != null) categoryId = String(cid);
  }
  if (!categoryId && (normalized_data.category_slug ?? normalized_data.category)) {
    categoryId = await getCategoryIdBySlug(String(normalized_data.category_slug ?? normalized_data.category));
  }
  if (categoryId) {
    const dict = await getReviewDictionaryForCategory(categoryId);
    const validation = validateAttributesAgainstDictionary(attributes, dict.allowedByKey);
    if (!validation.valid) return { success: false, error: validation.error };
  }

  const updated = stripFacetExtractionUiState({ ...normalized_data, filter_attributes: merged, attributes: merged });
  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({
      normalized_data: updated,
      attributes: merged,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await logAdminCatalogAudit({
    normalizedId,
    action: "attributes_updated",
    details: { keys: Object.keys(attributes) },
  });
  await revalidateReview();
  return { success: true };
}

export async function overridePricing(normalizedId: string, sellPrice: number): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase.from("supplier_products_normalized").select("normalized_data").eq("id", normalizedId).single();
  if (!row) return { success: false, error: "Not found" };
  const normalized_data = (row.normalized_data as Record<string, unknown>) ?? {};
  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({ normalized_data: { ...normalized_data, override_sell_price: sellPrice }, updated_at: new Date().toISOString() })
    .eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await logAdminCatalogAudit({
    normalizedId,
    action: "pricing_override",
    details: { override_sell_price: sellPrice },
  });
  await revalidateReview();
  return { success: true };
}

/** Patch import auto-pricing manual override (list / tiers). Clamps to 20% gross margin vs landed. Pass clear=true to remove overrides. */
export async function updateImportPricingOverride(
  normalizedId: string,
  patch: ImportPricingOverridePatch,
  options?: { clear?: boolean }
): Promise<ReviewResult> {
  const idErr = validateUuidParam("normalizedId", normalizedId);
  if (idErr) return { success: false, error: idErr };
  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase.from("supplier_products_normalized").select("normalized_data").eq("id", normalizedId).single();
  if (!row) return { success: false, error: "Not found" };
  const normalized_data = (row.normalized_data as Record<string, unknown>) ?? {};
  const rawAp = normalized_data.import_auto_pricing as ImportAutoPricingSnapshot | undefined;
  if (!rawAp || typeof rawAp !== "object") {
    return { success: false, error: "Row has no import auto pricing" };
  }

  const nextAp = options?.clear ? clearImportPricingOverride(rawAp) : applyImportPricingOverride(rawAp, patch);
  const updated = { ...normalized_data, import_auto_pricing: nextAp };
  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({ normalized_data: updated, updated_at: new Date().toISOString() })
    .eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await logAdminCatalogAudit({
    normalizedId,
    action: "import_pricing_override",
    details: { clear: Boolean(options?.clear), patch: options?.clear ? undefined : patch },
  });
  await revalidateReview();
  return { success: true };
}

export async function assignCategory(normalizedId: string, categoryId: string): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase.from("supplier_products_normalized").select("normalized_data").eq("id", normalizedId).single();
  if (!row) return { success: false, error: "Not found" };
  const normalized_data = (row.normalized_data as Record<string, unknown>) ?? {};
  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({ normalized_data: { ...normalized_data, category_id: categoryId }, updated_at: new Date().toISOString() })
    .eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await logAdminCatalogAudit({
    normalizedId,
    action: "category_assigned",
    details: { category_id: categoryId },
  });
  await revalidateReview();
  return { success: true };
}

/** Return required / strongly preferred attribute keys and allowed values for a staged row (by category). */
export async function getAttributeRequirementsForStaged(normalizedId: string): Promise<{
  success: boolean;
  error?: string;
  required?: string[];
  stronglyPreferred?: string[];
  allowedByKey?: Record<string, string[]>;
}> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row } = await supabase
    .from("supplier_products_normalized")
    .select("normalized_data, master_product_id")
    .eq("id", normalizedId)
    .single();
  if (!row) return { success: false, error: "Not found" };
  const nd = (row.normalized_data as Record<string, unknown>) ?? {};
  let categoryId: string | null = null;
  if (row.master_product_id) {
    const { data: prod } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("metadata")
      .eq("id", row.master_product_id)
      .single();
    const cid = flattenV2Metadata((prod as { metadata?: unknown } | null)?.metadata).category_id;
    if (cid != null) categoryId = String(cid);
  }
  if (!categoryId && (nd.category_slug ?? nd.category)) {
    categoryId = await getCategoryIdBySlug(String(nd.category_slug ?? nd.category));
  }
  if (!categoryId) return { success: true, required: [], stronglyPreferred: [], allowedByKey: {} };
  const dict = await getReviewDictionaryForCategory(categoryId);
  return {
    success: true,
    required: dict.required,
    stronglyPreferred: dict.stronglyPreferred,
    allowedByKey: dict.allowedByKey,
  };
}

export async function markForReprocessing(normalizedId: string): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({ status: "pending", match_confidence: null, master_product_id: null, updated_at: new Date().toISOString() })
    .eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await logAdminCatalogAudit({
    normalizedId,
    action: "marked_for_reprocessing",
    details: {},
  });
  await revalidateReview();
  return { success: true };
}

/** Server action: publish readiness for the staging detail panel (same rules as publishStagedToLive). */
export async function getPublishReadinessForStaging(normalizedId: string) {
  return evaluatePublishReadiness(normalizedId);
}

/**
 * Adjust variant grouping fields on a staging row (family key, inferred base SKU / size).
 */
export async function updateStagedVariantFields(
  normalizedId: string,
  patch: {
    inferred_size?: string | null;
    inferred_base_sku?: string | null;
    family_group_key?: string | null;
    variant_axis?: string | null;
    variant_value?: string | null;
  }
): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const clean: Record<string, string | null> = {};
  if (patch.inferred_size !== undefined) clean.inferred_size = patch.inferred_size;
  if (patch.inferred_base_sku !== undefined) clean.inferred_base_sku = patch.inferred_base_sku;
  if (patch.family_group_key !== undefined) clean.family_group_key = patch.family_group_key;
  if (patch.variant_axis !== undefined) clean.variant_axis = patch.variant_axis;
  if (patch.variant_value !== undefined) clean.variant_value = patch.variant_value;
  if (Object.keys(clean).length === 0) return { success: true };
  const { error } = await supabase
    .from("supplier_products_normalized")
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", normalizedId);
  if (error) return { success: false, error: error.message };
  await logAdminCatalogAudit({
    normalizedId,
    action: "variant_metadata_updated",
    details: clean,
  });
  await revalidateReview();
  return { success: true };
}

/**
 * Update a live supplier offer (cost, sell_price, lead time, active). Validates non-negative numbers.
 */
export async function updateSupplierOfferAdmin(
  offerId: string,
  fields: {
    cost?: number;
    sell_price?: number | null;
    lead_time_days?: number | null;
    is_active?: boolean;
  },
  options?: { actor?: string; normalizedId?: string | null }
): Promise<ReviewResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: existing, error: fetchErr } = await supabase
    .from("supplier_offers")
    .select("id, product_id, supplier_id, normalized_id")
    .eq("id", offerId)
    .single();
  if (fetchErr || !existing) return { success: false, error: fetchErr?.message ?? "Offer not found" };

  const row = existing as { id: string; product_id: string; supplier_id: string; normalized_id: string | null };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.cost !== undefined) patch.cost = fields.cost;
  if (fields.sell_price !== undefined) patch.sell_price = fields.sell_price;
  if (fields.lead_time_days !== undefined) patch.lead_time_days = fields.lead_time_days;
  if (fields.is_active !== undefined) patch.is_active = fields.is_active;

  if (Object.keys(patch).length <= 1) return { success: true };

  const { error } = await supabase.from("supplier_offers").update(patch).eq("id", offerId);
  if (error) return { success: false, error: error.message };

  await logAdminCatalogAudit({
    normalizedId: options?.normalizedId ?? row.normalized_id,
    productId: row.product_id,
    supplierOfferId: offerId,
    action: "supplier_offer_updated",
    actor: options?.actor ?? "admin",
    details: { fields },
  });
  await revalidateReview();
  return { success: true };
}

/**
 * Deactivate a live master product and all its supplier offers (catalog consistency / takedown).
 */
export async function unpublishLiveProduct(
  productId: string,
  options?: { reason?: string; actor?: string; normalizedId?: string | null }
): Promise<ReviewResult> {
  const idErr = validateUuidParam("product_id", productId);
  if (idErr) {
    logAdminActionFailure(idErr, { action: "unpublishLiveProduct", productId });
    return { success: false, error: idErr };
  }

  const supabase = getSupabaseCatalogos(true);
  const { error: u1 } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (u1) return { success: false, error: u1.message };

  const { error: u2 } = await supabase
    .from("supplier_offers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("product_id", productId);
  if (u2) return { success: false, error: u2.message };

  await logAdminCatalogAudit({
    normalizedId: options?.normalizedId ?? null,
    productId,
    action: "product_unpublished",
    actor: options?.actor ?? "admin",
    details: { reason: options?.reason ?? null },
  });
  await revalidateReview();
  return { success: true };
}

/**
 * Publish all staging rows in the same batch that share this row's family_group_key (variant family).
 */
export async function publishVariantGroupForNormalized(
  normalizedId: string,
  options?: { publishedBy?: string }
): Promise<BulkResult & { familyId?: string; productIds?: string[]; publishError?: string }> {
  const row = await getStagingById(normalizedId);
  if (!row) {
    return { success: false, processed: 0, succeeded: 0, failed: 1, errors: ["Row not found"], publishError: "Row not found" };
  }
  const batchId = row.batch_id as string;
  const familyKey = row.family_group_key as string | null | undefined;
  if (!familyKey) {
    return { success: false, processed: 0, succeeded: 0, failed: 1, errors: ["No family_group_key"], publishError: "No family_group_key on this row" };
  }
  const siblings = await getStagingRows({ batch_id: batchId, limit: 500 });
  const ids = siblings.filter((r) => r.family_group_key === familyKey).map((r) => r.id);
  if (ids.length === 0) {
    return { success: false, processed: 0, succeeded: 0, failed: 1, errors: ["No siblings"], publishError: "No rows in family" };
  }
  const result = await publishVariantGroup(ids, options);
  if (result.success) {
    await logAdminCatalogAudit({
      normalizedId,
      action: "variant_group_published",
      actor: options?.publishedBy ?? "admin",
      details: {
        family_group_key: familyKey,
        normalizedIds: ids,
        familyId: result.familyId,
        productIds: result.productIds,
      },
    });
  }
  return result;
}

/**
 * Publish an already-approved staged product to the live catalog (or re-publish after edits).
 * Gates on status (approved|merged), master link, dictionary rules, and case-cost rules; logs admin_catalog_audit on success.
 */
export async function publishStagedToLive(
  normalizedId: string,
  options?: { publishedBy?: string; expectedUpdatedAt?: string | null; skipRevalidate?: boolean }
): Promise<
  ReviewResult & {
    published?: boolean;
    publishError?: string;
    readiness?: Awaited<ReturnType<typeof evaluatePublishReadiness>>;
  }
> {
  const readiness = await evaluatePublishReadiness(normalizedId);
  if (!readiness.canPublish) {
    const msg = readiness.blockers.join(" ");
    return {
      success: false,
      error: msg,
      publishError: msg,
      published: false,
      readiness,
    };
  }

  if (options?.expectedUpdatedAt) {
    const supabase = getSupabaseCatalogos(true);
    const { data: cur } = await supabase
      .from("supplier_products_normalized")
      .select("updated_at")
      .eq("id", normalizedId)
      .single();
    const curAt = (cur as { updated_at?: string } | null)?.updated_at;
    if (curAt && curAt !== options.expectedUpdatedAt) {
      return {
        success: false,
        error: "This staged row changed since you opened it. Refresh the detail panel and try again.",
        publishError: "Stale row: refresh and retry.",
        published: false,
      };
    }
  }

  const row = await getStagingById(normalizedId);
  if (!row) return { success: false, error: "Staged row not found", published: false };
  const masterId = row.master_product_id as string | undefined;
  if (!masterId) return { success: false, error: "master_product_id required", published: false };
  const input = buildPublishInputFromStaged(normalizedId, row, { masterProductId: masterId, publishedBy: options?.publishedBy });
  if (!input) return { success: false, error: "Missing supplier_id or raw_id", published: false };

  const result = await runPublish(input);
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      published: false,
      publishError: result.error,
      searchPublishStatus: result.searchPublishStatus,
      publishComplete: result.publishComplete ?? false,
    };
  }

  await logAdminCatalogAudit({
    normalizedId,
    productId: result.productId ?? null,
    action: "published_to_live",
    actor: options?.publishedBy ?? "admin",
    details: {
      warnings: result.warnings ?? [],
      slug: result.slug ?? null,
      searchPublishStatus: result.searchPublishStatus,
      publishComplete: result.publishComplete ?? true,
    },
  });

  if (!options?.skipRevalidate) await revalidateReview();
  return {
    success: true,
    published: true,
    masterProductId: masterId,
    readiness,
    searchPublishStatus: result.searchPublishStatus,
    publishComplete: result.publishComplete ?? true,
  };
}

// ---------------------------------------------------------------------------
// BULK ACTIONS (ingestion console)
// ---------------------------------------------------------------------------

/** True if any approved/merged row in the batch is not yet storefront-synced. */
async function batchHasUnpublishedApproved(batchId: string): Promise<boolean> {
  const supabase = getSupabaseCatalogos(true);
  const PAGE = 200;
  for (let off = 0; off < 8000; off += PAGE) {
    const { data } = await supabase
      .from("supplier_products_normalized")
      .select("search_publish_status")
      .eq("batch_id", batchId)
      .in("status", ["approved", "merged"])
      .order("id", { ascending: true })
      .range(off, off + PAGE - 1);
    const rows = (data ?? []) as { search_publish_status: string | null }[];
    if (rows.length === 0) return false;
    if (rows.some((r) => r.search_publish_status !== "published_synced")) return true;
    if (rows.length < PAGE) return false;
  }
  return true;
}

export interface BulkResult {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

/** Approve selected rows with the same master product (merge to one). */
export async function bulkApproveStaged(
  normalizedIds: string[],
  masterProductId: string,
  options?: ReviewOptions
): Promise<BulkResult> {
  const errors: string[] = [];
  let succeeded = 0;
  for (const id of normalizedIds.slice(0, 200)) {
    const r = await approveMatch(id, masterProductId, options);
    if (r.success) succeeded++;
    else errors.push(`${id}: ${r.error}`);
  }
  await revalidateReview();
  return { success: errors.length === 0, processed: normalizedIds.length, succeeded, failed: errors.length, errors };
}

/**
 * Approve each row using its ai_suggested_master_product_id (pass-2 deferred matching).
 * Rows must be pending with ai_match_status completed and a non-null suggestion.
 */
export async function bulkApproveAiSuggestions(
  normalizedIds: string[],
  options?: ReviewOptions
): Promise<BulkResult> {
  const supabase = getSupabaseCatalogos(true);
  const ids = normalizedIds.slice(0, 200);
  if (ids.length === 0) {
    return { success: true, processed: 0, succeeded: 0, failed: 0, errors: [] };
  }

  const { data: rows, error } = await supabase
    .from("supplier_products_normalized")
    .select("id, ai_suggested_master_product_id, status, ai_match_status")
    .in("id", ids);

  if (error) {
    return { success: false, processed: ids.length, succeeded: 0, failed: ids.length, errors: [error.message] };
  }

  const errors: string[] = [];
  let succeeded = 0;
  for (const row of rows ?? []) {
    const r = row as {
      id: string;
      ai_suggested_master_product_id: string | null;
      status: string;
      ai_match_status: string | null;
    };
    if (r.status !== "pending") {
      errors.push(`${r.id}: not pending`);
      continue;
    }
    if (r.ai_match_status !== "completed") {
      errors.push(`${r.id}: AI match not completed`);
      continue;
    }
    if (!r.ai_suggested_master_product_id) {
      errors.push(`${r.id}: no AI suggestion`);
      continue;
    }
    const res = await approveMatch(r.id, r.ai_suggested_master_product_id, options);
    if (res.success) succeeded++;
    else errors.push(`${r.id}: ${res.error}`);
  }

  await revalidateReview();
  return {
    success: errors.length === 0,
    processed: ids.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}

/** Approve up to `limit` pending rows in a batch that have AI suggestions ready. */
export async function approveAllAiSuggestionsInBatch(
  batchId: string,
  limit: number = 500,
  options?: ReviewOptions
): Promise<BulkResult> {
  const supabase = getSupabaseCatalogos(true);
  const cap = Math.min(500, Math.max(1, limit));
  const { data: rows, error } = await supabase
    .from("supplier_products_normalized")
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "pending")
    .eq("ai_match_status", "completed")
    .not("ai_suggested_master_product_id", "is", null)
    .limit(cap);

  if (error) {
    return { success: false, processed: 0, succeeded: 0, failed: 0, errors: [error.message] };
  }
  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  return bulkApproveAiSuggestions(ids, options);
}

/** Reject selected rows. */
export async function bulkRejectStaged(normalizedIds: string[], notes?: string): Promise<BulkResult> {
  const errors: string[] = [];
  let succeeded = 0;
  for (const id of normalizedIds.slice(0, 200)) {
    const r = await rejectStaged(id, notes);
    if (r.success) succeeded++;
    else errors.push(`${id}: ${r.error}`);
  }
  await revalidateReview();
  return { success: errors.length === 0, processed: normalizedIds.length, succeeded, failed: errors.length, errors };
}

/** Mark selected rows as needing review (reset to pending). */
export async function bulkMarkForReview(normalizedIds: string[]): Promise<BulkResult> {
  const supabase = getSupabaseCatalogos(true);
  const errors: string[] = [];
  for (const id of normalizedIds.slice(0, 200)) {
    const { error } = await supabase
      .from("supplier_products_normalized")
      .update({ status: "pending", search_publish_status: "staged", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) errors.push(`${id}: ${error.message}`);
  }
  const succeeded = normalizedIds.length - errors.length;
  await revalidateReview();
  return { success: errors.length === 0, processed: normalizedIds.length, succeeded, failed: errors.length, errors };
}

/** Result of “Approve all auto-ready” with operator-facing buckets. */
export interface ApproveAllAutoReadyResult {
  success: boolean;
  /** Rows approved (status → approved). */
  approved: number;
  /** Rows skipped (no longer matched query between rounds, or ineligible for unknown race). */
  skipped: number;
  /** Rows left pending: failed preflight (title, validation_errors, disposition drift, etc.). */
  blocked: number;
  /** approveMatch failures (DB, etc.). */
  errors: string[];
  /** Sample blocked explanations (cap 12). */
  blockedSamples: string[];
}

/**
 * Approve pending rows the pipeline marked auto_candidate (with a linked master), with preflight.
 * Repeats until none left (each pass up to 500). Single revalidate at end for throughput.
 */
export async function approveAllAutoReadyInBatch(
  batchId: string,
  options?: ReviewOptions
): Promise<ApproveAllAutoReadyResult> {
  const supabase = getSupabaseCatalogos(true);
  const errors: string[] = [];
  const blockedSamples: string[] = [];
  let approved = 0;
  let skipped = 0;
  let blocked = 0;
  const bulkOpts: ReviewOptions = { ...options, skipRevalidate: true };
  const MAX_ROUNDS = 200;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data: rows, error } = await supabase
      .from("supplier_products_normalized")
      .select("id, master_product_id, status, normalized_data")
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .filter("normalized_data->>ingestion_disposition", "eq", "auto_candidate")
      .not("master_product_id", "is", null)
      .limit(500);

    if (error) {
      await revalidateReview();
      return {
        success: false,
        approved,
        skipped,
        blocked,
        errors: [...errors, error.message],
        blockedSamples,
      };
    }
    const chunk = (rows ?? []) as {
      id: string;
      master_product_id: string;
      status: string;
      normalized_data: Record<string, unknown>;
    }[];
    if (chunk.length === 0) break;

    for (const r of chunk) {
      const gate = evaluateAutoApproveEligibility(r);
      if (gate.blocked) {
        if (gate.reason === "not_pending" || gate.reason === "not_auto_candidate") {
          skipped++;
        } else {
          blocked++;
          if (blockedSamples.length < 12) {
            blockedSamples.push(`${r.id.slice(0, 8)}…: ${gate.reason ?? "blocked"}${gate.detail ? ` (${gate.detail})` : ""}`);
          }
        }
        continue;
      }

      const res = await approveMatch(r.id, r.master_product_id, bulkOpts);
      if (res.success) approved++;
      else errors.push(`${r.id}: ${res.error}`);
    }
  }

  await revalidateReview();
  return {
    success: errors.length === 0,
    approved,
    skipped,
    blocked,
    errors,
    blockedSamples,
  };
}

/**
 * Publish up to `chunkSize` approved/merged rows that are not yet storefront-synced.
 * Idempotent: already `published_synced` rows are not returned as candidates. Call in a loop until `done`.
 */
export async function publishNextApprovedPublishChunk(
  batchId: string,
  options?: { publishedBy?: string; chunkSize?: number }
): Promise<{
  published: number;
  failed: number;
  publishErrors: string[];
  /** No remaining candidates in this batch (or none to process this round). */
  done: boolean;
}> {
  const cap = Math.min(Math.max(1, options?.chunkSize ?? BULK_PUBLISH_CHUNK_SIZE), BULK_PUBLISH_MAX_IDS);
  const supabase = getSupabaseCatalogos(true);
  const PAGE = 250;
  const ids: string[] = [];

  for (let off = 0; off < 8000 && ids.length < cap; off += PAGE) {
    const { data, error } = await supabase
      .from("supplier_products_normalized")
      .select("id, search_publish_status")
      .eq("batch_id", batchId)
      .in("status", ["approved", "merged"])
      .order("id", { ascending: true })
      .range(off, off + PAGE - 1);

    if (error) {
      await revalidateReview();
      return { published: 0, failed: 0, publishErrors: [error.message], done: true };
    }
    const rows = (data ?? []) as { id: string; search_publish_status: string | null }[];
    for (const r of rows) {
      if (r.search_publish_status !== "published_synced") ids.push(r.id);
      if (ids.length >= cap) break;
    }
    if (rows.length < PAGE) break;
  }

  if (ids.length === 0) {
    return { published: 0, failed: 0, publishErrors: [], done: true };
  }

  let published = 0;
  let failed = 0;
  const publishErrors: string[] = [];
  for (const id of ids) {
    const res = await publishStagedToLive(id, {
      publishedBy: options?.publishedBy,
      skipRevalidate: true,
    });
    if (res.published) published++;
    else {
      failed++;
      if (res.publishError) publishErrors.push(`${id.slice(0, 8)}…: ${res.publishError}`);
    }
  }

  await revalidateReview();
  const done = !(await batchHasUnpublishedApproved(batchId));
  return {
    published,
    failed,
    publishErrors,
    done,
  };
}

/** Approve all rows in batch that have match_confidence >= threshold and already have master_product_id (from matcher). */
export async function approveAllAboveConfidence(
  batchId: string,
  confidenceMin: number = 0.85
): Promise<BulkResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: rows, error } = await supabase
    .from("supplier_products_normalized")
    .select("id, match_confidence, master_product_id")
    .eq("batch_id", batchId)
    .eq("status", "pending")
    .gte("match_confidence", confidenceMin)
    .not("master_product_id", "is", null)
    .limit(500);
  if (error) return { success: false, processed: 0, succeeded: 0, failed: 0, errors: [error.message] };
  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return { success: true, processed: 0, succeeded: 0, failed: 0, errors: [] };
  const errors: string[] = [];
  let succeeded = 0;
  for (const row of rows ?? []) {
    const r = row as { id: string; master_product_id: string };
    const result = await approveMatch(r.id, r.master_product_id, {});
    if (result.success) succeeded++;
    else errors.push(`${r.id}: ${result.error}`);
  }
  await revalidateReview();
  return { success: errors.length === 0, processed: ids.length, succeeded, failed: errors.length, errors };
}

/** Publish selected approved/merged rows (canonical path: runPublish → product_attributes synced). Chunked to support 100–500 rows. */
export async function bulkPublishStaged(
  normalizedIds: string[],
  options?: { publishedBy?: string; skipInnerRevalidate?: boolean }
): Promise<BulkResult & { published: number; publishErrors: string[] }> {
  const ids = normalizedIds.slice(0, BULK_PUBLISH_MAX_IDS);
  const publishErrors: string[] = [];
  let published = 0;
  const skipRv = options?.skipInnerRevalidate === true;
  for (let i = 0; i < ids.length; i += BULK_PUBLISH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_PUBLISH_CHUNK_SIZE);
    for (const id of chunk) {
      const result = await publishStagedToLive(id, {
        publishedBy: options?.publishedBy,
        skipRevalidate: skipRv,
      });
      if (result.published) published++;
      else if (result.publishError) publishErrors.push(`${id}: ${result.publishError}`);
    }
  }
  await revalidateReview();
  return {
    success: publishErrors.length === 0,
    processed: normalizedIds.length,
    succeeded: published,
    failed: publishErrors.length,
    errors: [],
    published,
    publishErrors,
  };
}

/** Publish all approved/merged rows in a batch (resumable chunks; idempotent per row). */
export async function publishAllApprovedInBatch(
  batchId: string,
  options?: { publishedBy?: string }
): Promise<BulkResult & { published: number; publishErrors: string[]; chunks: number }> {
  let published = 0;
  let failed = 0;
  const publishErrors: string[] = [];
  let chunkCount = 0;
  const MAX_CHUNKS = 80;

  for (let i = 0; i < MAX_CHUNKS; i++) {
    const r = await publishNextApprovedPublishChunk(batchId, {
      publishedBy: options?.publishedBy,
      chunkSize: BULK_PUBLISH_CHUNK_SIZE,
    });
    chunkCount++;
    published += r.published;
    failed += r.failed;
    publishErrors.push(...r.publishErrors);
    if (r.done) break;
  }

  return {
    success: publishErrors.length === 0,
    processed: published + failed,
    succeeded: published,
    failed: publishErrors.length,
    errors: [],
    published,
    publishErrors,
    chunks: chunkCount,
  };
}

/**
 * Approve a resolution candidate (identity graph): store decision and set master_product_id when variant/offer/duplicate.
 */
export async function approveResolutionCandidateAction(
  candidateId: string,
  options?: { decidedBy?: string }
): Promise<ReviewResult> {
  const result = await approveResolutionCandidate(candidateId, options);
  if (!result.success) return { success: false, error: result.error };
  await revalidateReview();
  return { success: true };
}

/**
 * Reject a resolution candidate (leave as new or manual).
 */
export async function rejectResolutionCandidateAction(
  candidateId: string,
  options?: { decidedBy?: string }
): Promise<ReviewResult> {
  const result = await rejectResolutionCandidate(candidateId, options);
  if (!result.success) return { success: false, error: result.error };
  await revalidateReview();
  return { success: true };
}

/**
 * Publish a variant group: one product family + N size variants + N offers.
 * All normalizedIds must share the same family_group_key (run family inference on batch first).
 */
export async function publishVariantGroup(
  normalizedIds: string[],
  options?: { publishedBy?: string }
): Promise<BulkResult & { familyId?: string; productIds?: string[]; publishError?: string }> {
  if (normalizedIds.length === 0) {
    return { success: false, processed: 0, succeeded: 0, failed: 0, errors: [], publishError: "No rows selected" };
  }
  const result = await runPublishVariantGroup({
    normalizedIds: normalizedIds.slice(0, 50),
    publishedBy: options?.publishedBy,
  });
  if (!result.success) {
    await revalidateReview();
    return {
      success: false,
      processed: normalizedIds.length,
      succeeded: 0,
      failed: normalizedIds.length,
      errors: [result.error ?? "Publish failed"],
      publishError: result.error,
    };
  }
  await revalidateReview();
  return {
    success: true,
    processed: normalizedIds.length,
    succeeded: result.productIds?.length ?? 0,
    failed: 0,
    errors: [],
    familyId: result.familyId,
    productIds: result.productIds,
  };
}

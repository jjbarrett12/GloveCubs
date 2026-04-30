/**
 * Glove variant model for publish/ingest: size lives on catalog_variants.size_code;
 * variant_sku is the authoritative purchase item number (purchase_item_number is generated in DB).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const GLOVE_CATEGORY_SLUGS = new Set(["disposable_gloves", "reusable_work_gloves"]);

export function isGloveCategorySlug(categorySlug: string): boolean {
  return GLOVE_CATEGORY_SLUGS.has(categorySlug);
}

/** Strip size before persisting to catalogos.product_attributes (size is variant-only). */
export function omitSizeFromProductAttributesFilter(filterAttributes: Record<string, unknown>): Record<string, unknown> {
  const { size: _removed, ...rest } = filterAttributes;
  return rest;
}

export function extractSizeCodeFromFilterAttributes(filterAttributes: Record<string, unknown>): string | null {
  const raw = filterAttributes.size;
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw.length > 0 ? String(raw[0]).trim() : "";
    return first.length > 0 ? first : null;
  }
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

export function validatePurchaseItemNumber(variantSku: string): { ok: true } | { ok: false; error: string } {
  if (typeof variantSku !== "string" || variantSku.trim() === "") {
    return {
      ok: false,
      error: "Purchase item number is required: variant_sku must be non-empty (it is the authoritative PO / cart line SKU).",
    };
  }
  return { ok: true };
}

/**
 * Merge staged identifier onto existing catalog_variants value.
 * Non-empty staged wins (current publish); empty/missing staged preserves non-null DB values (idempotent re-publish).
 */
export function mergeVariantIdentifierField(
  existing: string | null | undefined,
  staged: string | null | undefined
): string | null {
  if (staged !== undefined && staged !== null) {
    const s = String(staged).trim();
    if (s) return s;
  }
  const e = existing != null ? String(existing).trim() : "";
  return e || null;
}

type AdminClient = SupabaseClient;

/**
 * Upsert one glove variant for an ingest publish row: match by (catalog_product_id, size_code) or variant_sku.
 */
export async function upsertCatalogVariantFromGloveIngest(
  admin: AdminClient,
  input: { catalogProductId: string; sizeCode: string; variantSku: string; gtin?: string | null; mpn?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const skuCheck = validatePurchaseItemNumber(input.variantSku);
  if (!skuCheck.ok) return skuCheck;

  const size = input.sizeCode.trim();
  if (!size) {
    return { ok: false, error: "size_code is required for glove variants (extracted from staged size)." };
  }

  const variantSku = input.variantSku.trim();
  const metadata = { size };

  const { data: rowBySku, error: skuErr } = await admin
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id, catalog_product_id, gtin, mpn")
    .eq("variant_sku", variantSku)
    .maybeSingle();

  if (skuErr) {
    return { ok: false, error: `catalog_variants lookup by sku: ${skuErr.message}` };
  }

  if (rowBySku && String((rowBySku as { catalog_product_id: string }).catalog_product_id) !== input.catalogProductId) {
    return {
      ok: false,
      error: `variant_sku "${variantSku}" is already used by another catalog product.`,
    };
  }

  const { data: rowBySize, error: sizeErr } = await admin
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id, variant_sku, gtin, mpn")
    .eq("catalog_product_id", input.catalogProductId)
    .eq("size_code", size)
    .maybeSingle();

  if (sizeErr) {
    return { ok: false, error: `catalog_variants lookup by size: ${sizeErr.message}` };
  }

  const bySize = rowBySize as { id: string; variant_sku: string; gtin: string | null; mpn: string | null } | null;
  const bySkuId = rowBySku as {
    id: string;
    catalog_product_id: string;
    gtin: string | null;
    mpn: string | null;
  } | null;

  const now = new Date().toISOString();

  if (bySize) {
    const mergedGtin = mergeVariantIdentifierField(bySize.gtin, input.gtin);
    const mergedMpn = mergeVariantIdentifierField(bySize.mpn, input.mpn);
    const { error: updErr } = await admin
      .schema("catalog_v2")
      .from("catalog_variants")
      .update({
        variant_sku: variantSku,
        size_code: size,
        metadata,
        gtin: mergedGtin,
        mpn: mergedMpn,
        is_active: true,
        updated_at: now,
      })
      .eq("id", bySize.id);
    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true };
  }

  if (bySkuId) {
    const mergedGtin = mergeVariantIdentifierField(bySkuId.gtin, input.gtin);
    const mergedMpn = mergeVariantIdentifierField(bySkuId.mpn, input.mpn);
    const { error: updErr } = await admin
      .schema("catalog_v2")
      .from("catalog_variants")
      .update({
        size_code: size,
        metadata,
        gtin: mergedGtin,
        mpn: mergedMpn,
        is_active: true,
        updated_at: now,
      })
      .eq("id", bySkuId.id);
    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true };
  }

  const mergedGtin = mergeVariantIdentifierField(null, input.gtin);
  const mergedMpn = mergeVariantIdentifierField(null, input.mpn);
  const { error: insErr } = await admin.schema("catalog_v2").from("catalog_variants").insert({
    catalog_product_id: input.catalogProductId,
    variant_sku: variantSku,
    size_code: size,
    sort_order: 0,
    is_active: true,
    metadata,
    gtin: mergedGtin,
    mpn: mergedMpn,
  });
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}

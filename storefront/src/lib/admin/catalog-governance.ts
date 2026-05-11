/**
 * Shared catalog governance rules for /admin/catalog health buckets and
 * /admin/products operational warnings. Keep predicates aligned — no invented scores.
 */

export const THIN_PDP_MIN_ATTRIBUTE_ROWS = 5;

export const REQUIRED_GLOVE_ANY_KEYS = ["grade", "powder", "thickness_mil"] as const;
export const REQUIRED_GLOVE_USE_ANY_KEYS = ["industries", "uses"] as const;

export type GovernanceWarning = {
  code: string;
  label: string;
};

export type ProductGovernanceContext = {
  productId: string;
  status: string;
  metadata: Record<string, unknown> | null;
  /** All image rows for this product (metadata only needed for provenance). */
  imageRows: Array<{ metadata: Record<string, unknown> | null }>;
  /** Total rows in catalogos.product_attributes for this product_id. */
  attributeRowCount: number;
  activeVariantCount: number;
  /** Non-null GTIN strings on active variants for this product. */
  activeVariantGtins: string[];
  /** Non-null attribute_signature on active variants for this product. */
  activeVariantSignatures: string[];
  /** metadata.category_id when set. */
  categoryId: string | null;
  /** True when category_id is absent or matches a real catalogos.categories.id. */
  categoryIdValid: boolean;
  /** Attribute keys present with non-empty value_text (same semantics as catalog-health glove audit). */
  attributeKeysWithValues: Set<string>;
  /** Pending catalog_match_reviews rows referencing a variant on this product via proposed_catalog_variant_id. */
  pendingMatchReviewCount: number;
  /** GTINs that appear on more than one variant globally (non-null). */
  globalGtinCollisionGtins: Set<string>;
  /** Keys `${catalog_product_id}::${attribute_signature}` that appear more than once globally. */
  globalSignatureCollisionKeys: Set<string>;
};

export function isGloveAttributeCandidate(metadata: Record<string, unknown> | null | undefined): boolean {
  const meta = (metadata ?? {}) as { product_line_code?: unknown };
  const code = typeof meta.product_line_code === "string" ? meta.product_line_code : "";
  return code === "" || code === "ppe_gloves" || code === "legacy_glove";
}

export function isMissingGloveAttributesForKeys(keys: Set<string>): boolean {
  const hasMaterial = keys.has("material");
  const hasAnyGloveSpec = REQUIRED_GLOVE_ANY_KEYS.some((k) => keys.has(k));
  const hasAnyUse = REQUIRED_GLOVE_USE_ANY_KEYS.some((k) => keys.has(k));
  return !hasMaterial || !hasAnyGloveSpec || !hasAnyUse;
}

/** True when every image row is placeholder-only provenance (no "real" provenance row). */
export function productHasOnlyPlaceholderImagery(
  imageRows: Array<{ metadata: Record<string, unknown> | null }>
): boolean {
  if (imageRows.length === 0) return false;
  let anyReal = false;
  for (const row of imageRows) {
    const provenance = (row.metadata as { image_provenance?: string } | null)?.image_provenance ?? null;
    if (provenance && provenance !== "placeholder") {
      anyReal = true;
      break;
    }
  }
  return !anyReal;
}

export function computeProductWarnings(ctx: ProductGovernanceContext): GovernanceWarning[] {
  const out: GovernanceWarning[] = [];
  const st = (ctx.status ?? "").trim();
  const activeOrDraft = st === "active" || st === "draft";

  if (activeOrDraft && ctx.imageRows.length === 0) {
    out.push({ code: "missing_images", label: "Missing imagery" });
  }

  if (activeOrDraft && productHasOnlyPlaceholderImagery(ctx.imageRows)) {
    out.push({ code: "placeholder_only_images", label: "Placeholder-only imagery" });
  }

  if (st === "active" && ctx.attributeRowCount < THIN_PDP_MIN_ATTRIBUTE_ROWS) {
    out.push({ code: "thin_pdp", label: "Thin PDP (few product attributes)" });
  }

  if (st === "active" && isGloveAttributeCandidate(ctx.metadata) && isMissingGloveAttributesForKeys(ctx.attributeKeysWithValues)) {
    out.push({ code: "missing_glove_attributes", label: "Missing required glove attributes" });
  }

  if (activeOrDraft && ctx.categoryId && !ctx.categoryIdValid) {
    out.push({ code: "orphan_category", label: "Orphan category linkage" });
  }

  if (st === "active" && ctx.activeVariantCount === 0) {
    out.push({ code: "no_active_variants", label: "No active variants" });
  }

  if (st === "active" && ctx.activeVariantCount === 1) {
    out.push({ code: "single_active_variant", label: "Single active variant (coverage review)" });
  }

  for (const gtin of ctx.activeVariantGtins) {
    if (gtin && ctx.globalGtinCollisionGtins.has(gtin)) {
      out.push({ code: "duplicate_gtin", label: "Duplicate GTIN risk" });
      break;
    }
  }

  for (const sig of ctx.activeVariantSignatures) {
    if (!sig) continue;
    const k = `${ctx.productId}::${sig}`;
    if (ctx.globalSignatureCollisionKeys.has(k)) {
      out.push({ code: "duplicate_signature", label: "Duplicate variant signature risk" });
      break;
    }
  }

  if (ctx.pendingMatchReviewCount > 0) {
    out.push({ code: "pending_match_reviews", label: "Pending match reviews" });
  }

  return out;
}

export function governanceWarningCount(ctx: ProductGovernanceContext): number {
  return computeProductWarnings(ctx).length;
}

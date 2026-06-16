import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import { normalizeToAllowedValue } from "@/lib/admin/product-attribute-upsert";
import { proposeVariantsFromImport, type EditorVariantRow } from "@/lib/admin/variant-generation";
import {
  isSafeGloveCubsSkuProposal,
  SKU_PROPOSAL_SAFE_CONFIDENCE,
  deriveSkuProposalsFromImportDraft,
} from "@/lib/admin/variant-sku-intelligence";
import type { CommercePackagingV1 } from "@commerce-packaging/types";
import { mergeCommercePackagingProvenance } from "@commerce-packaging/extract";
import { normalizeCommercePackaging } from "@commerce-packaging/labels";
import { commercePackagingToFilterAttributes } from "@commerce-packaging/filter-sync";
import {
  inferGloveAttributesFromDraft,
  mergeInferredAttributes,
} from "@/lib/admin/glove-attribute-inference";

export type ImportApplyExistingState = {
  identity?: Partial<{
    name: string;
    brandName: string;
    description: string;
    primaryImageUrl: string;
  }>;
  attributes?: Record<string, string | string[]>;
  variants?: EditorVariantRow[];
  commercePackaging?: CommercePackagingV1 | null;
};

export type ImportPatchOptions = {
  replaceOs?: boolean;
  overwriteExisting?: boolean;
  existing?: ImportApplyExistingState;
};

export type ImportApplyPatch = {
  identity?: Partial<{
    name: string;
    brandName: string;
    description: string;
    primaryImageUrl: string;
  }>;
  attributes?: Record<string, string | string[]>;
  variants?: EditorVariantRow[];
  commercePackaging?: CommercePackagingV1;
  internalSku?: string;
};

export type ImportSuggestionSkip = {
  field: string;
  reason: string;
  value?: unknown;
};

export type ImportSuggestionResult = {
  attributes: Record<string, string | string[]>;
  identity: {
    name?: string;
    brandName?: string;
    description?: string;
    primaryImageUrl?: string;
  };
  variants: Array<{ sizeCode: string; variantSku: string; listPrice: string }>;
  skipped: ImportSuggestionSkip[];
};

const SAFE_CONFIDENCE = 0.7;

function addCert(
  out: Record<string, string | string[]>,
  allowed: string[],
  cert: string
): boolean {
  const norm = normalizeToAllowedValue(cert, allowed);
  if (!norm) return false;
  const existing = out.certifications;
  const arr = Array.isArray(existing) ? [...existing] : existing ? [existing] : [];
  if (!arr.includes(norm)) arr.push(norm);
  out.certifications = arr;
  return true;
}

function addProtectionTag(
  out: Record<string, string | string[]>,
  allowed: string[],
  tag: string
): boolean {
  const norm = normalizeToAllowedValue(tag, allowed);
  if (!norm) return false;
  const existing = out.protection_tags;
  const arr = Array.isArray(existing) ? [...existing] : existing ? [existing] : [];
  if (!arr.includes(norm)) arr.push(norm);
  out.protection_tags = arr;
  return true;
}

export function mapImportDraftToAttributes(
  draft: ImportDraftProductV1,
  allowedByKey: Map<string, string[]>
): ImportSuggestionResult {
  const attributes: Record<string, string | string[]> = {};
  const skipped: ImportSuggestionSkip[] = [];

  const trySet = (key: string, raw: string | number | boolean | null | undefined) => {
    if (raw === null || raw === undefined || raw === "") return;
    const allowed = allowedByKey.get(key) ?? [];
    if (allowed.length === 0) {
      skipped.push({ field: key, reason: "no_attribute_definition", value: raw });
      return;
    }
    const norm = normalizeToAllowedValue(raw, allowed);
    if (!norm) {
      skipped.push({ field: key, reason: "no_compatible_allowed_value", value: raw });
      return;
    }
    attributes[key] = norm;
  };

  if (draft.material) trySet("material", draft.material);
  if (draft.color) trySet("color", draft.color);
  if (draft.thickness_mil != null) trySet("thickness_mil", String(draft.thickness_mil));

  if (draft.powder_free === true) trySet("powder", "powder_free");

  if (draft.exam_grade === true || draft.glove_grade) {
    trySet("grade", draft.glove_grade ?? "medical_exam_grade");
  }

  if (draft.latex_free === true) {
    const certAllowed = allowedByKey.get("certifications") ?? [];
    if (!addCert(attributes, certAllowed, "latex_free")) {
      skipped.push({ field: "latex_free", reason: "no_compatible_allowed_value", value: true });
    }
  }

  if (draft.commerce_packaging) {
    const cp = normalizeCommercePackaging(draft.commerce_packaging, draft.category_hint ?? null);
    for (const [key, val] of Object.entries(commercePackagingToFilterAttributes(cp))) {
      trySet(key, val);
    }
  }

  if (draft.certification_slugs?.length) {
    const certAllowed = allowedByKey.get("certifications") ?? [];
    for (const cert of draft.certification_slugs) {
      if (!addCert(attributes, certAllowed, cert)) {
        skipped.push({ field: "certifications", reason: "no_compatible_allowed_value", value: cert });
      }
    }
  } else   if (draft.food_safe === true) {
    const certAllowed = allowedByKey.get("certifications") ?? [];
    if (!addCert(attributes, certAllowed, "fda_food_contact")) {
      skipped.push({ field: "food_safe", reason: "no_compatible_allowed_value", value: true });
    }
  }

  const inferred = inferGloveAttributesFromDraft(draft, allowedByKey);
  Object.assign(attributes, mergeInferredAttributes(attributes, inferred));

  const identity = {
    name: draft.product_name?.trim() || undefined,
    brandName: draft.brand?.trim() || undefined,
    description: draft.description?.trim() || undefined,
    primaryImageUrl: draft.image_url?.trim() || undefined,
  };

  const variants = draft.variants.map((v) => ({
    sizeCode: v.normalized_size_code,
    variantSku: v.sku ?? v.mpn ?? "",
    listPrice: v.list_price ?? "",
  }));

  return { attributes, identity, variants, skipped };
}

export type ImportFieldSuggestion = {
  id: string;
  label: string;
  value: unknown;
  confidence: number;
  source: string;
  target: "identity" | "attributes" | "variants";
  applyKey?: string;
};

export function buildImportFieldSuggestions(draft: ImportDraftProductV1): ImportFieldSuggestion[] {
  const prov = draft.field_provenance ?? {};
  const conf = (key: string) => prov[key]?.confidence ?? draft.confidence.fields[key] ?? 0.5;
  const src = (key: string) => prov[key]?.source ?? "extractor";

  const out: ImportFieldSuggestion[] = [];
  const push = (s: ImportFieldSuggestion) => out.push(s);

  if (draft.product_name) {
    push({ id: "name", label: "Product name", value: draft.product_name, confidence: conf("product_name"), source: src("product_name"), target: "identity", applyKey: "name" });
  }
  if (draft.brand) {
    push({ id: "brand", label: "Brand", value: draft.brand, confidence: conf("brand"), source: src("brand"), target: "identity", applyKey: "brandName" });
  }
  if (draft.material) {
    push({ id: "material", label: "Material", value: draft.material, confidence: conf("material"), source: src("material"), target: "attributes", applyKey: "material" });
  }
  if (draft.color) {
    push({ id: "color", label: "Color", value: draft.color, confidence: conf("color"), source: src("color"), target: "attributes", applyKey: "color" });
  }
  if (draft.thickness_mil != null) {
    push({ id: "thickness_mil", label: "Thickness (mil)", value: draft.thickness_mil, confidence: conf("thickness_mil"), source: src("thickness_mil"), target: "attributes", applyKey: "thickness_mil" });
  }
  if (draft.powder_free === true) {
    push({ id: "powder_free", label: "Powder-free", value: true, confidence: conf("powder_free"), source: src("powder_free"), target: "attributes", applyKey: "powder" });
  }
  if (draft.exam_grade === true || draft.glove_grade) {
    push({ id: "grade", label: "Grade", value: draft.glove_grade ?? "medical_exam_grade", confidence: conf("exam_grade"), source: src("exam_grade"), target: "attributes", applyKey: "grade" });
  }
  if (draft.latex_free === true) {
    push({ id: "latex_free", label: "Latex-free", value: "latex_free", confidence: conf("latex_free"), source: src("latex_free"), target: "attributes", applyKey: "certifications" });
  }
  if (draft.commerce_packaging?.units_per_case != null) {
    push({
      id: "units_per_case",
      label: "Units per case",
      value: draft.commerce_packaging.units_per_case,
      confidence: conf("units_per_case"),
      source: "commerce_packaging",
      target: "attributes",
      applyKey: "units_per_case",
    });
  }
  if (draft.certification_slugs?.length) {
    push({
      id: "certifications",
      label: "Certifications",
      value: draft.certification_slugs.join(", "),
      confidence: conf("certifications"),
      source: src("certifications"),
      target: "attributes",
      applyKey: "certifications",
    });
  } else if (draft.food_safe === true) {
    push({ id: "food_safe", label: "Food safe", value: "fda_food_contact", confidence: conf("food_safe"), source: src("food_safe"), target: "attributes", applyKey: "certifications" });
  }
  if (draft.description) {
    push({ id: "description", label: "Description", value: draft.description, confidence: conf("description"), source: src("description"), target: "identity", applyKey: "description" });
  }
  if (draft.image_url) {
    push({ id: "image_url", label: "Image URL", value: draft.image_url, confidence: conf("image_url"), source: src("image_url"), target: "identity", applyKey: "primaryImageUrl" });
  }
  if (draft.variants.length > 0) {
    push({
      id: "variants",
      label: `Variants (${draft.variants.length} sizes)`,
      value: draft.variants.map((v) => v.normalized_size_code).join(", "),
      confidence: conf("size"),
      source: src("size"),
      target: "variants",
      applyKey: "variants",
    });
  }

  return out;
}

export function isSafeSuggestion(confidence: number): boolean {
  return confidence >= SAFE_CONFIDENCE;
}

export function filterSafeSuggestions(suggestions: ImportFieldSuggestion[]): ImportFieldSuggestion[] {
  return suggestions.filter((s) => isSafeSuggestion(s.confidence));
}

function attributeHasValue(attributes: Record<string, string | string[]>, key: string): boolean {
  const v = attributes[key];
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function storefrontAttributeDisplay(attributes: Record<string, string | string[]>, key: string): string {
  const v = attributes[key];
  if (v === undefined || v === null || v === "") return "—";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

const FILTER_ATTR_LABELS: Record<string, string> = {
  material: "Material",
  color: "Color",
  thickness_mil: "Thickness (mil)",
  powder: "Powder",
  grade: "Grade",
  certifications: "Certifications",
  units_per_case: "Units per case",
  cases_per_pallet: "Cases per pallet",
  pallet_pricing_available: "Pallet pricing",
};

const PACKAGING_FILTER_KEYS = ["units_per_case", "cases_per_pallet", "pallet_pricing_available"] as const;

function filterAttributeValue(attributes: Record<string, string | string[]>, key: string): string {
  const v = attributes[key];
  if (v === undefined || v === null || v === "") return "";
  return Array.isArray(v) ? (v[0] ?? "") : String(v);
}

export type FilterSyncGap = {
  key: string;
  label: string;
  sourceValue: string;
  storefrontValue: string;
  recommendedAction: string;
  /** @deprecated use structured fields */
  importValue?: string;
};

function buildProposedFilterAttributes(
  draft: ImportDraftProductV1,
  allowedByKey: Map<string, string[]>,
  commercePackaging?: CommercePackagingV1 | null
): Record<string, string | string[]> {
  const mapped = mapImportDraftToAttributes(draft, allowedByKey);
  const proposed = { ...mapped.attributes };
  const cp =
    commercePackaging ??
    (draft.commerce_packaging
      ? normalizeCommercePackaging(draft.commerce_packaging, draft.category_hint ?? null)
      : null);
  if (cp) {
    for (const [key, val] of Object.entries(commercePackagingToFilterAttributes(cp))) {
      if (!attributeHasValue(proposed, key)) {
        proposed[key] = val;
      }
    }
  }
  return proposed;
}

/** Import/commerce_packaging evidence exists but storefront filter attrs are empty or stale. */
export function detectFilterSyncGaps(
  draft: ImportDraftProductV1 | null,
  currentAttributes: Record<string, string | string[]>,
  allowedByKey: Map<string, string[]>,
  commercePackaging?: CommercePackagingV1 | null
): FilterSyncGap[] {
  if (!draft) return [];
  const proposed = buildProposedFilterAttributes(draft, allowedByKey, commercePackaging);
  const out: FilterSyncGap[] = [];
  const seen = new Set<string>();

  for (const [key, val] of Object.entries(proposed)) {
    if (attributeHasValue(currentAttributes, key)) continue;
    const display = Array.isArray(val) ? val.join(", ") : String(val);
    const label = FILTER_ATTR_LABELS[key] ?? key;
    out.push({
      key,
      label,
      sourceValue: display,
      storefrontValue: storefrontAttributeDisplay(currentAttributes, key),
      recommendedAction: "Apply filter sync",
      importValue: display,
    });
    seen.add(key);
  }

  if (commercePackaging) {
    const cpAttrs = commercePackagingToFilterAttributes(commercePackaging);
    for (const key of PACKAGING_FILTER_KEYS) {
      const expected = cpAttrs[key];
      if (!expected || seen.has(key)) continue;
      const current = filterAttributeValue(currentAttributes, key);
      if (!current || current === expected) continue;
      out.push({
        key,
        label: FILTER_ATTR_LABELS[key] ?? key,
        sourceValue: expected,
        storefrontValue: storefrontAttributeDisplay(currentAttributes, key),
        recommendedAction: "Apply filter sync",
        importValue: expected,
      });
      seen.add(key);
    }
  }

  return out;
}

/** Apply filter sync gaps (missing or stale packaging-derived attrs) into an editor patch. */
export function buildFilterSyncApplyPatch(
  draft: ImportDraftProductV1 | null,
  currentAttributes: Record<string, string | string[]>,
  allowedByKey: Map<string, string[]>,
  commercePackaging?: CommercePackagingV1 | null,
  gapKey?: string
): { patch: ImportApplyPatch; applied: boolean } {
  const gaps = detectFilterSyncGaps(draft, currentAttributes, allowedByKey, commercePackaging);
  const toApply = gapKey ? gaps.filter((g) => g.key === gapKey) : gaps;
  if (toApply.length === 0) return { patch: {}, applied: false };
  const attributes: Record<string, string | string[]> = {};
  for (const g of toApply) {
    attributes[g.key] = g.sourceValue;
  }
  return { patch: { attributes }, applied: true };
}

/** Merge URL import mapping + inference + filter sync into empty storefront attribute slots. */
export function buildImportAttributeEnrichmentPatch(
  draft: ImportDraftProductV1,
  currentAttributes: Record<string, string | string[]>,
  allowedByKey: Map<string, string[]>,
  commercePackaging?: CommercePackagingV1 | null
): ImportApplyPatch {
  const mapped = mapImportDraftToAttributes(draft, allowedByKey).attributes;
  const inferred = inferGloveAttributesFromDraft(draft, allowedByKey);
  const proposed = { ...mapped, ...mergeInferredAttributes(mapped, inferred) };
  const syncGaps = buildProposedFilterAttributes(draft, allowedByKey, commercePackaging);

  const attributes: Record<string, string | string[]> = {};
  for (const source of [proposed, syncGaps]) {
    for (const [key, val] of Object.entries(source)) {
      const cur = currentAttributes[key] ?? attributes[key];
      if (cur === undefined || cur === "" || (Array.isArray(cur) && cur.length === 0)) {
        attributes[key] = val;
      } else if (Array.isArray(val) && Array.isArray(cur)) {
        const merged = [...cur];
        for (const token of val) {
          if (!merged.includes(token)) merged.push(token);
        }
        if (merged.length > cur.length) attributes[key] = merged;
      }
    }
  }

  return Object.keys(attributes).length > 0 ? { attributes } : {};
}

/** @deprecated use detectFilterSyncGaps */
export function detectMissingImportFilterAttributes(
  draft: ImportDraftProductV1 | null,
  currentAttributes: Record<string, string | string[]>,
  allowedByKey: Map<string, string[]>,
  commercePackaging?: CommercePackagingV1 | null
): Array<{ key: string; label: string; importValue: string }> {
  return detectFilterSyncGaps(draft, currentAttributes, allowedByKey, commercePackaging).map((g) => ({
    key: g.key,
    label: g.label,
    importValue: g.sourceValue,
  }));
}

function identityFieldHasValue(
  key: "name" | "brandName" | "description" | "primaryImageUrl",
  existing?: ImportApplyExistingState
): boolean {
  const v = existing?.identity?.[key];
  return typeof v === "string" && v.trim().length > 0;
}

function patchFromSuggestion(
  draft: ImportDraftProductV1,
  allowedByKey: Map<string, string[]>,
  suggestion: ImportFieldSuggestion,
  existingVariants: EditorVariantRow[],
  options?: ImportPatchOptions
): { patch: ImportApplyPatch; applied: boolean; reason?: string } {
  const mapped = mapImportDraftToAttributes(draft, allowedByKey);
  const patch: ImportApplyPatch = {};
  const preserve = options?.overwriteExisting !== true;

  if (suggestion.target === "identity" && suggestion.applyKey) {
    const identity: NonNullable<ImportApplyPatch["identity"]> = {};
    if (suggestion.applyKey === "name" && draft.product_name) {
      if (preserve && identityFieldHasValue("name", options?.existing)) {
        return { patch, applied: false, reason: "existing_value_preserved" };
      }
      identity.name = draft.product_name;
    }
    if (suggestion.applyKey === "brandName" && draft.brand) {
      if (preserve && identityFieldHasValue("brandName", options?.existing)) {
        return { patch, applied: false, reason: "existing_value_preserved" };
      }
      identity.brandName = draft.brand;
    }
    if (suggestion.applyKey === "description" && draft.description) {
      if (preserve && identityFieldHasValue("description", options?.existing)) {
        return { patch, applied: false, reason: "existing_value_preserved" };
      }
      identity.description = draft.description;
    }
    if (suggestion.applyKey === "primaryImageUrl" && draft.image_url) {
      if (preserve && identityFieldHasValue("primaryImageUrl", options?.existing)) {
        return { patch, applied: false, reason: "existing_value_preserved" };
      }
      identity.primaryImageUrl = draft.image_url;
    }
    if (Object.keys(identity).length === 0) {
      return { patch, applied: false, reason: "no_identity_value" };
    }
    patch.identity = identity;
    return { patch, applied: true };
  }

  if (suggestion.target === "attributes" && suggestion.applyKey) {
    if (preserve && attributeHasValue(options?.existing?.attributes ?? {}, suggestion.applyKey)) {
      return { patch, applied: false, reason: "existing_value_preserved" };
    }
    const val = mapped.attributes[suggestion.applyKey];
    if (val === undefined) {
      return { patch, applied: false, reason: "dictionary_validation_failed" };
    }
    patch.attributes = { [suggestion.applyKey]: val };
    return { patch, applied: true };
  }

  if (suggestion.target === "variants" && draft.variants.length > 0) {
    const proposal = proposeVariantsFromImport(draft, existingVariants, {
      replaceOs: options?.replaceOs ?? false,
    });
    if (preserve && proposal.added.length === 0) {
      return { patch, applied: false, reason: "variants_unchanged" };
    }
    patch.variants = proposal.proposed;
    return { patch, applied: true };
  }

  return { patch, applied: false, reason: "unsupported_target" };
}

/** Apply only confidence-safe suggestions with dictionary validation. Preserves existing values by default. */
export function buildSafeApplyAllPatch(
  draft: ImportDraftProductV1,
  allowedByKey: Map<string, string[]>,
  safeSuggestions: ImportFieldSuggestion[],
  existingVariants: EditorVariantRow[],
  options?: Omit<ImportPatchOptions, "replaceOs"> & { existing?: ImportApplyExistingState }
): { patch: ImportApplyPatch; appliedCount: number } {
  const patch: ImportApplyPatch = {};
  let appliedCount = 0;
  const patchOptions: ImportPatchOptions = {
    replaceOs: false,
    overwriteExisting: options?.overwriteExisting,
    existing: {
      identity: options?.existing?.identity,
      attributes: options?.existing?.attributes,
      variants: options?.existing?.variants ?? existingVariants,
      commercePackaging: options?.existing?.commercePackaging,
    },
  };

  for (const suggestion of safeSuggestions) {
    const result = patchFromSuggestion(draft, allowedByKey, suggestion, existingVariants, patchOptions);
    if (!result.applied) continue;
    appliedCount += 1;
    if (result.patch.identity) {
      patch.identity = { ...patch.identity, ...result.patch.identity };
    }
    if (result.patch.attributes) {
      patch.attributes = { ...patch.attributes, ...result.patch.attributes };
    }
    if (result.patch.variants) {
      patch.variants = result.patch.variants;
    }
  }

  return { patch, appliedCount };
}

export function applySuggestionToPatch(
  draft: ImportDraftProductV1,
  allowedByKey: Map<string, string[]>,
  suggestion: ImportFieldSuggestion,
  existingVariants: EditorVariantRow[],
  options?: ImportPatchOptions
): { patch: ImportApplyPatch; applied: boolean; reason?: string } {
  return patchFromSuggestion(draft, allowedByKey, suggestion, existingVariants, {
    ...options,
    overwriteExisting: options?.overwriteExisting ?? true,
  });
}

/** Apply commerce_packaging from import draft without overwriting admin values by default. */
export function applyCommercePackagingFromDraft(
  draft: ImportDraftProductV1,
  current: CommercePackagingV1,
  options?: { overwrite?: boolean; categorySlug?: string | null }
): { patch: ImportApplyPatch; applied: boolean } {
  const incoming = draft.commerce_packaging;
  if (!incoming) return { patch: {}, applied: false };
  const slug = options?.categorySlug ?? draft.category_hint ?? null;
  const overwrite = options?.overwrite === true;
  const hasExisting =
    current.units_per_case != null ||
    current.case_price != null ||
    current.inners_per_case != null ||
    current.units_per_inner != null;
  if (!overwrite && hasExisting) {
    const merged = mergeCommercePackagingProvenance(current, incoming, false);
    return { patch: { commercePackaging: normalizeCommercePackaging(merged, slug) }, applied: true };
  }
  return {
    patch: { commercePackaging: normalizeCommercePackaging(incoming, slug) },
    applied: true,
  };
}

export function draftHasCommercePackagingSuggestions(draft: ImportDraftProductV1 | null | undefined): boolean {
  if (!draft?.commerce_packaging) return false;
  const cp = draft.commerce_packaging;
  return (
    cp.units_per_case != null ||
    cp.units_per_inner != null ||
    cp.inners_per_case != null ||
    cp.cases_per_pallet != null ||
    cp.case_price != null
  );
}

function parentSkuHasValue(current: string | null | undefined): boolean {
  return typeof current === "string" && current.trim().length > 0;
}

/** Apply high-confidence GLV parent + variant SKU proposals. Preserves existing SKUs by default. */
export function buildSkuProposalApplyPatch(
  draft: ImportDraftProductV1,
  currentInternalSku: string,
  currentVariants: EditorVariantRow[],
  options?: { overwriteExisting?: boolean }
): {
  patch: ImportApplyPatch;
  applied: boolean;
  skippedCount: number;
  reason?: string;
} {
  const proposals = deriveSkuProposalsFromImportDraft(draft);
  if (!isSafeGloveCubsSkuProposal(proposals)) {
    return { patch: {}, applied: false, skippedCount: 0, reason: "sku_proposal_not_safe" };
  }

  const preserve = options?.overwriteExisting !== true;
  const patch: ImportApplyPatch = {};
  let skippedCount = 0;
  let appliedAny = false;

  if (draft.proposed_parent_sku) {
    if (preserve && parentSkuHasValue(currentInternalSku)) {
      skippedCount += 1;
    } else {
      patch.internalSku = draft.proposed_parent_sku;
      appliedAny = true;
    }
  }

  const proposal = proposeVariantsFromImport(draft, currentVariants, { replaceOs: false });
  const mergedVariants = proposal.proposed.map((row) => {
    const draftVar = draft.variants.find(
      (v) => v.normalized_size_code.toUpperCase() === row.sizeCode.trim().toUpperCase()
    );
    const proposed = draftVar?.proposed_glovecubs_sku ?? "";
    const conf = draftVar?.sku_proposal_confidence ?? draft.sku_proposal_confidence ?? 0;
    if (conf < SKU_PROPOSAL_SAFE_CONFIDENCE || !proposed) return row;
    if (preserve && row.variantSku.trim()) {
      skippedCount += 1;
      return row;
    }
    appliedAny = true;
    return { ...row, variantSku: proposed };
  });

  patch.variants = mergedVariants;
  return {
    patch,
    applied: appliedAny,
    skippedCount,
    reason: appliedAny ? undefined : "nothing_to_apply",
  };
}

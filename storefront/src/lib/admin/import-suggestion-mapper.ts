import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import { normalizeToAllowedValue } from "@/lib/admin/product-attribute-upsert";
import { proposeVariantsFromImport, type EditorVariantRow } from "@/lib/admin/variant-generation";

export type ImportApplyExistingState = {
  identity?: Partial<{
    name: string;
    brandName: string;
    description: string;
    primaryImageUrl: string;
  }>;
  attributes?: Record<string, string | string[]>;
  variants?: EditorVariantRow[];
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

/** Import evidence exists in draft but PA/editor state is empty — storefront filter gap. */
export function detectMissingImportFilterAttributes(
  draft: ImportDraftProductV1 | null,
  currentAttributes: Record<string, string | string[]>,
  allowedByKey: Map<string, string[]>
): Array<{ key: string; label: string; importValue: string }> {
  if (!draft) return [];
  const mapped = mapImportDraftToAttributes(draft, allowedByKey);
  const out: Array<{ key: string; label: string; importValue: string }> = [];
  const labels: Record<string, string> = {
    material: "Material",
    color: "Color",
    thickness_mil: "Thickness (mil)",
    powder: "Powder",
    grade: "Grade",
    certifications: "Certifications",
  };
  for (const [key, val] of Object.entries(mapped.attributes)) {
    if (attributeHasValue(currentAttributes, key)) continue;
    const display = Array.isArray(val) ? val.join(", ") : String(val);
    out.push({ key, label: labels[key] ?? key, importValue: display });
  }
  return out;
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

import {
  REQUIRED_GLOVE_ANY_KEYS,
  REQUIRED_GLOVE_USE_ANY_KEYS,
  isGloveAttributeCandidate,
  isMissingGloveAttributesForKeys,
  type GovernanceWarning,
} from "@/lib/admin/catalog-governance";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import {
  detectFilterSyncGaps,
} from "@/lib/admin/import-suggestion-mapper";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import { variantReadinessIssues, type EditorVariantRow } from "@/lib/admin/variant-generation";
import type { CommercePackagingV1 } from "@commerce-packaging/types";
import {
  hasPackagingMathConflict,
  normalizeCommercePackaging,
} from "@commerce-packaging/labels";
import {
  hasVariantListPriceFallback,
  resolveEffectiveCasePrice,
} from "@/lib/admin/commerce-packaging-editor";
import {
  detectSkuCollisionIssues,
  deriveSkuProposalsFromImportDraft,
  isGlvParentSkuFormat,
  isGlvVariantSkuFormat,
  SKU_PROPOSAL_SAFE_CONFIDENCE,
} from "@/lib/admin/variant-sku-intelligence";
import {
  clipboardUrlImportActiveStatusError,
  isUrlImportProductMetadata,
} from "@/lib/admin/clipboard-promote-guards";

export type ReadinessItem = {
  code: string;
  label: string;
  severity: "blocker" | "warning";
  /** Attribute key or editor field token for red highlight (e.g. material, __brand__). */
  fieldKey?: string;
  sourceValue?: string;
  storefrontValue?: string;
  recommendedAction?: string;
};

/** @deprecated use ReadinessItem */
export type PublishBlocker = ReadinessItem;

export type EditorReadinessInput = {
  brandName?: string;
  categoryId: string;
  primaryImageUrl: string;
  publishIntent: boolean;
  quoteOnly: boolean;
  attributes: Record<string, string | string[]>;
  variants: EditorVariantRow[];
  metadata: Record<string, unknown> | null;
  governanceWarnings: GovernanceWarning[];
  attributeDefinitions: AttributeDefinitionRow[];
  dirty: boolean;
  importDraft?: ImportDraftProductV1 | null;
  allowedByKey?: Map<string, string[]>;
  commercePackaging?: CommercePackagingV1 | null;
  internalSku?: string;
  skuCollisions?: {
    existingParentSkus?: Set<string>;
    existingVariantSkus?: Set<string>;
  };
};

export type EditorReadinessResult = {
  warnings: ReadinessItem[];
  publishBlockers: ReadinessItem[];
  draftSaveBlockers: ReadinessItem[];
  all: ReadinessItem[];
};

function attributeKeysWithValues(attributes: Record<string, string | string[]>): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(attributes)) {
    if (v === "" || v === null || (Array.isArray(v) && v.length === 0)) continue;
    keys.add(k);
  }
  return keys;
}

export function computeEditorReadiness(input: EditorReadinessInput): EditorReadinessResult {
  const warnings: ReadinessItem[] = [];
  const publishBlockers: ReadinessItem[] = [];
  const draftSaveBlockers: ReadinessItem[] = [];

  const attrKeys = attributeKeysWithValues(input.attributes);

  if (input.publishIntent && isUrlImportProductMetadata(input.metadata)) {
    const catalogosJobId =
      typeof input.metadata?.catalogos_url_import_job_id === "string"
        ? input.metadata.catalogos_url_import_job_id.trim()
        : "";
    publishBlockers.push({
      code: "url_import_storefront_publish_blocked",
      label: clipboardUrlImportActiveStatusError(input.metadata, "active") ?? "URL-import drafts cannot be published from storefront.",
      severity: "blocker",
      recommendedAction: catalogosJobId
        ? `Open CatalogOS URL import job ${catalogosJobId} → review → publish.`
        : "Complete CatalogOS review and publish (not storefront active status).",
    });
  }

  if (!input.primaryImageUrl.trim()) {
    const item: ReadinessItem = {
      code: "missing_image",
      label: "Primary image required to publish",
      severity: "blocker",
      fieldKey: "__primary_image__",
    };
    if (input.publishIntent) publishBlockers.push(item);
    else warnings.push({ ...item, severity: "warning", label: "Primary image not set" });
  }

  if (!input.categoryId.trim()) {
    const item: ReadinessItem = {
      code: "missing_category",
      label: "Category required to publish",
      severity: "blocker",
      fieldKey: "__category__",
    };
    if (input.publishIntent) publishBlockers.push(item);
    else warnings.push({ ...item, severity: "warning", label: "Category not selected" });
  }

  if (input.publishIntent && !(input.brandName?.trim())) {
    publishBlockers.push({
      code: "missing_brand",
      label: "Brand required to publish",
      severity: "blocker",
      fieldKey: "__brand__",
    });
  }

  const cp = input.commercePackaging ?? null;
  if (input.publishIntent && cp) {
    const casePrice = resolveEffectiveCasePrice(cp, input.variants);
    if (casePrice == null) {
      publishBlockers.push({
        code: "missing_case_price",
        label: "Case product or sale price required to publish (or variant list price)",
        severity: "blocker",
        fieldKey: "__case_price__",
      });
    }
    if (cp.units_per_case == null || cp.units_per_case <= 0) {
      publishBlockers.push({
        code: "missing_units_per_case",
        label: "Units per case required to publish",
        severity: "blocker",
        fieldKey: "__units_per_case__",
      });
    }
  } else if (input.publishIntent && !cp) {
    publishBlockers.push({
      code: "missing_units_per_case",
      label: "Case & Pallet Setup required — units per case missing",
      severity: "blocker",
      fieldKey: "__units_per_case__",
    });
    if (!hasVariantListPriceFallback(input.variants)) {
      publishBlockers.push({
        code: "missing_case_price",
        label: "Case product or sale price required to publish",
        severity: "blocker",
        fieldKey: "__case_price__",
      });
    }
  }

  if (cp) {
    if (cp.sell_by_pallet_enabled) {
      const hasPalletPrice =
        (cp.pallet_price != null && cp.pallet_price > 0) ||
        (cp.compare_at_pallet_price != null && cp.compare_at_pallet_price > 0);
      if (!hasPalletPrice) {
        warnings.push({
          code: "missing_pallet_price",
          label: "Pallet product or sale price not set",
          severity: "warning",
        });
      }
    }
    if (cp.sell_by_pallet_enabled && (cp.cases_per_pallet == null || cp.cases_per_pallet <= 0)) {
      warnings.push({
        code: "missing_cases_per_pallet",
        label: "Cases per pallet not set",
        severity: "warning",
      });
    }
    if (cp.units_per_case_overridden) {
      warnings.push({
        code: "units_per_case_overridden",
        label: "Units per case manually overridden",
        severity: "warning",
      });
    }
    if (cp.units_per_pallet_overridden) {
      warnings.push({
        code: "units_per_pallet_overridden",
        label: "Units per pallet manually overridden",
        severity: "warning",
      });
    }
    for (const prov of Object.values(cp.field_provenance)) {
      if (prov && prov.confidence < 0.7) {
        warnings.push({
          code: "packaging_low_confidence",
          label: "Packaging field parsed with low confidence — verify before publish",
          severity: "warning",
        });
        break;
      }
    }
    if (hasPackagingMathConflict(cp)) {
      warnings.push({
        code: "packaging_math_conflict",
        label: "Case packaging math conflict — inner units × inners ≠ units per case",
        severity: "warning",
      });
    }
    if (cp.parse_warnings.some((w) => /inner packaging/i.test(w))) {
      warnings.push({
        code: "packaging_inner_unknown",
        label: "Parser found case quantity but inner packaging is incomplete",
        severity: "warning",
      });
    }
  }

  if (!input.variants.some((v) => v.sizeCode.trim() || v.variantSku.trim())) {
    const item: ReadinessItem = {
      code: "missing_variants",
      label: "At least one variant with size or SKU required to publish",
      severity: "blocker",
    };
    if (input.publishIntent) publishBlockers.push(item);
    else warnings.push({ ...item, severity: "warning", label: "No variants configured" });
  }

  if (input.publishIntent) {
    for (const v of input.variants) {
      if (!v.variantSku.trim()) {
        publishBlockers.push({
          code: "missing_variant_sku",
          label: `Variant SKU required to publish (${v.sizeCode || "size unknown"})`,
          severity: "blocker",
        });
      }
    }
  }

  const parentSku = input.internalSku?.trim() ?? "";
  if (parentSku && !isGlvParentSkuFormat(parentSku)) {
    warnings.push({
      code: "parent_sku_not_glv_format",
      label: "Parent SKU is not GLV- format",
      severity: "warning",
    });
  }

  if (input.publishIntent && parentSku) {
    for (const v of input.variants) {
      if (v.variantSku.trim() && !isGlvVariantSkuFormat(v.variantSku, parentSku)) {
        warnings.push({
          code: "variant_sku_not_glv_format",
          label: `Variant SKU ${v.variantSku} does not extend parent ${parentSku}`,
          severity: "warning",
        });
      }
    }
  }

  if (input.importDraft) {
    const conf = input.importDraft.sku_proposal_confidence ?? 0;
    if (input.importDraft.proposed_parent_sku && conf > 0 && conf < SKU_PROPOSAL_SAFE_CONFIDENCE) {
      warnings.push({
        code: "low_confidence_parent_sku_proposal",
        label: "Parent SKU proposal needs review (low confidence)",
        severity: "warning",
      });
    }
    for (const dv of input.importDraft.variants) {
      const vc = dv.sku_proposal_confidence ?? conf;
      if (dv.proposed_glovecubs_sku && vc > 0 && vc < SKU_PROPOSAL_SAFE_CONFIDENCE) {
        warnings.push({
          code: "low_confidence_variant_sku_proposal",
          label: `Variant SKU proposal for ${dv.normalized_size_code} needs review`,
          severity: "warning",
        });
        break;
      }
    }
  }

  for (const v of input.variants) {
    const draftVar = input.importDraft?.variants.find(
      (d) => d.normalized_size_code.toUpperCase() === v.sizeCode.trim().toUpperCase()
    );
    const mfr = draftVar?.manufacturer_sku?.trim().toUpperCase();
    if (mfr && v.variantSku.trim().toUpperCase() === mfr) {
      const item: ReadinessItem = {
        code: "manufacturer_sku_used_as_variant_sku",
        label: "Manufacturer SKU must not be used as GloveCubs variant SKU",
        severity: "blocker",
      };
      if (input.publishIntent) publishBlockers.push(item);
      else warnings.push({ ...item, severity: "warning" });
      break;
    }
  }

  if (input.skuCollisions) {
    const collisionIssues = detectSkuCollisionIssues({
      parentSku: parentSku || null,
      variantSkus: input.variants.map((v) => v.variantSku),
      existingParentSkus: input.skuCollisions.existingParentSkus,
      existingVariantSkus: input.skuCollisions.existingVariantSkus,
      manufacturerSkusByVariant: input.variants.map((v) => {
        const draftVar = input.importDraft?.variants.find(
          (d) => d.normalized_size_code.toUpperCase() === v.sizeCode.trim().toUpperCase()
        );
        return draftVar?.manufacturer_sku ?? "";
      }),
    });
    for (const issue of collisionIssues) {
      const item: ReadinessItem = {
        code: issue.code,
        label: issue.label,
        severity: issue.severity,
      };
      if (issue.severity === "blocker") {
        draftSaveBlockers.push(item);
        if (input.publishIntent) publishBlockers.push(item);
      } else {
        warnings.push(item);
      }
    }
  }

  if (input.publishIntent && isGloveAttributeCandidate(input.metadata)) {
    if (isMissingGloveAttributesForKeys(attrKeys)) {
      publishBlockers.push({
        code: "missing_glove_attributes",
        label: "Missing required glove filter attributes (material, grade/powder/thickness, industry or use)",
        severity: "blocker",
      });
      if (!attrKeys.has("material")) {
        publishBlockers.push({
          code: "missing_glove_material",
          label: "Material required for publish",
          severity: "blocker",
          fieldKey: "material",
        });
      }
      if (!REQUIRED_GLOVE_ANY_KEYS.some((k) => attrKeys.has(k))) {
        for (const k of REQUIRED_GLOVE_ANY_KEYS) {
          if (!attrKeys.has(k)) {
            publishBlockers.push({
              code: `missing_glove_${k}`,
              label: `${k.replace(/_/g, " ")} required for publish`,
              severity: "blocker",
              fieldKey: k,
            });
          }
        }
      }
      if (!REQUIRED_GLOVE_USE_ANY_KEYS.some((k) => attrKeys.has(k))) {
        for (const k of REQUIRED_GLOVE_USE_ANY_KEYS) {
          if (!attrKeys.has(k)) {
            publishBlockers.push({
              code: `missing_glove_${k}`,
              label: `${k.replace(/_/g, " ")} required for publish`,
              severity: "blocker",
              fieldKey: k,
            });
          }
        }
      }
    }
  }

  if (input.publishIntent) {
    for (const def of input.attributeDefinitions) {
      if (!def.isRequired) continue;
      const v = input.attributes[def.attributeKey];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
        publishBlockers.push({
          code: `missing_required_${def.attributeKey}`,
          label: `Required attribute: ${def.label}`,
          severity: "blocker",
          fieldKey: def.attributeKey,
        });
      }
    }
  }

  for (const issue of variantReadinessIssues(input.variants)) {
    const item: ReadinessItem = {
      code: "variant_issue",
      label: issue,
      severity: issue.includes("Duplicate") ? "blocker" : "warning",
    };
    if (item.severity === "blocker") {
      draftSaveBlockers.push(item);
      if (input.publishIntent) publishBlockers.push(item);
    } else {
      warnings.push(item);
    }
  }

  if (input.importDraft && input.allowedByKey) {
    const gaps = detectFilterSyncGaps(
      input.importDraft,
      input.attributes,
      input.allowedByKey,
      input.commercePackaging
    );
    for (const g of gaps) {
      warnings.push({
        code: `missing_filter_${g.key}`,
        label: `${g.label} missing from storefront filters (source: ${g.sourceValue})`,
        severity: "warning",
        sourceValue: g.sourceValue,
        storefrontValue: g.storefrontValue,
        recommendedAction: g.recommendedAction,
      });
    }
  }

  if (input.importDraft) {
    const proposals = deriveSkuProposalsFromImportDraft(input.importDraft);
    const proposedSkus = proposals.variants
      .map((v) => v.proposed_glovecubs_sku?.trim().toUpperCase())
      .filter(Boolean) as string[];
    if (proposedSkus.length > 0 && new Set(proposedSkus).size !== proposedSkus.length) {
      const item: ReadinessItem = {
        code: "duplicate_proposed_variant_sku",
        label: "Duplicate proposed variant SKUs — resolve before applying SKU proposals",
        severity: "blocker",
      };
      draftSaveBlockers.push(item);
      if (input.publishIntent) publishBlockers.push(item);
    }
  }

  for (const w of input.governanceWarnings) {
    if (w.code === "missing_images" && input.primaryImageUrl.trim()) continue;
    if (w.code === "no_active_variants" && input.variants.some((v) => v.sizeCode.trim() || v.variantSku.trim())) {
      continue;
    }
    const item: ReadinessItem = {
      code: w.code,
      label: w.label,
      severity:
        input.publishIntent && (w.code === "orphan_category" || w.code === "duplicate_gtin")
          ? "blocker"
          : "warning",
    };
    if (item.severity === "blocker") publishBlockers.push(item);
    else warnings.push(item);
  }

  if (input.dirty) {
    warnings.push({ code: "unsaved_changes", label: "Unsaved changes", severity: "warning" });
  }

  const all = [...publishBlockers, ...draftSaveBlockers, ...warnings];
  return { warnings, publishBlockers, draftSaveBlockers, all };
}

/** @deprecated use computeEditorReadiness */
export function computeEditorPublishBlockers(input: Omit<EditorReadinessInput, "publishIntent" | "importDraft" | "allowedByKey"> & { status: "draft" | "active" }): ReadinessItem[] {
  return computeEditorReadiness({
    ...input,
    publishIntent: input.status === "active",
  }).all;
}

export function hasPublishBlockers(result: EditorReadinessResult | ReadinessItem[]): boolean {
  const items = Array.isArray(result) ? result : result.publishBlockers;
  return items.some((b) => b.severity === "blocker");
}

export function hasDraftSaveBlockers(result: EditorReadinessResult): boolean {
  return result.draftSaveBlockers.some((b) => b.severity === "blocker");
}

export function getBlockingFieldKeys(result: EditorReadinessResult): Set<string> {
  const keys = new Set<string>();
  for (const b of result.publishBlockers) {
    if (b.fieldKey) keys.add(b.fieldKey);
  }
  return keys;
}

export function readinessLabel(result: EditorReadinessResult | ReadinessItem[]): string {
  const blockers = Array.isArray(result) ? result.filter((b) => b.severity === "blocker") : result.publishBlockers;
  if (blockers.length === 0) return "Ready to publish";
  if (blockers.length === 1) return blockers[0]!.label;
  return `${blockers.length} publish blockers`;
}

export function readinessDetail(result: EditorReadinessResult): string {
  if (result.publishBlockers.length === 0) return "Ready to publish";
  return result.publishBlockers.map((b) => b.label).join(" · ");
}

export { REQUIRED_GLOVE_ANY_KEYS, REQUIRED_GLOVE_USE_ANY_KEYS };

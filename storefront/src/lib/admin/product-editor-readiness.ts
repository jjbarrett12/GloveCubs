import {
  REQUIRED_GLOVE_ANY_KEYS,
  REQUIRED_GLOVE_USE_ANY_KEYS,
  isGloveAttributeCandidate,
  isMissingGloveAttributesForKeys,
  type GovernanceWarning,
} from "@/lib/admin/catalog-governance";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import {
  detectMissingImportFilterAttributes,
  type ImportFieldSuggestion,
} from "@/lib/admin/import-suggestion-mapper";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import { variantReadinessIssues, type EditorVariantRow } from "@/lib/admin/variant-generation";

export type ReadinessItem = {
  code: string;
  label: string;
  severity: "blocker" | "warning";
};

/** @deprecated use ReadinessItem */
export type PublishBlocker = ReadinessItem;

export type EditorReadinessInput = {
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

  if (!input.primaryImageUrl.trim()) {
    const item: ReadinessItem = {
      code: "missing_image",
      label: "Primary image required to publish",
      severity: "blocker",
    };
    if (input.publishIntent) publishBlockers.push(item);
    else warnings.push({ ...item, severity: "warning", label: "Primary image not set" });
  }

  if (!input.categoryId.trim()) {
    const item: ReadinessItem = {
      code: "missing_category",
      label: "Category required to publish",
      severity: "blocker",
    };
    if (input.publishIntent) publishBlockers.push(item);
    else warnings.push({ ...item, severity: "warning", label: "Category not selected" });
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

  if (input.publishIntent && isGloveAttributeCandidate(input.metadata)) {
    if (isMissingGloveAttributesForKeys(attrKeys)) {
      publishBlockers.push({
        code: "missing_glove_attributes",
        label: "Missing required glove filter attributes (material, grade/powder/thickness, industry or use)",
        severity: "blocker",
      });
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
    const missing = detectMissingImportFilterAttributes(
      input.importDraft,
      input.attributes,
      input.allowedByKey
    );
    for (const m of missing) {
      warnings.push({
        code: `missing_filter_${m.key}`,
        label: `${m.label} missing from storefront filters (import has: ${m.importValue})`,
        severity: "warning",
      });
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

export function readinessLabel(result: EditorReadinessResult | ReadinessItem[]): string {
  const blockers = Array.isArray(result) ? result.filter((b) => b.severity === "blocker") : result.publishBlockers;
  if (blockers.length === 0) return "Ready to publish";
  if (blockers.length === 1) return blockers[0]!.label;
  return `${blockers.length} publish blockers`;
}

export { REQUIRED_GLOVE_ANY_KEYS, REQUIRED_GLOVE_USE_ANY_KEYS };

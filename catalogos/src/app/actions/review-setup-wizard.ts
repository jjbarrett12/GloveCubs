"use server";

import { getSupabaseCatalogos } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { logAdminCatalogAudit } from "@/lib/review/admin-audit";
import { evaluatePublishReadiness } from "@/lib/review/publish-guards";
import { getReviewDictionaryForCategory, getCategoryIdBySlug } from "@/lib/catalogos/dictionary-service";
import { isMultiSelectAttribute } from "@/lib/catalogos/attribute-validation";
import { flattenV2Metadata } from "@/lib/catalog/v2-master-product";
import {
  buildProductSetupApplyCandidates,
  filterApplyCandidates,
  isSafeProductSetupApplyCandidate,
} from "@/lib/product-extraction/product-setup-apply-candidates";
import { applyProductSetupCandidatesToNormalizedData } from "@/lib/product-extraction/product-setup-apply-service";
import {
  buildProductSetupWizardReadiness,
  resolveWizardContractSummary,
} from "@/lib/product-extraction/product-setup-wizard-readiness";
import type { ProductSetupWizardReadinessV1 } from "@/lib/product-extraction/product-setup-wizard-readiness";

const REVIEW_PATHS = [
  "/dashboard/review",
  "/dashboard/batches",
  "/dashboard/publish",
  "/dashboard/ingestion",
  "/dashboard/products/quick-add",
];

async function revalidateReview() {
  for (const p of REVIEW_PATHS) revalidatePath(p);
}

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
        if (s && !allowed.includes(s)) {
          return { valid: false, error: `Invalid value for ${key}: "${s}"` };
        }
      }
    } else {
      const s = String(value).trim();
      if (s && !allowed.includes(s)) {
        return { valid: false, error: `Invalid value for ${key}: "${s}"` };
      }
    }
  }
  return { valid: true };
}

export type ApplyProductSetupWizardFieldsResult = {
  success: boolean;
  error?: string;
  appliedFields: string[];
  skippedFields: Array<{ fieldKey: string; reason: string }>;
  errors: Array<{ fieldKey: string; error: string }>;
  readiness?: ProductSetupWizardReadinessV1;
};

export async function applyProductSetupWizardFields(
  normalizedId: string,
  options: {
    fieldKeys?: string[];
    sectionKey?: string;
    applyAllSafe?: boolean;
    skipRevalidate?: boolean;
  } = {}
): Promise<ApplyProductSetupWizardFieldsResult> {
  const supabase = getSupabaseCatalogos(true);
  const { data: row, error: fetchErr } = await supabase
    .from("supplier_products_normalized")
    .select("id, normalized_data, attributes, master_product_id, raw_id")
    .eq("id", normalizedId)
    .single();

  if (fetchErr || !row) {
    return {
      success: false,
      error: fetchErr?.message ?? "Staged row not found",
      appliedFields: [],
      skippedFields: [],
      errors: [],
    };
  }

  const nd = (row.normalized_data as Record<string, unknown>) ?? {};
  let rawPayload: Record<string, unknown> = {};
  if (row.raw_id) {
    const { data: rawRow } = await supabase
      .from("supplier_products_raw")
      .select("raw_payload")
      .eq("id", row.raw_id as string)
      .maybeSingle();
    rawPayload = (rawRow?.raw_payload as Record<string, unknown>) ?? {};
  }

  const contractSummary = resolveWizardContractSummary(nd, rawPayload);
  if (!contractSummary) {
    return {
      success: false,
      error: "No product setup contract available",
      appliedFields: [],
      skippedFields: [],
      errors: [],
    };
  }

  const publishReadiness = await evaluatePublishReadiness(normalizedId);
  const readiness = buildProductSetupWizardReadiness({
    contractSummary,
    normalizedData: nd,
    publishReadiness,
  });

  const allCandidates = buildProductSetupApplyCandidates(readiness, contractSummary, nd);
  let selected = allCandidates;

  if (options.applyAllSafe) {
    selected = filterApplyCandidates(allCandidates, { safeOnly: true });
  } else if (options.sectionKey) {
    selected = filterApplyCandidates(allCandidates, { sectionKey: options.sectionKey, safeOnly: true });
  } else if (options.fieldKeys?.length) {
    selected = filterApplyCandidates(allCandidates, { fieldKeys: options.fieldKeys });
  } else {
    return {
      success: false,
      error: "Specify fieldKeys, sectionKey, or applyAllSafe",
      appliedFields: [],
      skippedFields: [],
      errors: [],
    };
  }

  const toApply = selected.filter((c) =>
    isSafeProductSetupApplyCandidate(c, { hasEvidence: Boolean(c.evidenceText?.trim()) })
  );

  const attributePatches: Record<string, unknown> = {};
  for (const c of toApply.filter((x) => x.mutationKind === "attribute" && x.normalizedValue)) {
    const key =
      c.fieldKey === "thicknessMil"
        ? "thickness_mil"
        : c.fieldKey === "cuffType"
          ? "cuff_style"
          : c.fieldKey === "powderFree"
            ? "powder"
            : c.fieldKey;
    attributePatches[key] = c.normalizedValue;
  }

  if (Object.keys(attributePatches).length) {
    let categoryId: string | null = null;
    if (row.master_product_id) {
      const { data: prod } = await supabase
        .schema("catalog_v2")
        .from("catalog_products")
        .select("metadata")
        .eq("id", row.master_product_id as string)
        .single();
      const cid = flattenV2Metadata((prod as { metadata?: unknown } | null)?.metadata).category_id;
      if (cid != null) categoryId = String(cid);
    }
    if (!categoryId && (nd.category_slug ?? nd.category)) {
      categoryId = await getCategoryIdBySlug(String(nd.category_slug ?? nd.category));
    }
    if (categoryId) {
      const dict = await getReviewDictionaryForCategory(categoryId);
      const validation = validateAttributesAgainstDictionary(attributePatches, dict.allowedByKey);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          appliedFields: [],
          skippedFields: toApply.map((c) => ({
            fieldKey: c.fieldKey,
            reason: validation.error ?? "Validation failed",
          })),
          errors: [],
        };
      }
    }
  }

  const galleryUrls = contractSummary.images.selectedGalleryUrls;
  const applyResult = applyProductSetupCandidatesToNormalizedData(nd, toApply, { galleryUrls });

  const { error: updateErr } = await supabase
    .from("supplier_products_normalized")
    .update({
      normalized_data: applyResult.normalizedData,
      attributes:
        (applyResult.normalizedData.filter_attributes as Record<string, unknown>) ??
        (applyResult.normalizedData.attributes as Record<string, unknown>) ??
        row.attributes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedId);

  if (updateErr) {
    return {
      success: false,
      error: updateErr.message,
      appliedFields: applyResult.appliedFields,
      skippedFields: applyResult.skippedFields,
      errors: applyResult.errors,
    };
  }

  await logAdminCatalogAudit({
    normalizedId,
    action: "product_setup_wizard_apply",
    details: {
      appliedFields: applyResult.appliedFields,
      skippedFields: applyResult.skippedFields,
      sectionKey: options.sectionKey,
      applyAllSafe: options.applyAllSafe ?? false,
    },
  });

  if (!options.skipRevalidate) await revalidateReview();

  const refreshedReadiness = buildProductSetupWizardReadiness({
    contractSummary,
    normalizedData: applyResult.normalizedData,
    publishReadiness: await evaluatePublishReadiness(normalizedId),
  });

  return {
    success: applyResult.errors.length === 0,
    appliedFields: applyResult.appliedFields,
    skippedFields: applyResult.skippedFields,
    errors: applyResult.errors,
    readiness: refreshedReadiness,
  };
}

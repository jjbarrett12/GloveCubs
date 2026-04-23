/**
 * Pre-flight checks before runPublish: status, master link, dictionary (publish_safe), case-cost rules.
 * Tier 1 ("ready for publish attempt") = canPublish here; Tier 2 = runPublish success.
 */

import { getStagingById } from "@/lib/review/data";
import { buildPublishInputFromStaged } from "@/lib/publish/publish-service";
import { publishSafe, stageSafe } from "@/lib/catalogos/validation-modes";
import type { CategorySlug } from "@/lib/catalogos/attribute-dictionary-types";
import { DEFAULT_PRODUCT_TYPE_KEY, isImplementedProductTypeKey } from "@/lib/product-types";

/** Blockers grouped for operator UI (subset of full publish pipeline). */
export interface PublishReadinessBlockerSections {
  workflow: string[];
  staging_validation: string[];
  missing_required_attributes: string[];
  case_pricing: string[];
}

export interface PublishReadiness {
  canPublish: boolean;
  blockers: string[];
  warnings: string[];
  /** Resolved slug used for publish_safe (same as buildPublishInputFromStaged when row exists). */
  categorySlug: string;
  /** False when slug is not disposable_gloves / reusable_work_gloves — server does not enforce required attribute keys. */
  categoryRequirementsEnforced: boolean;
  blockerSections: PublishReadinessBlockerSections;
  /**
   * Steps that always run after a publish click but are not validated by this preflight.
   * Operators should not treat Tier 1 alone as a guarantee those steps succeeded.
   */
  postClickPipelineNotes: readonly string[];
}

function emptySections(): PublishReadinessBlockerSections {
  return {
    workflow: [],
    staging_validation: [],
    missing_required_attributes: [],
    case_pricing: [],
  };
}

function flattenBlockers(s: PublishReadinessBlockerSections): string[] {
  return [...s.workflow, ...s.staging_validation, ...s.missing_required_attributes, ...s.case_pricing];
}

const POST_CLICK_NOTES = [
  "Attribute sync writes canonical catalogos.product_attributes from staged filter attributes.",
  "Snapshot rebuilds catalogos.products.attributes (strict mirror). Conflicting single-select rows in the DB will fail here.",
  "Supplier offer upsert and storefront search sync run after attributes — preflight does not execute them. V2: no public.products bridge.",
] as const;

export async function evaluatePublishReadiness(normalizedId: string): Promise<PublishReadiness> {
  const sections = emptySections();
  const warnings: string[] = [];
  let categorySlug = DEFAULT_PRODUCT_TYPE_KEY;
  let categoryRequirementsEnforced = true;

  const row = await getStagingById(normalizedId);
  if (!row) {
    sections.staging_validation.push("Staged row not found");
    return {
      canPublish: false,
      blockers: flattenBlockers(sections),
      warnings,
      categorySlug,
      categoryRequirementsEnforced,
      blockerSections: sections,
      postClickPipelineNotes: POST_CLICK_NOTES,
    };
  }

  const status = row.status as string;
  if (status !== "approved" && status !== "merged") {
    sections.workflow.push(`Status must be approved or merged (current: ${status})`);
  }

  const masterId = row.master_product_id as string | null | undefined;
  if (!masterId) sections.workflow.push("Link a master product (approve, merge, or create master) before publishing.");

  const nd = (row.normalized_data as Record<string, unknown>) ?? {};
  const name = nd.name;
  if (name == null || (typeof name === "string" && !name.trim())) {
    sections.staging_validation.push("Normalized name is required for publish.");
  }
  const validationErrors = nd.validation_errors as unknown[] | undefined;
  if (Array.isArray(validationErrors) && validationErrors.length > 0) {
    sections.staging_validation.push("Row has validation_errors; fix or clear before publish.");
  }

  const input = buildPublishInputFromStaged(normalizedId, row, { masterProductId: masterId ?? undefined });
  if (!input) {
    sections.staging_validation.push("Missing supplier_id or raw_id");
    return {
      canPublish: false,
      blockers: flattenBlockers(sections),
      warnings,
      categorySlug,
      categoryRequirementsEnforced,
      blockerSections: sections,
      postClickPipelineNotes: POST_CLICK_NOTES,
    };
  }

  categorySlug = (input.categorySlug ?? DEFAULT_PRODUCT_TYPE_KEY) as string;
  categoryRequirementsEnforced = isImplementedProductTypeKey(categorySlug);

  if (!categoryRequirementsEnforced) {
    warnings.push(
      `No attribute requirements enforced for category slug "${categorySlug}" (not an implemented product type). publish_safe will not require category-specific merchandising keys.`
    );
  }

  if (input.pricingCaseCostUnavailable) {
    sections.case_pricing.push(
      "Cannot publish: GloveCubs sells by the case only. Normalized case cost could not be computed. Fix packaging/conversion data or pricing basis."
    );
  }

  const publishCheck = publishSafe(categorySlug as CategorySlug, input.stagedFilterAttributes ?? {});
  if (!publishCheck.publishable) {
    sections.missing_required_attributes.push(
      publishCheck.error ?? "Required attributes missing or invalid for this category."
    );
  }

  const stageCheck = stageSafe(categorySlug as CategorySlug, input.stagedFilterAttributes ?? {});
  if (stageCheck.missing_strongly_preferred.length > 0) {
    warnings.push(`Strongly preferred attributes missing (non-blocking): ${stageCheck.missing_strongly_preferred.join(", ")}`);
  }

  const blockers = flattenBlockers(sections);
  return {
    canPublish: blockers.length === 0,
    blockers,
    warnings,
    categorySlug,
    categoryRequirementsEnforced,
    blockerSections: sections,
    postClickPipelineNotes: POST_CLICK_NOTES,
  };
}

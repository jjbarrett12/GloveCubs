import type { PublishReadiness } from "@/lib/review/publish-guards";
import { computeImportAutoPricing } from "@/lib/ingestion/import-pricing";

/** Sample import pricing for staging rows that must support “create master” (list_price_minor derivation). */
export const QUICK_ADD_SAMPLE_IMPORT_AUTO_PRICING = computeImportAutoPricing({
  supplierCost: 10,
  categorySlug: "disposable_gloves",
  filterAttributes: { product_type: "nitrile" },
});
if (!QUICK_ADD_SAMPLE_IMPORT_AUTO_PRICING) {
  throw new Error("quick-add-test-fixtures: computeImportAutoPricing returned null");
}

/** Supplier cost + import_auto_pricing so Quick Add “create master” and list-price paths are valid. */
export function quickAddPricingFields(args: { supplierCost: number; categorySlug?: string }) {
  const categorySlug = args.categorySlug ?? "disposable_gloves";
  const import_auto_pricing = computeImportAutoPricing({
    supplierCost: args.supplierCost,
    categorySlug,
    filterAttributes: { product_type: "nitrile" },
  });
  if (!import_auto_pricing) {
    throw new Error(`quick-add-test-fixtures: computeImportAutoPricing returned null for cost ${args.supplierCost}`);
  }
  return {
    supplier_cost: args.supplierCost,
    category_slug: categorySlug,
    filter_attributes: { product_type: "nitrile" },
    normalized_case_cost: args.supplierCost,
    pricing: { sell_unit: "case" as const, normalized_case_cost: args.supplierCost },
    import_auto_pricing,
  };
}

const NOTES = [
  "Attribute sync writes canonical catalogos.product_attributes from staged filter attributes.",
] as const;

export function makePublishReadiness(overrides: Partial<PublishReadiness> = {}): PublishReadiness {
  return {
    canPublish: false,
    blockers: [],
    warnings: [],
    categorySlug: "disposable_gloves",
    categoryRequirementsEnforced: true,
    blockerSections: {
      workflow: [],
      staging_validation: [],
      missing_required_attributes: [],
      case_pricing: [],
    },
    postClickPipelineNotes: NOTES,
    ...overrides,
  };
}

export type StagingDetailRow = Record<string, unknown> & {
  publish_readiness?: PublishReadiness;
  updated_at?: string;
  status?: string;
  master_product_id?: string | null;
  search_publish_status?: string | null;
};

export function makeStagingDetail(id: string, overrides: Partial<StagingDetailRow> = {}): StagingDetailRow {
  const base: StagingDetailRow = {
    id,
    batch_id: "batch-1",
    raw_id: "raw-1",
    supplier_id: "sup-1",
    normalized_data: {
      name: "Test Glove",
      supplier_sku: "SKU-1",
      sku: "SKU-1",
      supplier_cost: 10,
      category_slug: "disposable_gloves",
      filter_attributes: { product_type: "nitrile" },
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
      import_auto_pricing: QUICK_ADD_SAMPLE_IMPORT_AUTO_PRICING,
    },
    attributes: {},
    updated_at: "2026-01-01T12:00:00.000Z",
    status: "pending",
    master_product_id: null,
    search_publish_status: "staged",
    publish_readiness: makePublishReadiness({
      canPublish: false,
      blockerSections: {
        workflow: ["Status must be approved or merged (current: pending)", "Link a master product"],
        staging_validation: [],
        missing_required_attributes: [],
        case_pricing: [],
      },
    }),
  };
  return { ...base, ...overrides };
}

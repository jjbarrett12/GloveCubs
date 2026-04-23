import type { PublishReadiness } from "@/lib/review/publish-guards";

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
      category_slug: "disposable_gloves",
      filter_attributes: {},
      normalized_case_cost: 10,
      pricing: { sell_unit: "case", normalized_case_cost: 10 },
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

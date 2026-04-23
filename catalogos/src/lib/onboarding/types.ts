/**
 * Supplier Onboarding Agent — domain types.
 */

export const ONBOARDING_STATUS = [
  "initiated",
  "waiting_for_supplier",
  "ready_for_review",
  "approved",
  "created_supplier",
  "feed_created",
  "ingestion_triggered",
  "completed",
  "rejected",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUS)[number];

export const FEED_TYPE = ["url", "csv", "api", "pdf", "google_sheet"] as const;
export type FeedType = (typeof FEED_TYPE)[number];

export interface ContactInfo {
  contact_name?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  role?: string | null;
}

export type SubmittedVia = "admin" | "supplier_portal";

export interface SupplierOnboardingRequestRow {
  id: string;
  company_name: string;
  website: string | null;
  contact_info: ContactInfo | Record<string, unknown>;
  feed_type: FeedType | null;
  feed_url: string | null;
  feed_config: Record<string, unknown>;
  pricing_basis_hints: string | null;
  packaging_hints: string | null;
  categories_supplied: string[];
  notes: string | null;
  status: OnboardingStatus;
  source_lead_id: string | null;
  assigned_owner_id: string | null;
  created_supplier_id: string | null;
  created_feed_id: string | null;
  created_at: string;
  updated_at: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  requested_info_notes: string | null;
  submitted_via: SubmittedVia;
}

export interface SupplierOnboardingStepRow {
  id: string;
  request_id: string;
  step_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SupplierOnboardingFileRow {
  id: string;
  request_id: string;
  storage_key: string;
  filename: string;
  content_type: string | null;
  file_kind: "catalog_pdf" | "catalog_csv" | "price_list" | "other" | null;
  created_at: string;
}

/**
 * Supplier Discovery Agent — domain types.
 * Status and enums align with DB check constraints.
 */

export const LEAD_STATUS = [
  "new",
  "reviewed",
  "contacted",
  "onboarded",
  "rejected",
] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const RUN_STATUS = ["running", "completed", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUS)[number];

export interface SupplierLeadRow {
  id: string;
  company_name: string;
  website: string | null;
  domain: string | null;
  source_url: string | null;
  discovery_method: string;
  product_categories: string[];
  catalog_signals: CatalogSignal[];
  api_signal: boolean;
  csv_signal: boolean;
  pdf_catalog_signal: boolean;
  lead_score: number;
  status: LeadStatus;
  notes: string | null;
  promoted_supplier_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogSignal {
  type: string;
  url?: string;
  label?: string;
}

export interface SupplierLeadContactRow {
  id: string;
  supplier_lead_id: string;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierDiscoveryRunRow {
  id: string;
  adapter_name: string;
  status: RunStatus;
  config: Record<string, unknown>;
  leads_created: number;
  leads_duplicate_skipped: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface SupplierDiscoveryEventRow {
  id: string;
  run_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  supplier_lead_id: string | null;
  created_at: string;
}

/** Input to create or update a lead (normalized for DB). */
export interface SupplierLeadInsert {
  company_name: string;
  website?: string | null;
  domain?: string | null;
  source_url?: string | null;
  discovery_method: string;
  product_categories?: string[];
  catalog_signals?: CatalogSignal[];
  api_signal?: boolean;
  csv_signal?: boolean;
  pdf_catalog_signal?: boolean;
  lead_score?: number;
  status?: LeadStatus;
  notes?: string | null;
}

/** Raw candidate from an adapter (before normalization and dedupe). */
export interface RawLeadCandidate {
  company_name: string;
  website?: string | null;
  domain?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  source_url?: string | null;
  discovery_method: string;
  product_categories?: string[];
  catalog_signals?: CatalogSignal[];
  api_signal?: boolean;
  csv_signal?: boolean;
  pdf_catalog_signal?: boolean;
}

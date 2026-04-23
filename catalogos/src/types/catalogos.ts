/**
 * CatalogOS domain types (align with Supabase schema).
 * DB types use snake_case; we use these for app/service layer.
 */

export type FeedType = "url" | "csv" | "api";
export type BatchStatus = "running" | "completed" | "failed" | "cancelled";
export type StagingStatus = "pending" | "approved" | "rejected" | "merged";
export type ValueType = "string" | "number" | "boolean" | "string_array";

export interface Supplier {
  id: number;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierFeed {
  id: number;
  supplier_id: number;
  feed_type: FeedType;
  config: Record<string, unknown>;
  schedule_cron: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImportBatch {
  id: number;
  feed_id: number | null;
  supplier_id: number;
  status: BatchStatus;
  started_at: string;
  completed_at: string | null;
  stats: BatchStats;
  created_at: string;
}

export interface BatchStats {
  raw_count?: number;
  staged_count?: number;
  matched_count?: number;
  error_count?: number;
}

export interface RawSupplierProduct {
  id: number;
  batch_id: number;
  supplier_id: number;
  external_id: string;
  raw_json: Record<string, unknown>;
  checksum: string | null;
  created_at: string;
}

export interface AttributeDefinition {
  id: number;
  category: string;
  attribute_key: string;
  label: string;
  value_type: ValueType;
  allowed_values: string[] | number[] | null;
  created_at: string;
}

export interface MasterProduct {
  id: number;
  sku: string;
  name: string;
  category: string;
  attributes: Record<string, unknown>;
  published_product_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface StagingProduct {
  id: number;
  batch_id: number;
  raw_id: number;
  supplier_id: number;
  normalized_json: Record<string, unknown>;
  attributes_json: Record<string, unknown>;
  master_product_id: number | null;
  match_confidence: number | null;
  status: StagingStatus;
  created_at: string;
  updated_at: string;
}

export interface SupplierOffer {
  id: number;
  supplier_id: number;
  master_product_id: number;
  supplier_sku: string;
  cost: number;
  lead_time_days: number | null;
  raw_id: number | null;
  staging_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface PricingRule {
  id: number;
  rule_type: "default_margin" | "category_margin" | "supplier_margin" | "product_fixed";
  scope_category: string | null;
  scope_supplier_id: number | null;
  scope_master_product_id: number | null;
  margin_percent: number | null;
  fixed_price: number | null;
  priority: number;
  created_at: string;
}

export interface JobLog {
  id: number;
  batch_id: number;
  step: string;
  status: "started" | "success" | "failed";
  message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface PublishLog {
  id: number;
  staging_id: number;
  master_product_id: number;
  published_product_id: number | null;
  published_at: string;
  published_by: string | null;
}

/** Disposable glove normalized attributes (Phase 1) */
export interface DisposableGloveAttributes {
  product_type?: string;
  material?: string;
  color?: string;
  size?: string;
  thickness_mil?: number;
  powder_free?: boolean;
  latex_free?: boolean;
  case_qty?: number;
  medical_grade?: boolean;
  food_safe?: boolean;
  grip_texture?: string;
  brand?: string;
}

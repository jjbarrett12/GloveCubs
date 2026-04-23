import { z } from "zod";

export const feedTypeSchema = z.enum(["url", "csv", "api"]);
export const batchStatusSchema = z.enum(["running", "completed", "failed", "cancelled"]);
export const stagingStatusSchema = z.enum(["pending", "approved", "rejected", "merged"]);

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/),
  settings: z.record(z.unknown()).optional().default({}),
  is_active: z.boolean().optional().default(true),
});

export const createSupplierFeedSchema = z.object({
  supplier_id: z.number().int().positive(),
  feed_type: feedTypeSchema,
  config: z.object({
    url: z.string().url().optional(),
    csv_url: z.string().url().optional(),
    api_endpoint: z.string().optional(),
    headers: z.record(z.string()).optional(),
  }).passthrough(),
  schedule_cron: z.string().max(100).optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export const startIngestSchema = z.object({
  feed_id: z.number().int().positive().optional(),
  supplier_id: z.number().int().positive(),
  source_type: z.enum(["url", "csv_upload"]),
  url: z.string().url().optional(),
  csv_rows: z.array(z.record(z.unknown())).optional(),
});

export const updateStagingStatusSchema = z.object({
  staging_id: z.number().int().positive(),
  status: stagingStatusSchema,
  master_product_id: z.number().int().positive().optional().nullable(),
});

/** Staging IDs are UUIDs (catalogos.supplier_products_normalized.id). */
export const publishStagingSchema = z.object({
  staging_ids: z.array(z.string().uuid()).min(1).max(100),
});

export const disposableGloveAttributesSchema = z.object({
  product_type: z.string().optional(),
  material: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  thickness_mil: z.number().optional(),
  powder_free: z.boolean().optional(),
  latex_free: z.boolean().optional(),
  case_qty: z.number().int().optional(),
  medical_grade: z.boolean().optional(),
  food_safe: z.boolean().optional(),
  grip_texture: z.string().optional(),
  brand: z.string().optional(),
}).strict();

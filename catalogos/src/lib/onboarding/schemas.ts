import { z } from "zod";

const contactInfoSchema = z.object({
  contact_name: z.string().optional().nullable(),
  contact_email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
});

const feedTypeSchema = z.enum(["url", "csv", "api", "pdf", "google_sheet"]);
const statusSchema = z.enum([
  "initiated",
  "waiting_for_supplier",
  "ready_for_review",
  "approved",
  "created_supplier",
  "feed_created",
  "ingestion_triggered",
  "completed",
  "rejected",
]);

export const createOnboardingRequestSchema = z.object({
  company_name: z.string().min(1, "Company name required").max(500),
  website: z.string().url().optional().nullable().or(z.literal("")),
  contact_name: z.string().max(200).optional().nullable(),
  contact_email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  feed_type: feedTypeSchema.optional().nullable(),
  feed_url: z.string().url().optional().nullable().or(z.literal("")),
  pricing_basis_hints: z.string().max(1000).optional().nullable(),
  packaging_hints: z.string().max(1000).optional().nullable(),
  categories_supplied: z.array(z.string().max(100)).optional().default([]),
  notes: z.string().max(5000).optional().nullable(),
  source_lead_id: z.string().uuid().optional().nullable(),
  submitted_via: z.enum(["admin", "supplier_portal"]).optional().default("admin"),
});

export const updateOnboardingRequestSchema = z.object({
  company_name: z.string().min(1).max(500).optional(),
  website: z.string().url().optional().nullable().or(z.literal("")),
  contact_info: z.record(z.unknown()).optional(),
  contact_name: z.string().max(200).optional().nullable(),
  contact_email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  feed_type: feedTypeSchema.optional().nullable(),
  feed_url: z.string().url().optional().nullable().or(z.literal("")),
  feed_config: z.record(z.unknown()).optional(),
  pricing_basis_hints: z.string().max(1000).optional().nullable(),
  packaging_hints: z.string().max(1000).optional().nullable(),
  categories_supplied: z.array(z.string().max(100)).optional(),
  notes: z.string().max(5000).optional().nullable(),
  status: statusSchema.optional(),
});

export type CreateOnboardingRequestInput = z.infer<typeof createOnboardingRequestSchema>;
export type UpdateOnboardingRequestInput = z.infer<typeof updateOnboardingRequestSchema>;

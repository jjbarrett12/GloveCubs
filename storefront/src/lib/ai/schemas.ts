import { z } from "zod";

// ---- Glove Finder (production API: /api/ai/glove-finder) ----
export const GloveFinderRequestSchema = z.object({
  industry: z.string(),
  hazards: z.array(z.string()),
  latexAllergy: z.boolean(),
  thicknessPreference: z.string().optional(),
  budgetLevel: z.enum(["low", "medium", "high"]).optional(),
  notes: z.string().optional(),
});
export type GloveFinderRequestStrict = z.infer<typeof GloveFinderRequestSchema>;

export const GloveFinderResponseSchema = z.object({
  constraints: z.array(z.string()),
  top_picks: z.array(
    z.object({
      sku: z.string(),
      reason: z.string(),
      tradeoffs: z.array(z.string()),
    })
  ),
  followup_questions: z.array(z.string()).optional(),
});
export type GloveFinderResponseStrict = z.infer<typeof GloveFinderResponseSchema>;

// ---- Legacy Glove Finder (existing UI / provider) ----
export const gloveFinderRequestSchema = z.object({
  use_case: z.string().optional(),
  industry: z.string().optional(),
  material_preference: z.string().optional(),
  quantity_per_month: z.string().optional(),
  constraints: z.string().optional(),
  hazards: z.string().optional(),
  latex_allergy: z.boolean().optional(),
  thickness_preference: z.string().optional(),
  budget: z.string().optional(),
});

export type GloveFinderRequest = z.infer<typeof gloveFinderRequestSchema>;

export const gloveFinderRecommendationSchema = z.object({
  sku: z.string(),
  name: z.string(),
  brand: z.string().optional().nullable(),
  reason: z.string(),
  price_cents: z.number().optional().nullable(),
  badges: z.array(z.string()).optional(),
});

export const gloveFinderResponseSchema = z.object({
  recommendations: z.array(gloveFinderRecommendationSchema),
  summary: z.string().optional().nullable(),
  follow_up_questions: z.array(z.string()).optional(),
});

export type GloveFinderResponse = z.infer<typeof gloveFinderResponseSchema>;

// ---- Invoice extraction ----
export const invoiceLineSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unit_price: z.number().nullable(),
  total: z.number().nullable(),
  sku_or_code: z.string().optional().nullable(),
});

export const invoiceExtractResponseSchema = z.object({
  vendor_name: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  total_amount: z.number().optional().nullable(),
  lines: z.array(invoiceLineSchema),
});

export type InvoiceExtractResponse = z.infer<typeof invoiceExtractResponseSchema>;
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

// ---- Invoice recommend / savings ----
export const invoiceRecommendRequestSchema = z.object({
  lines: z.array(invoiceLineSchema),
});

export const recommendedSwapSchema = z.object({
  line_index: z.number(),
  current_description: z.string(),
  recommended_sku: z.string(),
  recommended_name: z.string(),
  brand: z.string().optional().nullable(),
  estimated_savings: z.number().nullable(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

export const invoiceRecommendResponseSchema = z.object({
  total_current_estimate: z.number(),
  total_recommended_estimate: z.number(),
  estimated_savings: z.number(),
  swaps: z.array(recommendedSwapSchema),
});

export type InvoiceRecommendResponse = z.infer<typeof invoiceRecommendResponseSchema>;

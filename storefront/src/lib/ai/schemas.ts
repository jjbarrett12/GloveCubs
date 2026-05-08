import { z } from "zod";

/**
 * Canonical AI request/response Zod contracts for the **Next storefront** (`app/api/**`, `src/lib/ai/*`).
 *
 * Express legacy equivalents: `lib/ai/schemas.js` (used only by `server.js`). Keep breaking changes coordinated;
 * drift between those files is intentional technical debt until Express AI routes are removed.
 */

// ---- Glove Finder — single storefront contract (wizard + /api/ai/glove-finder + ResultsView + provider) ----
export const GloveFinderRequestSchema = z.object({
  useCaseLabel: z.string().min(1, "useCaseLabel is required"),
  materialPreference: z.string().optional(),
  quantityPerMonth: z.string().optional(),
  constraints: z.string().optional(),
  hazards: z.array(z.string()).default([]),
  latexAllergy: z.boolean().default(false),
  /** Phase 2B: stable browser id for procurement spine + idempotent opportunity. */
  clientTraceId: z.string().uuid().optional(),
  /**
   * Operational environment (ontology). Defaults to restaurant prep-line pilot.
   * Other values rejected until governed.
   */
  operationalEnvironmentKey: z.literal("restaurant_prep_line").default("restaurant_prep_line"),
});
export type GloveFinderRequest = z.infer<typeof GloveFinderRequestSchema>;

function normalizeGloveFinderRecommendation(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  delete o.badges;
  if (typeof o.price_cents === "number" && o.price == null) {
    o.price = (o.price_cents as number) / 100;
  }
  delete o.price_cents;
  return o;
}

const gloveFinderRecommendationInner = z.object({
  /** Catalog variant SKU (from listing row) — OpenAI must echo this token when picking a row. */
  sku: z.string(),
  name: z.string(),
  brand: z.string().nullable().optional(),
  reason: z.string(),
  price: z.union([z.number(), z.string()]).nullable().optional(),
  catalogProductId: z.string().uuid().optional(),
  slug: z.string().optional(),
  catalogVariantId: z.string().uuid().nullable().optional(),
  sizeCode: z.string().nullable().optional(),
  /** Catalog-backed facts for prep-line cards and spec comparison (server-projected). */
  catalogFacts: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
});

export const GloveFinderRecommendationSchema = z.preprocess(
  normalizeGloveFinderRecommendation,
  gloveFinderRecommendationInner
);

function normalizeGloveFinderResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(o.follow_up_questions) && o.followUpQuestions == null) {
    o.followUpQuestions = o.follow_up_questions;
  }
  delete o.follow_up_questions;
  if (o.opportunity_id != null && o.opportunityId == null) {
    o.opportunityId = o.opportunity_id;
  }
  delete o.opportunity_id;
  if (o.buyer_display_ref != null && o.buyerDisplayRef == null) {
    o.buyerDisplayRef = o.buyer_display_ref;
  }
  delete o.buyer_display_ref;
  if (Array.isArray(o.recommendations)) {
    o.recommendations = o.recommendations.map((r) => normalizeGloveFinderRecommendation(r));
  }
  return o;
}

const gloveFinderResponseInner = z.object({
  recommendations: z.array(gloveFinderRecommendationInner),
  summary: z.string().nullable().optional(),
  followUpQuestions: z.array(z.string()).optional(),
  /** Procurement spine thread id when clientTraceId was supplied and DB write succeeded. */
  opportunityId: z.string().uuid().optional(),
  /** Human-citable continuity ref (metadata.buyer_display_ref); never a UUID. */
  buyerDisplayRef: z.string().optional(),
  /** Grounding disclaimer — always show in UI for this flow. */
  advisoryNotice: z.string().optional(),
});

export const GloveFinderResponseSchema = z.preprocess(normalizeGloveFinderResponse, gloveFinderResponseInner);

export type GloveFinderResponse = z.infer<typeof gloveFinderResponseInner>;

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

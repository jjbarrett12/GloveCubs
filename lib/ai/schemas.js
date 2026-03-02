/**
 * Zod schemas for AI endpoints: request/response validation and structured outputs.
 */

const { z } = require('zod');

// --- Glove Finder ---
const GloveFinderRequestSchema = z.object({
    industry: z.string().optional(),
    use_case: z.string().optional(),
    material_preference: z.string().optional(),
    quantity_per_month: z.union([z.number(), z.string()]).optional(),
    budget_note: z.string().optional(),
    constraints: z.string().optional(),
});
const GloveRecommendationSchema = z.object({
    sku: z.string().nullable().optional(),
    name: z.string(),
    brand: z.string().nullable().optional(),
    reason: z.string(),
});
const GloveFinderResponseSchema = z.object({
    recommendations: z.array(GloveRecommendationSchema),
    summary: z.string().optional(),
});

// --- Invoice Extract ---
const InvoiceLineSchema = z.object({
    description: z.string(),
    quantity: z.number(),
    unit_price: z.number().optional(),
    total: z.number().optional(),
    sku_or_code: z.string().nullable().optional(),
});
const InvoiceExtractResponseSchema = z.object({
    vendor_name: z.string().nullable().optional(),
    invoice_number: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    total_amount: z.number().nullable().optional(),
    lines: z.array(InvoiceLineSchema),
});

// --- Invoice Recommend ---
const InvoiceRecommendItemSchema = z.object({
    line_index: z.number().optional(),
    current_product: z.string().optional(),
    recommended_sku: z.string().nullable().optional(),
    recommended_name: z.string(),
    brand: z.string().nullable().optional(),
    estimated_savings: z.number().nullable().optional(),
    reason: z.string(),
});
const InvoiceRecommendResponseSchema = z.object({
    recommendations: z.array(InvoiceRecommendItemSchema),
    total_estimated_savings: z.number().nullable().optional(),
    summary: z.string().optional(),
});

function validateGloveFinderRequest(body) {
    return GloveFinderRequestSchema.safeParse(body);
}
function validateGloveFinderResponse(obj) {
    return GloveFinderResponseSchema.safeParse(obj);
}
function validateInvoiceExtractResponse(obj) {
    return InvoiceExtractResponseSchema.safeParse(obj);
}
function validateInvoiceRecommendResponse(obj) {
    return InvoiceRecommendResponseSchema.safeParse(obj);
}

module.exports = {
    GloveFinderRequestSchema,
    GloveFinderResponseSchema,
    InvoiceExtractResponseSchema,
    InvoiceRecommendResponseSchema,
    validateGloveFinderRequest,
    validateGloveFinderResponse,
    validateInvoiceExtractResponse,
    validateInvoiceRecommendResponse,
};

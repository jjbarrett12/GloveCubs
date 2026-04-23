/**
 * Zod schemas for AI extraction and matching responses.
 * Ensures safe, structured JSON from the model; invalid responses are discarded.
 */

import { z } from "zod";

const aiExtractedAttributeSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1).optional(),
});

export const aiExtractionOutputSchema = z.object({
  normalized_category_slug: z.string().nullable(),
  extracted_attributes: z.array(aiExtractedAttributeSchema),
  extraction_confidence: z.number().min(0).max(1),
  explanation: z.string(),
  suggested_canonical_title: z.string().nullable(),
  inferred_flags: z.array(z.string()),
});

export const aiMatchingOutputSchema = z.object({
  suggested_master_product_id: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .transform((v) => (v === "" ? null : v)),
  match_confidence: z.number().min(0).max(1),
  explanation: z.string(),
  no_match_recommendation: z.boolean(),
  possible_duplicate: z.boolean(),
});

export type AIExtractionOutputParsed = z.infer<typeof aiExtractionOutputSchema>;
export type AIMatchingOutputParsed = z.infer<typeof aiMatchingOutputSchema>;

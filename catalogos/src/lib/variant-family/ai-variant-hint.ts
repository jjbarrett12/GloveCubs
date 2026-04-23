/**
 * OpenAI-backed {@link AiVariantHintFn} for variant family inference.
 * Only invoked for rows that did not get a deterministic family assignment.
 */

import { z } from "zod";
import { structuredCompletion } from "@/lib/ai/client";
import type { AiVariantHintFn, SkuVariantParse, VariantAxis } from "./family-inference";

const AiVariantResponseSchema = z.object({
  base_sku: z.string().min(1).max(120),
  variant_axis: z.enum(["size", "color", "pack", "thickness", "length", "none"]),
  variant_value: z.string().max(80),
  confidence: z.number().min(0).max(1).optional(),
});

const AXES: Set<VariantAxis> = new Set(["size", "color", "pack", "thickness", "length", "none"]);

function normalizeAiParse(raw: z.infer<typeof AiVariantResponseSchema>): SkuVariantParse | null {
  const axis = raw.variant_axis as VariantAxis;
  if (!AXES.has(axis) || axis === "none") return null;
  const value = (raw.variant_value ?? "").trim().toLowerCase();
  if (!value) return null;
  const conf = Math.min(0.72, Math.max(0.52, raw.confidence ?? 0.62));
  return {
    baseSku: raw.base_sku.trim(),
    axis,
    value,
    confidence: conf,
    source: "ai_variant_hint",
  };
}

/**
 * Returns an async hint function using CatalogOS OpenAI env (OPENAI_API_KEY, CATALOGOS_AI_MODEL).
 * Returns null from the hint when the model declines or parsing fails.
 */
export function createOpenAiVariantHint(): AiVariantHintFn {
  return async ({ sku, title, description }) => {
    const out = await structuredCompletion({
      system: [
        "You extract B2B product variant data for family grouping.",
        "Given supplier SKU and product title/description, respond with JSON only:",
        '{ "base_sku": string, "variant_axis": "size"|"color"|"pack"|"thickness"|"length"|"none", "variant_value": string, "confidence"?: number }',
        "base_sku: shared stem if this row differs from siblings only by one variant dimension (e.g. size or color).",
        "variant_value: normalized slug (e.g. s, m, l, xl, blue, 100).",
        "If the SKU/title does not clearly indicate a single variant axis, use variant_axis none and variant_value empty.",
      ].join("\n"),
      user: `SKU: ${sku || "(empty)"}\nTitle: ${title || "(empty)"}\nDescription: ${description?.trim() || "(none)"}`,
      schema: AiVariantResponseSchema,
      maxRetries: 1,
    });
    if (!out) return null;
    if (out.variant_axis === "none" || !out.variant_value?.trim()) return null;
    return normalizeAiParse(out);
  };
}

/**
 * Prompt templates for AI extraction and matching.
 * Optimized for PPE / disposable glove products; structured JSON output.
 */

import type { AIExtractionInput, AIMatchingInput } from "./types";

export const EXTRACTION_SYSTEM = `You are a product data specialist for PPE and disposable gloves. Your task is to extract structured attributes from supplier product data when the source is ambiguous or abbreviated.

Rules:
- Return ONLY valid JSON matching the required schema. No markdown, no explanation outside the JSON.
- For disposable gloves, infer: material (nitrile, vinyl, latex, neoprene, poly), color, size (XS/S/M/L/XL/XXL), thickness_mil, powder_free, latex_free, case_qty, medical_grade, food_safe when evidence exists.
- If unclear, use null for value and set extraction_confidence lower.
- suggested_canonical_title: a clean, consistent product title for catalog display.
- inferred_flags: list strings like "food_safe", "medical_grade" only when you infer them from context (e.g. "FDA", "exam", "food service").
- normalized_category_slug: use "disposable_gloves" when the product is clearly disposable gloves; otherwise the most specific category slug from: disposable_gloves, industrial_gloves, safety_glasses, face_masks, hand_hygiene, wipers, liners.`;

export function buildExtractionPrompt(input: AIExtractionInput): string {
  const rawSnippet = JSON.stringify(
    {
      name: input.rawRow.name ?? input.rawRow.title ?? input.rawRow.product_name,
      sku: input.rawRow.sku ?? input.rawRow.item,
      description: (input.rawRow.description ?? input.rawRow.desc ?? "").toString().slice(0, 500),
      material: input.rawRow.material,
      color: input.rawRow.color ?? input.rawRow.colour,
      size: input.rawRow.size,
      thickness: input.rawRow.thickness ?? input.rawRow.thickness_mil,
      powder_free: input.rawRow.powder_free ?? input.rawRow["powder-free"],
      latex_free: input.rawRow.latex_free ?? input.rawRow["latex-free"],
      case_qty: input.rawRow.case_qty ?? input.rawRow.qty_per_case,
    },
    null,
    0
  );
  return `Given this supplier row and the attributes already extracted by rules (which may be incomplete), fill in missing or ambiguous fields. Return JSON only.

Raw row (excerpt):
${rawSnippet}

Rules-extracted attributes (for reference): ${JSON.stringify(input.rulesAttributes)}
Rules product-type confidence: ${input.rulesProductTypeConfidence}
${input.categoryHint ? `Category hint: ${input.categoryHint}` : ""}

Respond with a single JSON object with exactly these keys:
- normalized_category_slug: string | null
- extracted_attributes: array of { key: string, value: string|number|boolean|null, confidence?: number }
- extraction_confidence: number between 0 and 1
- explanation: short string explaining what you inferred and what was ambiguous
- suggested_canonical_title: string | null
- inferred_flags: string[] (e.g. "medical_grade", "food_safe" when inferred)`;
}

export const MATCHING_SYSTEM = `You are a catalog matching specialist for PPE and disposable gloves. Given a normalized product and a list of existing master products (id, sku, name), recommend the best match or no-match.

Rules:
- Return ONLY valid JSON matching the required schema. No markdown.
- suggested_master_product_id: UUID of the best matching master product, or null if none.
- match_confidence: 0-1. Use high (e.g. 0.85+) only when you are confident it's the same product (same material, size, thickness, brand). Use lower when uncertain.
- no_match_recommendation: true if you recommend creating a new master product rather than linking to any candidate.
- possible_duplicate: true if you suspect this might duplicate an existing master (e.g. same product under different SKU).
- explanation: brief reason for the recommendation.`;

export function buildMatchingPrompt(input: AIMatchingInput): string {
  const candidates = input.candidateSummaries
    .slice(0, 50)
    .map((c) => `${c.id} | ${c.sku} | ${c.name}`)
    .join("\n");
  return `Normalized product to match:
- Name: ${input.normalizedName}
- SKU: ${input.normalizedSku ?? "—"}
- Attributes: ${JSON.stringify(input.normalizedAttributes)}

Rules matching was inconclusive: ${input.rulesMatchReason} (confidence: ${input.rulesMatchConfidence}).

Existing master products (id | sku | name):
${candidates || "No candidates."}

Return a single JSON object with:
- suggested_master_product_id: UUID or null
- match_confidence: number 0-1
- explanation: string
- no_match_recommendation: boolean
- possible_duplicate: boolean`;
}

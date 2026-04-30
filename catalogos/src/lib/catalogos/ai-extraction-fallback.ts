/**
 * AI fallback for uncertain filter extraction.
 * When rules-based extraction has low confidence for required or key attributes,
 * call AI to fill gaps. Returns structured filter attributes; validated with Zod.
 */

import type { RawRow } from "./extraction-types";
import type { FilterAttributes } from "./normalized-product-types";
import { filterAttributesSchema } from "./normalized-product-schema";
import { normalizeFilterAttributesKeys } from "./attribute-validation";

const EXTRACTION_CONFIDENCE_THRESHOLD = 0.6;

export interface AIExtractionFallbackInput {
  rawRow: RawRow;
  categorySlug: string;
  rulesAttributes: FilterAttributes;
  confidenceByKey: Record<string, number>;
  rulesCore: { canonical_title: string; supplier_sku: string; supplier_cost: number; [k: string]: unknown };
}

export interface AIExtractionFallbackOutput {
  filter_attributes: FilterAttributes;
  core_overrides: Partial<{ canonical_title: string; short_description: string; long_description: string; bullets: string[] }>;
  explanation?: string;
}

/**
 * Call AI only when overall or key-attribute confidence is below threshold.
 * Returns null on failure or when AI is disabled; caller keeps rules result.
 */
export async function runAIExtractionFallback(
  input: AIExtractionFallbackInput
): Promise<AIExtractionFallbackOutput | null> {
  const { rawRow, categorySlug, rulesAttributes, confidenceByKey, rulesCore } = input;
  const belowThreshold = Object.values(confidenceByKey).some((c) => c > 0 && c < EXTRACTION_CONFIDENCE_THRESHOLD);
  const missingRequired =
    categorySlug === "disposable_gloves" || categorySlug === "reusable_work_gloves"
      ? !rulesAttributes.material || !rulesAttributes.size || !rulesAttributes.color
      : false;
  if (!belowThreshold && !missingRequired) return null;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;

  const systemPrompt = `You are a product data specialist for PPE and gloves. Extract structured filter attributes and core fields from supplier product data. Return ONLY valid JSON with keys: filter_attributes (object with material, size, color, and category-specific keys), core_overrides (optional: canonical_title, short_description, long_description, bullets), explanation (string). Use lowercase snake_case for filter values. For category disposable_gloves include: material, size, color, thickness_mil, powder, grade, industries, certifications, uses, protection_tags, texture, cuff_style, packaging, sterility. For reusable_work_gloves include: material, size, color, cut_level_ansi, puncture_level, abrasion_level, flame_resistant, arc_rating, warm_cold_weather.`;

  const userPrompt = `Category: ${categorySlug}. Rules-extracted attributes: ${JSON.stringify(rulesAttributes)}. Confidence by key: ${JSON.stringify(confidenceByKey)}. Raw row excerpt: ${JSON.stringify({
    name: rawRow.name,
    title: rawRow.title,
    sku: rawRow.sku,
    description: (rawRow.description as string)?.slice(0, 500),
    material: rawRow.material,
    color: rawRow.color,
    size: rawRow.size,
  })}. Fill missing or low-confidence attributes. Return JSON only.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: process.env.CATALOGOS_AI_MODEL ?? "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()) as unknown;
    const filterAttrs = (parsed as { filter_attributes?: unknown }).filter_attributes;
    const merged: FilterAttributes = { ...rulesAttributes };
    if (filterAttrs && typeof filterAttrs === "object") {
      for (const [k, v] of Object.entries(filterAttrs)) {
        if (v != null && (merged as Record<string, unknown>)[k] == null) (merged as Record<string, unknown>)[k] = v;
      }
    }
    const validated = filterAttributesSchema.safeParse(normalizeFilterAttributesKeys(merged as Record<string, unknown>));
    if (!validated.success) return null;
    return {
      filter_attributes: validated.data,
      core_overrides: (parsed as { core_overrides?: Record<string, unknown> }).core_overrides ?? {},
      explanation: (parsed as { explanation?: string }).explanation,
    };
  } catch {
    return null;
  }
}

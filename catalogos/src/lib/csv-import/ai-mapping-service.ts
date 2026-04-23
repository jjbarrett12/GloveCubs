/**
 * AI-powered CSV header/field mapping. One call per upload; deterministic transform after.
 */

import { z } from "zod";
import { structuredCompletion } from "@/lib/ai/client";
import { CANONICAL_CSV_FIELDS } from "./canonical-fields";
import type { InferredMappingResult } from "./types";

const mappingResponseSchema = z.object({
  mappings: z.array(
    z.object({
      source_column: z.string(),
      mapped_field: z.string(),
      confidence: z.number().min(0).max(1),
      notes: z.string().optional(),
    })
  ),
  unmapped_columns: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
});

export type AIMappingResponse = z.infer<typeof mappingResponseSchema>;

const CANONICAL_LIST = CANONICAL_CSV_FIELDS.join(", ");

/**
 * Infer column-to-canonical-field mapping from CSV headers and sample rows.
 * Called once per upload; result is used deterministically to transform all rows.
 */
export async function inferMappingFromCsv(
  headers: string[],
  sampleRows: Record<string, unknown>[]
): Promise<InferredMappingResult | null> {
  const sample = sampleRows.slice(0, 10).map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      const v = r[h];
      out[h] = v == null ? "" : String(v).slice(0, 80);
    }
    return out;
  });

  const system = `You are a data mapping assistant for a glove/product catalog import system.
Map CSV columns to canonical fields. Respond only with valid JSON matching the schema.
Canonical field names (use exactly): ${CANONICAL_LIST}
- Required coverage when present in the file: supplier_sku, product_name or title/name, brand, description (description/long_description/short_description), category_guess or product_category, uom/unit_of_measure, pack_size, supplier_cost or cost/price, image_url, variant_value (combined size/color/style column), material, thickness_mil, color, size.
- Prefer: supplier_sku, product_name, brand, cost/price, case_price, box_price, gloves_per_box, boxes_per_case, material, thickness_mil, color, size, powder_free, image_url, uom/unit_of_measure, pack_size (or packs_per_case / qty_per_case), category_guess or product_category when present.
- Map title/name columns to product_name or name or title.
- Map item number/SKU/part/MPN to supplier_sku, sku, or manufacturer_sku as appropriate.
- Map price/cost columns to cost, case_price, or box_price as appropriate.
- For each mapping provide confidence 0-1 (1 = certain).
- Leave unmapped_columns for columns that do not match any canonical field.
- Include warnings for ambiguous or duplicate mappings.`;

  const user = `CSV headers: ${JSON.stringify(headers)}
Sample rows (first 10):
${JSON.stringify(sample, null, 2)}

Return JSON: { "mappings": [ { "source_column": "...", "mapped_field": "...", "confidence": 0.9 } ], "unmapped_columns": [], "warnings": [] }`;

  const result = await structuredCompletion({
    system,
    user,
    schema: mappingResponseSchema,
    maxRetries: 1,
  });

  if (!result) return null;

  const confidences = result.mappings.map((m) => m.confidence);
  const average_confidence =
    confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  return {
    mappings: result.mappings.map((m) => ({
      source_column: m.source_column,
      mapped_field: m.mapped_field,
      confidence: m.confidence,
      notes: m.notes,
    })),
    unmapped_columns: result.unmapped_columns ?? [],
    average_confidence,
    warnings: result.warnings ?? [],
  };
}

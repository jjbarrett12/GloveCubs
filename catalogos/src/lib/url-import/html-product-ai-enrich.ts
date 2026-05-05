/**
 * One OpenAI JSON call per HTML product page to propose glove/PPE attributes
 * (merged into ExtractedProductFamily before normalizeToOntology).
 */

import { z } from "zod";

const HtmlAiResponseSchema = z
  .object({
    material: z.string().nullable().optional(),
    size: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    thickness_mil: z.union([z.number(), z.string()]).nullable().optional(),
    powder_status: z.string().nullable().optional(),
    sterile_status: z.string().nullable().optional(),
    glove_type: z.string().nullable().optional(),
    texture: z.string().nullable().optional(),
    cuff_style: z.string().nullable().optional(),
    box_qty: z.number().int().nullable().optional(),
    case_qty: z.number().int().nullable().optional(),
    category_hint: z.string().nullable().optional(),
    use_case_tags: z.array(z.string()).nullable().optional(),
    compliance_tags: z.array(z.string()).nullable().optional(),
    field_confidence: z.record(z.number()).optional(),
    notes: z.string().nullable().optional(),
  })
  .strip();

export type HtmlAiProductPatch = z.infer<typeof HtmlAiResponseSchema>;

function trimSnippet(html: string, maxChars: number): string {
  const t = html.trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars);
}

export function buildHtmlAiTrimmedContent(parsed: {
  raw_html_snippet?: string;
  bullet_points?: string[];
}): string {
  const bullets = Array.isArray(parsed.bullet_points) ? parsed.bullet_points.join("\n") : "";
  const raw = parsed.raw_html_snippet ?? "";
  const combined = [bullets, raw].filter(Boolean).join("\n\n");
  return trimSnippet(combined, 14_000);
}

/**
 * Returns validated patch JSON or null if disabled, HTTP error, or invalid payload.
 */
export async function enrichHtmlProductFromPage(input: {
  sourceUrl: string;
  title: string;
  description: string;
  specTable: Record<string, string>;
  trimmedContent: string;
}): Promise<{ patch: HtmlAiProductPatch; model: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return null;

  const model = process.env.CATALOGOS_AI_MODEL ?? "gpt-4o-mini";
  const specJson = JSON.stringify(input.specTable ?? {}, null, 0);
  const schemaHint = `Return ONLY one JSON object (no markdown) with optional keys:
material, size, color, thickness_mil (number or string), powder_status, sterile_status, glove_type,
texture, cuff_style, box_qty (integer), case_qty (integer), category_hint (short phrase),
use_case_tags (string[]), compliance_tags (string[]),
field_confidence (object mapping any supplied field name to 0..1 confidence),
notes (string).
Use null for unknown scalars. Arrays may be empty. Do not invent SKUs, brands, or MPNs.
Values must be grounded in the provided title/description/spec/body text.`;

  const userText = [
    schemaHint,
    `Source URL: ${input.sourceUrl}`,
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    `Spec table JSON: ${specJson}`,
    `Trimmed page text/HTML:\n${input.trimmedContent}`,
  ].join("\n\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userText }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsedJson = JSON.parse(cleaned) as unknown;
    const patch = HtmlAiResponseSchema.safeParse(parsedJson);
    if (!patch.success) return null;
    return { patch: patch.data, model };
  } catch {
    return null;
  }
}

/**
 * Vision (multimodal) extraction for URL import when the source is an image URL.
 * Maps model JSON → OpenClaw ExtractedProductFamily → normalizeToOntology (same as HTML path).
 */

import { createHash } from "node:crypto";
import type { ExtractedField, ExtractedProductFamily, ExtractionMethod } from "@/lib/openclaw/types";

const METHOD: ExtractionMethod = "ai_semantic";

function field(raw: unknown, normalized: unknown, confidence: number): ExtractedField {
  return { raw_value: raw, normalized_value: normalized, confidence, extraction_method: METHOD };
}

export interface VisionProductJson {
  product_name?: string;
  brand?: string;
  material?: string;
  color?: string;
  size?: string;
  thickness_mil?: number | string;
  disposable?: boolean;
  reusable?: boolean;
  box_count?: number;
  case_count?: number;
  certifications?: string[];
  sku?: string;
}

function asNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function stableSkuFromImage(sourceUrl: string, imageBuffer: Buffer, modelSku: string | undefined): string {
  const t = (modelSku ?? "").trim();
  if (t) return t.slice(0, 120);
  const h = createHash("sha256").update(imageBuffer).digest("hex").slice(0, 14);
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "").slice(0, 24).replace(/[^\w.-]/g, "_");
    return `IMG-${host}-${h}`.slice(0, 120);
  } catch {
    return `IMG-${h}`;
  }
}

/**
 * Call OpenAI vision; returns ExtractedProductFamily for normalizeToOntology, or null if disabled / failed.
 */
export async function extractProductFamilyFromVisionImage(input: {
  sourceUrl: string;
  imageBase64: string;
  mimeType: string;
  sourceHost: string;
  imageBuffer: Buffer;
}): Promise<{ extracted: ExtractedProductFamily; avgConfidence: number; certifications: string[] } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) return null;

  const model = process.env.CATALOGOS_AI_MODEL ?? "gpt-4o-mini";
  const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;

  const schemaHint = `Return ONLY a JSON object with these keys (omit unknowns, use null for missing strings):
{
  "product_name": string,
  "brand": string,
  "material": string,
  "color": string,
  "size": string (e.g. S, M, L, XL),
  "thickness_mil": number | null,
  "disposable": boolean | null,
  "reusable": boolean | null,
  "box_count": number | null,
  "case_count": number | null,
  "certifications": string[],
  "sku": string | null
}
Use disposable=true for single-use exam/industrial disposables; reusable=true for lined work gloves. If unclear, leave both null.`;

  const userText = `${schemaHint}\nImage URL (context): ${input.sourceUrl}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()) as VisionProductJson;

    const name = (parsed.product_name ?? "").trim() || "Unknown product";
    const brand = (parsed.brand ?? "").trim();
    const material = (parsed.material ?? "").trim();
    const color = (parsed.color ?? "").trim();
    const size = (parsed.size ?? "").trim();
    const thickness = asNum(parsed.thickness_mil);
    const box = asNum(parsed.box_count);
    const caseC = asNum(parsed.case_count);
    const certs = Array.isArray(parsed.certifications)
      ? parsed.certifications.map((c) => String(c).trim()).filter(Boolean)
      : [];

    let categoryRaw = "disposable gloves";
    if (parsed.reusable === true) categoryRaw = "reusable work gloves";
    else if (parsed.disposable === false) categoryRaw = "reusable work gloves";
    else if (parsed.disposable === true) categoryRaw = "disposable gloves";

    const sku = stableSkuFromImage(input.sourceUrl, input.imageBuffer, parsed.sku);

    const fam: ExtractedProductFamily = {
      source_url: input.sourceUrl,
      source_category_path: "",
      family_name: name,
      variant_name: name,
      sku: field(sku, sku, 0.55),
      brand: brand ? field(brand, brand, 0.7) : undefined,
      supplier_name: field(input.sourceHost, input.sourceHost, 0.5),
      material: material ? field(material, material, 0.68) : undefined,
      size: size ? field(size, size, 0.65) : undefined,
      color: color ? field(color, color, 0.65) : undefined,
      thickness_mil:
        thickness != null ? field(thickness, thickness, 0.62) : undefined,
      box_qty: box != null ? field(box, box, 0.6) : undefined,
      case_qty: caseC != null ? field(caseC, caseC, 0.6) : undefined,
      category: field(categoryRaw, categoryRaw, 0.62),
      description_clean: certs.length
        ? field(`Certifications (vision): ${certs.join("; ")}`, certs.join("; "), 0.55)
        : undefined,
    };

    const confidences: number[] = [0.62];
    if (brand) confidences.push(0.7);
    if (material) confidences.push(0.68);
    if (size) confidences.push(0.65);
    if (color) confidences.push(0.65);
    if (thickness != null) confidences.push(0.62);
    if (box != null) confidences.push(0.6);
    if (caseC != null) confidences.push(0.6);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    return { extracted: fam, avgConfidence, certifications: certs };
  } catch {
    return null;
  }
}

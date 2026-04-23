/**
 * Build ordered search queries for controlled image lookup (HTTP search service only — no browsing).
 * Rule-based queries always run; optional OpenAI augments the list when OPENAI_API_KEY is set.
 */

import { z } from "zod";
import { structuredCompletion } from "@/lib/ai/client";

export type ImageSearchTier = "exact_sku" | "base_sku_family" | "title_brand" | "category_generic";

export interface ImageSearchQueryItem {
  text: string;
  tier: ImageSearchTier;
}

export interface ImageSearchContextInput {
  supplier_sku: string;
  base_sku: string | null;
  brand: string;
  title: string;
  categorySlug: string | null;
  variant_axis: string | null;
  variant_value: string | null;
}

const AiQueriesSchema = z.object({
  queries: z.array(z.string().min(3).max(200)).max(6),
});

function clean(s: string, max = 160): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

function isGloveCategory(slug: string | null): boolean {
  if (!slug) return false;
  const s = slug.toLowerCase();
  return s.includes("glove") || s === "disposable_gloves" || s === "ppe_gloves";
}

/**
 * Deterministic queries (highest signal first).
 */
export function buildRuleBasedImageSearchQueries(ctx: ImageSearchContextInput): ImageSearchQueryItem[] {
  const sku = clean(ctx.supplier_sku, 80);
  const brand = clean(ctx.brand, 60);
  const title = clean(ctx.title, 120);
  const base = ctx.base_sku ? clean(ctx.base_sku, 80) : "";
  const gloves = isGloveCategory(ctx.categorySlug);
  const variantBits: string[] = [];
  if (ctx.variant_axis && ctx.variant_value) {
    const ax = ctx.variant_axis.toLowerCase();
    const v = clean(ctx.variant_value, 40);
    if (v && ax !== "none") variantBits.push(`${ax} ${v}`);
  }

  const out: ImageSearchQueryItem[] = [];

  if (sku && brand) {
    out.push({ text: clean(`${brand} ${sku} product image`), tier: "exact_sku" });
    out.push({ text: clean(`${sku} ${brand}`), tier: "exact_sku" });
  } else if (sku) {
    out.push({ text: clean(`${sku} product`), tier: "exact_sku" });
  }

  if (base && brand) {
    out.push({
      text: clean(`${brand} ${base} ${gloves ? "nitrile gloves" : "product"}`),
      tier: "base_sku_family",
    });
    out.push({ text: clean(`${base} gloves box`), tier: "base_sku_family" });
  } else if (base) {
    out.push({ text: clean(`${base} nitrile gloves`), tier: "base_sku_family" });
  }

  if (title && brand) {
    out.push({ text: clean(`${title} ${brand}`), tier: "title_brand" });
  } else if (title) {
    out.push({ text: clean(`${title} gloves`), tier: "title_brand" });
  }

  if (variantBits.length && (sku || base || title)) {
    const stem = sku || base || title.slice(0, 40);
    out.push({ text: clean(`${stem} ${variantBits.join(" ")}`), tier: "title_brand" });
  }

  if (gloves && brand) {
    out.push({
      text: clean(`${brand} disposable nitrile gloves industrial`),
      tier: "category_generic",
    });
  }
  if (gloves) {
    out.push({ text: "disposable nitrile gloves product photo", tier: "category_generic" });
  }

  const seen = new Set<string>();
  return out.filter((q) => {
    const k = q.text.toLowerCase();
    if (seen.has(k) || q.text.length < 6) return false;
    seen.add(k);
    return true;
  });
}

/**
 * AI suggests extra search strings (JSON only). Merged after rule-based; duplicates removed.
 */
export async function augmentImageSearchQueriesWithAi(
  ctx: ImageSearchContextInput,
  ruleBased: ImageSearchQueryItem[]
): Promise<ImageSearchQueryItem[]> {
  const out = await structuredCompletion({
    system: [
      "You help build image search queries for B2B PPE / glove catalog rows.",
      "Return JSON only: { \"queries\": string[] } with up to 6 short web-image search phrases.",
      "No URLs. No instructions to browse. Phrases should help find a pack/product photo.",
      "Prefer manufacturer + SKU stem + product type (nitrile gloves, disposable, etc.).",
    ].join("\n"),
    user: [
      `supplier_sku: ${ctx.supplier_sku || "(none)"}`,
      `base_sku: ${ctx.base_sku || "(none)"}`,
      `brand: ${ctx.brand || "(none)"}`,
      `title: ${ctx.title || "(none)"}`,
      `category: ${ctx.categorySlug || "(none)"}`,
      `variant: ${ctx.variant_axis || "—"} = ${ctx.variant_value || "—"}`,
      `existing_queries: ${ruleBased.map((q) => q.text).join(" | ") || "(none)"}`,
    ].join("\n"),
    schema: AiQueriesSchema,
    maxRetries: 1,
  });
  if (!out?.queries?.length) return ruleBased;

  const seen = new Set(ruleBased.map((q) => q.text.toLowerCase()));
  const merged = [...ruleBased];
  for (const q of out.queries) {
    const t = clean(q, 200);
    const k = t.toLowerCase();
    if (t.length < 6 || seen.has(k)) continue;
    seen.add(k);
    merged.push({ text: t, tier: "title_brand" });
  }
  return merged;
}

export async function buildImageSearchQueryPlan(ctx: ImageSearchContextInput): Promise<ImageSearchQueryItem[]> {
  const rules = buildRuleBasedImageSearchQueries(ctx);
  if (process.env.CATALOGOS_IMAGE_SEARCH_AI_QUERIES === "0") return rules;
  try {
    return await augmentImageSearchQueriesWithAi(ctx, rules);
  } catch {
    return rules;
  }
}

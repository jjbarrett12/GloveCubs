/**
 * Family-first image enrichment for supplier_products_normalized (glove variant batches).
 *
 * Resolves one hero image per family_group_key (or per row when no family), then applies it to
 * every variant unless image_variant_override is set with an existing URL.
 *
 * Search order (first good candidate wins structurally; best adjusted score is chosen among all):
 *   canonical master (any linked master) → supplier file URL → manufacturer base SKU →
 *   manufacturer variant SKUs → catalog base SKU → catalog variant SKUs → title match →
 *   controlled image search (brand + base SKU + title).
 *
 * Persists: family_image_url, family_image_source, family_image_confidence, family_image_search_query,
 * family_image_missing, image_url, images[], image_source, image_confidence, image_search_query,
 * image_missing, image_inherits_family.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { ImageSearchTier } from "./image-search-queries";
import { buildImageSearchQueryPlan } from "./image-search-queries";
import { adjustImageCandidateScore, pickBestCandidate } from "./image-enrichment-scoring";

export type ImageEnrichmentSource =
  | "file"
  | "canonical"
  | "sku_catalog"
  | "sku_catalog_base"
  | "title_match"
  | "search"
  | "family_assign"
  | "mfr_base_sku"
  | "mfr_variant_sku"
  | "family_reuse"
  | "none";

/** Structural confidence before URL heuristics / remote scorer. */
export const IMAGE_STRUCTURAL_SCORE = {
  FILE: 0.99,
  CANONICAL_MASTER: 0.92,
  MFR_BASE: 0.94,
  MFR_VARIANT: 0.9,
  CATALOG_EXACT_VARIANT: 0.93,
  CATALOG_EXACT_BASE: 0.96,
  TITLE_BRAND: 0.72,
  SEARCH_TIER: {
    exact_sku: 0.68,
    base_sku_family: 0.62,
    title_brand: 0.55,
    category_generic: 0.42,
  } satisfies Record<ImageSearchTier, number>,
} as const;

export const IMAGE_CONFIDENCE = {
  FILE: IMAGE_STRUCTURAL_SCORE.FILE,
  CANONICAL_MASTER: IMAGE_STRUCTURAL_SCORE.CANONICAL_MASTER,
  EXACT_SKU_CATALOG: IMAGE_STRUCTURAL_SCORE.CATALOG_EXACT_VARIANT,
  TITLE_BRAND: IMAGE_STRUCTURAL_SCORE.TITLE_BRAND,
  FAMILY_REUSE_CAP: 0.82,
  SEARCH_TIER: IMAGE_STRUCTURAL_SCORE.SEARCH_TIER,
} as const;

export const IMAGE_SEARCH_MIN_STORE_CONFIDENCE = 0.4;
export const IMAGE_CONFIDENCE_AUTO_CANDIDATE_MIN = 0.72;

const PAGE = 200;

function tierSearchConfidence(tier: ImageSearchTier): number {
  return IMAGE_STRUCTURAL_SCORE.SEARCH_TIER[tier];
}

function httpImageUrl(u: string): string | null {
  const t = u.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return null;
}

function firstImageFromNormalized(nd: Record<string, unknown>): string | null {
  const imgs = nd.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    for (const x of imgs) {
      const u = httpImageUrl(String(x));
      if (u) return u;
    }
  }
  const single = nd.image_url;
  if (typeof single === "string") return httpImageUrl(single);
  return null;
}

function stripMissingImageFlag(nd: Record<string, unknown>): Record<string, unknown> {
  const flags = nd.anomaly_flags;
  if (!Array.isArray(flags)) return nd;
  const next = flags.filter(
    (f: unknown) =>
      !(f && typeof f === "object" && (f as { code?: string }).code === "missing_image")
  );
  return next.length === flags.length ? nd : { ...nd, anomaly_flags: next };
}

function hasVariantImageOverride(nd: Record<string, unknown>): boolean {
  return nd.image_variant_override === true && Boolean(firstImageFromNormalized(nd));
}

function withRowImageAndFamilyMeta(
  nd: Record<string, unknown>,
  url: string,
  source: ImageEnrichmentSource,
  meta: {
    confidence: number;
    image_search_query?: string | null;
    family_image_url: string;
    family_image_source: ImageEnrichmentSource;
    family_image_confidence: number;
    family_image_search_query?: string | null;
    family_image_missing: boolean;
    image_inherits_family: boolean;
  }
): Record<string, unknown> {
  const base = stripMissingImageFlag({ ...nd });
  const existing = Array.isArray(base.images) ? [...(base.images as unknown[])] : [];
  if (!existing.some((x) => String(x) === url)) existing.unshift(url);
  const next: Record<string, unknown> = {
    ...base,
    images: existing,
    image_url: url,
    image_source: source,
    image_missing: false,
    image_confidence: Math.round(meta.confidence * 1000) / 1000,
    family_image_url: meta.family_image_url,
    family_image_source: meta.family_image_source,
    family_image_confidence: Math.round(meta.family_image_confidence * 1000) / 1000,
    family_image_missing: meta.family_image_missing,
    image_inherits_family: meta.image_inherits_family,
  };
  if (meta.image_search_query != null && String(meta.image_search_query).trim()) {
    next.image_search_query = String(meta.image_search_query).trim().slice(0, 500);
  } else delete next.image_search_query;
  if (meta.family_image_search_query != null && String(meta.family_image_search_query).trim()) {
    next.family_image_search_query = String(meta.family_image_search_query).trim().slice(0, 500);
  } else delete next.family_image_search_query;
  return next;
}

function markFamilyMissing(nd: Record<string, unknown>): Record<string, unknown> {
  const flags = Array.isArray(nd.anomaly_flags) ? [...(nd.anomaly_flags as object[])] : [];
  const has = flags.some((f: { code?: string }) => f?.code === "missing_image");
  if (!has) {
    flags.push({
      code: "missing_image",
      message: "No family image URL after enrichment",
      severity: "warning",
    });
  }
  const next = { ...nd };
  delete next.image_confidence;
  delete next.image_search_query;
  delete next.family_image_search_query;
  return {
    ...next,
    image_missing: true,
    image_source: "none",
    family_image_missing: true,
    family_image_url: null,
    family_image_source: "none",
    family_image_confidence: null,
    image_inherits_family: false,
    anomaly_flags: flags,
  };
}

async function loadPrimaryImagesForProducts(productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (productIds.length === 0) return out;
  const supabase = getSupabaseCatalogos(true);
  const uniq = [...new Set(productIds)];
  for (let i = 0; i < uniq.length; i += 200) {
    const slice = uniq.slice(i, i + 200);
    const { data, error } = await supabase
      .from("product_images")
      .select("product_id, url, sort_order")
      .in("product_id", slice)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`product_images (catalog_v2-backed view): ${error.message}`);
    for (const row of data ?? []) {
      const pid = row.product_id as string;
      if (!out.has(pid)) out.set(pid, String(row.url));
    }
  }
  return out;
}

async function loadSkuToProductId(categoryId: string): Promise<Map<string, string>> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, internal_sku")
    .eq("status", "active")
    .contains("metadata", { category_id: categoryId });
  if (error) throw new Error(`catalog_products sku map: ${error.message}`);
  const m = new Map<string, string>();
  for (const r of data ?? []) {
    const sku = String((r as { internal_sku: string | null }).internal_sku ?? "").trim().toLowerCase();
    if (sku) m.set(sku, (r as { id: string }).id);
  }
  return m;
}

async function loadProductsWithImagesForTitleMatch(
  categoryId: string,
  limit = 2500
): Promise<{ id: string; name: string; url: string | null }[]> {
  const supabase = getSupabaseCatalogos(true);
  const { data: products, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name")
    .eq("status", "active")
    .contains("metadata", { category_id: categoryId })
    .limit(limit);
  if (error) throw new Error(`catalog_products title match: ${error.message}`);
  const list = (products ?? []) as { id: string; name: string }[];
  if (list.length === 0) return [];
  const ids = list.map((p) => p.id);
  const imgMap = await loadPrimaryImagesForProducts(ids);
  return list.map((p) => ({ id: p.id, name: p.name, url: imgMap.get(p.id) ?? null }));
}

function titleTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
}

function bestTitleImageMatch(
  title: string,
  catalog: { id: string; name: string; url: string | null }[]
): string | null {
  const t = title.trim();
  if (!t) return null;
  const tokens = new Set(titleTokens(t));
  if (tokens.size === 0) return null;
  let best: { score: number; url: string } | null = null;
  for (const row of catalog) {
    if (!row.url) continue;
    const nt = titleTokens(row.name);
    if (nt.length === 0) continue;
    let hit = 0;
    for (const w of nt) {
      if (tokens.has(w)) hit++;
    }
    const score = hit / Math.max(nt.length, 1);
    if (score >= 0.4 && (!best || score > best.score)) {
      best = { score, url: row.url };
    }
  }
  return best?.url ?? null;
}

function buildSearchRequestUrl(template: string, query: string): string | null {
  const qEnc = encodeURIComponent(query);
  if (template.includes("{query}")) {
    const u = template.replace(/\{query\}/gi, qEnc);
    return u.startsWith("http") ? u : null;
  }
  return null;
}

function buildLegacySearchUrl(template: string, supplierSku: string, title: string, brand: string): string | null {
  const url = template
    .replace(/\{sku\}/gi, encodeURIComponent(supplierSku))
    .replace(/\{title\}/gi, encodeURIComponent(title.slice(0, 120)))
    .replace(/\{brand\}/gi, encodeURIComponent(brand.slice(0, 80)));
  return url.startsWith("http") ? url : null;
}

async function fetchImageUrlFromSearchEndpoint(requestUrl: string): Promise<string | null> {
  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await res.json()) as { image_url?: string; url?: string };
      const u = j.image_url ?? j.url;
      return typeof u === "string" ? httpImageUrl(u) : null;
    }
    const text = await res.text();
    return httpImageUrl(text.trim().slice(0, 2048));
  } catch {
    return null;
  }
}

async function fetchManufacturerProductImage(sku: string): Promise<string | null> {
  const raw = sku.trim();
  if (!raw) return null;
  const template = process.env.CATALOGOS_MANUFACTURER_IMAGE_URL?.trim();
  if (!template?.includes("{sku}") || !template.startsWith("http")) return null;
  const url = template.replace(/\{sku\}/gi, encodeURIComponent(raw));
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { image_url?: string; url?: string };
    const u = j.image_url ?? j.url;
    return typeof u === "string" ? httpImageUrl(u) : null;
  } catch {
    return null;
  }
}

const VERIFY_SEARCH_IMAGES = process.env.CATALOGOS_IMAGE_ENRICH_VERIFY === "1";

async function quickImageReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(4500),
      redirect: "follow",
      headers: { Accept: "image/*,*/*", "User-Agent": "CatalogOS-ImageEnrich/1.0" },
    });
    if (res.ok) return true;
    if (res.status === 405) {
      const g = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(4500),
        redirect: "follow",
        headers: { Range: "bytes=0-1023", "User-Agent": "CatalogOS-ImageEnrich/1.0" },
      });
      return g.ok;
    }
    return false;
  } catch {
    return false;
  }
}

type CandidateKey = string;

interface RawCandidate {
  url: string;
  baseScore: number;
  source: ImageEnrichmentSource;
  query: string | null;
}

type BatchRow = {
  id: string;
  master_product_id: string | null;
  inferred_base_sku: string | null;
  family_group_key: string | null;
  variant_axis: string | null;
  variant_value: string | null;
  normalized_data: Record<string, unknown>;
};

function addCandidate(map: Map<CandidateKey, RawCandidate>, c: RawCandidate): void {
  const prev = map.get(c.url);
  if (!prev || c.baseScore > prev.baseScore) map.set(c.url, c);
}

function categorySlugFromNd(nd: Record<string, unknown>): string | null {
  const fa = nd.filter_attributes;
  if (fa && typeof fa === "object" && (fa as { category?: string }).category) {
    return String((fa as { category?: string }).category);
  }
  const a = nd.attributes;
  if (a && typeof a === "object" && (a as { category?: string }).category) {
    return String((a as { category?: string }).category);
  }
  return null;
}

function representativeTitle(members: BatchRow[]): string {
  let best = "";
  for (const m of members) {
    const t = String(m.normalized_data.canonical_title ?? "").trim();
    if (t.length > best.length) best = t;
  }
  return best;
}

function representativeBrand(members: BatchRow[]): string {
  for (const m of members) {
    const b = String(m.normalized_data.brand ?? "").trim();
    if (b) return b;
  }
  return "";
}

function inferBaseSku(members: BatchRow[]): string | null {
  for (const m of members) {
    if (m.inferred_base_sku != null && String(m.inferred_base_sku).trim()) {
      return String(m.inferred_base_sku).trim();
    }
  }
  return null;
}

async function collectFamilyCandidates(
  members: BatchRow[],
  imageByMaster: Map<string, string>,
  skuToProductId: Map<string, string>,
  imageByCatalogProductId: Map<string, string>,
  titleCatalog: { id: string; name: string; url: string | null }[]
): Promise<Map<string, RawCandidate>> {
  const map = new Map<string, RawCandidate>();

  for (const row of members) {
    const nd = row.normalized_data;
    const masterId = row.master_product_id;
    if (masterId) {
      const u = imageByMaster.get(masterId);
      if (u) addCandidate(map, { url: u, baseScore: IMAGE_STRUCTURAL_SCORE.CANONICAL_MASTER, source: "canonical", query: null });
    }
  }

  for (const row of members) {
    const nd = row.normalized_data;
    const u = firstImageFromNormalized(nd);
    if (u) addCandidate(map, { url: u, baseScore: IMAGE_STRUCTURAL_SCORE.FILE, source: "file", query: null });
  }

  const baseSku = inferBaseSku(members);
  if (baseSku) {
    const mfrBase = await fetchManufacturerProductImage(baseSku);
    if (mfrBase) {
      addCandidate(map, {
        url: mfrBase,
        baseScore: IMAGE_STRUCTURAL_SCORE.MFR_BASE,
        source: "mfr_base_sku",
        query: baseSku,
      });
    }
  }

  const variantSkus = [
    ...new Set(
      members
        .map((row) => String(row.normalized_data.supplier_sku ?? "").trim())
        .filter(Boolean)
    ),
  ];
  await Promise.all(
    variantSkus.map(async (sku) => {
      const mfrV = await fetchManufacturerProductImage(sku);
      if (mfrV) {
        addCandidate(map, {
          url: mfrV,
          baseScore: IMAGE_STRUCTURAL_SCORE.MFR_VARIANT,
          source: "mfr_variant_sku",
          query: sku,
        });
      }
    })
  );

  if (baseSku) {
    const pidB = skuToProductId.get(baseSku.toLowerCase());
    if (pidB) {
      const u = imageByCatalogProductId.get(pidB);
      if (u) {
        addCandidate(map, {
          url: u,
          baseScore: IMAGE_STRUCTURAL_SCORE.CATALOG_EXACT_BASE,
          source: "sku_catalog_base",
          query: baseSku,
        });
      }
    }
  }

  for (const row of members) {
    const sku = String(row.normalized_data.supplier_sku ?? "").trim().toLowerCase();
    if (!sku) continue;
    const pid = skuToProductId.get(sku);
    if (pid) {
      const u = imageByCatalogProductId.get(pid);
      if (u) {
        addCandidate(map, {
          url: u,
          baseScore: IMAGE_STRUCTURAL_SCORE.CATALOG_EXACT_VARIANT,
          source: "sku_catalog",
          query: sku,
        });
      }
    }
  }

  const brand = representativeBrand(members);
  const title = representativeTitle(members);
  const titleUrl = bestTitleImageMatch(`${brand} ${title}`.trim(), titleCatalog);
  if (titleUrl) {
    addCandidate(map, {
      url: titleUrl,
      baseScore: IMAGE_STRUCTURAL_SCORE.TITLE_BRAND,
      source: "title_match",
      query: title.slice(0, 120),
    });
  }

  const searchTemplate = process.env.CATALOGOS_IMAGE_SEARCH_URL?.trim();
  if (searchTemplate) {
    const cat = categorySlugFromNd(members[0]?.normalized_data ?? {});
    const firstSku = String(members[0]?.normalized_data.supplier_sku ?? "");
    const plan = await buildImageSearchQueryPlan({
      supplier_sku: firstSku,
      base_sku: baseSku,
      brand,
      title,
      categorySlug: cat,
      variant_axis: null,
      variant_value: null,
    });

    for (const item of plan) {
      const requestUrl = buildSearchRequestUrl(searchTemplate, item.text);
      if (!requestUrl) continue;
      const conf = tierSearchConfidence(item.tier);
      if (conf < IMAGE_SEARCH_MIN_STORE_CONFIDENCE) continue;
      const url = await fetchImageUrlFromSearchEndpoint(requestUrl);
      if (!url) continue;
      if (VERIFY_SEARCH_IMAGES && !(await quickImageReachable(url))) continue;
      addCandidate(map, { url, baseScore: conf, source: "search", query: item.text });
    }

    if (!searchTemplate.includes("{query}") && members[0]) {
      const nd0 = members[0].normalized_data;
      const legacyUrl = buildLegacySearchUrl(
        searchTemplate,
        String(nd0.supplier_sku ?? ""),
        String(nd0.canonical_title ?? ""),
        String(nd0.brand ?? "")
      );
      if (legacyUrl) {
        const url = await fetchImageUrlFromSearchEndpoint(legacyUrl);
        if (url && tierSearchConfidence("exact_sku") >= IMAGE_SEARCH_MIN_STORE_CONFIDENCE) {
          if (!VERIFY_SEARCH_IMAGES || (await quickImageReachable(url))) {
            addCandidate(map, {
              url,
              baseScore: tierSearchConfidence("exact_sku"),
              source: "search",
              query: "legacy_template",
            });
          }
        }
      }
    }
  }

  return map;
}

async function pickWinningCandidate(raw: Map<string, RawCandidate>): Promise<RawCandidate | null> {
  if (raw.size === 0) return null;
  const adjusted: (RawCandidate & { adjustedScore: number })[] = [];
  for (const c of raw.values()) {
    const { score } = await adjustImageCandidateScore(c.url, c.baseScore);
    adjusted.push({ ...c, adjustedScore: score });
  }
  const best = pickBestCandidate(adjusted);
  if (!best || best.adjustedScore < IMAGE_SEARCH_MIN_STORE_CONFIDENCE) return null;
  return {
    url: best.url,
    baseScore: best.adjustedScore,
    source: best.source,
    query: best.query,
  };
}

export interface ImageEnrichmentBatchResult {
  updated: number;
  skippedHadImage: number;
  filledCanonical: number;
  filledSku: number;
  filledTitle: number;
  filledSearch: number;
  filledMfr: number;
  filledFamilyReuse: number;
  stillMissing: number;
}

async function loadAllBatchRows(batchId: string): Promise<BatchRow[]> {
  const supabase = getSupabaseCatalogos(true);
  const all: BatchRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: rows, error } = await supabase
      .from("supplier_products_normalized")
      .select(
        "id, master_product_id, inferred_base_sku, family_group_key, variant_axis, variant_value, normalized_data"
      )
      .eq("batch_id", batchId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`load batch rows: ${error.message}`);
    const chunk = (rows ?? []) as BatchRow[];
    if (chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return all;
}

function groupByFamily(rows: BatchRow[]): Map<string, BatchRow[]> {
  const m = new Map<string, BatchRow[]>();
  for (const row of rows) {
    const key = row.family_group_key != null && String(row.family_group_key).trim()
      ? String(row.family_group_key)
      : `__singleton__:${row.id}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(row);
  }
  return m;
}

/**
 * Enrich batch: one resolved image per family (or singleton), propagated to all variants.
 */
export async function runImageEnrichmentForBatch(
  batchId: string,
  categoryId: string
): Promise<ImageEnrichmentBatchResult> {
  const supabase = getSupabaseCatalogos(true);
  const stats: ImageEnrichmentBatchResult = {
    updated: 0,
    skippedHadImage: 0,
    filledCanonical: 0,
    filledSku: 0,
    filledTitle: 0,
    filledSearch: 0,
    filledMfr: 0,
    filledFamilyReuse: 0,
    stillMissing: 0,
  };

  const allRows = await loadAllBatchRows(batchId);
  const skuToProductId = await loadSkuToProductId(categoryId);
  const catalogProductIds = [...new Set(skuToProductId.values())];
  const imageByCatalogProductId = await loadPrimaryImagesForProducts(catalogProductIds);
  const titleCatalog = await loadProductsWithImagesForTitleMatch(categoryId);

  const masterIds = [...new Set(allRows.map((r) => r.master_product_id).filter(Boolean) as string[])];
  const imageByMaster = await loadPrimaryImagesForProducts(masterIds);

  const groups = groupByFamily(allRows);

  for (const [, members] of groups) {
    const multi = members.length > 1;

    const raw = await collectFamilyCandidates(
      members,
      imageByMaster,
      skuToProductId,
      imageByCatalogProductId,
      titleCatalog
    );
    const winner = await pickWinningCandidate(raw);

    if (winner) {
      if (winner.source === "canonical") stats.filledCanonical++;
      else if (winner.source === "sku_catalog" || winner.source === "sku_catalog_base") stats.filledSku++;
      else if (winner.source === "title_match") stats.filledTitle++;
      else if (winner.source === "search") stats.filledSearch++;
      else if (winner.source === "mfr_base_sku" || winner.source === "mfr_variant_sku") stats.filledMfr++;
    }

    for (const row of members) {
      let nd = { ...row.normalized_data };

      if (!winner) {
        nd = markFamilyMissing(nd);
        stats.stillMissing++;
        await supabase.from("supplier_products_normalized").update({ normalized_data: nd }).eq("id", row.id);
        stats.updated++;
        continue;
      }

      const conf = winner.baseScore;
      const famQuery = winner.query;

      if (hasVariantImageOverride(nd)) {
        nd = stripMissingImageFlag({
          ...nd,
          family_image_url: winner.url,
          family_image_source: winner.source,
          family_image_confidence: conf,
          family_image_search_query: famQuery ?? undefined,
          family_image_missing: false,
          image_inherits_family: false,
          image_missing: false,
        });
        await supabase.from("supplier_products_normalized").update({ normalized_data: nd }).eq("id", row.id);
        stats.updated++;
        continue;
      }

      const assignSource: ImageEnrichmentSource = multi ? "family_assign" : winner.source;
      const inherits = multi;

      nd = withRowImageAndFamilyMeta(nd, winner.url, assignSource, {
        confidence: conf,
        image_search_query: famQuery,
        family_image_url: winner.url,
        family_image_source: winner.source,
        family_image_confidence: conf,
        family_image_search_query: famQuery,
        family_image_missing: false,
        image_inherits_family: inherits,
      });

      if (assignSource === "family_assign") stats.filledFamilyReuse++;

      await supabase.from("supplier_products_normalized").update({ normalized_data: nd }).eq("id", row.id);
      stats.updated++;
    }
  }

  return stats;
}

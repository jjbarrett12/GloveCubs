/**
 * Defensive normalizers for CatalogOS URL import responses.
 *
 * CatalogOS owns the truth shape (see catalogos/src/lib/url-import/admin-data.ts).
 * Storefront must not crash on missing fields or schema drift — only show what is present.
 */

export type NormalizedUrlImportStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "unknown";

export type UrlImportJobSummary = {
  id: string;
  supplierName: string;
  startUrl: string;
  allowedDomain: string | null;
  crawlMode: string | null;
  maxPages: number | null;
  status: NormalizedUrlImportStatus;
  rawStatus: string;
  pagesDiscovered: number | null;
  pagesCrawled: number | null;
  productPagesDetected: number | null;
  productsExtracted: number | null;
  familyGroupsInferred: number | null;
  failedPagesCount: number | null;
  warnings: string[];
  importBatchId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
};

export type UrlImportExtractedProduct = {
  id: string;
  title: string;
  brand: string | null;
  sku: string | null;
  mpn: string | null;
  gtin: string | null;
  sourceUrl: string | null;
  images: string[];
  attributes: Array<{ key: string; value: string }>;
  warnings: string[];
  duplicateCandidates: Array<{
    label: string;
    targetId: string | null;
    similarity: number | null;
    reasons: string[];
  }>;
  familyGroupKey: string | null;
  baseSku: string | null;
  size: string | null;
  confidence: number | null;
  aiUsed: boolean | null;
  extractionMethod: string | null;
};

export type UrlImportJobDetail = {
  job: UrlImportJobSummary;
  products: UrlImportExtractedProduct[];
  familyGroups: Array<{ key: string; baseSku: string; count: number; productIds: string[] }>;
  /** Optional original payload retained for debug panel only. */
  raw: unknown;
};

const TERMINAL_STATUSES = new Set<NormalizedUrlImportStatus>(["completed", "failed", "canceled"]);

export function isTerminalStatus(s: NormalizedUrlImportStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

export function normalizeUrlImportStatus(input: unknown): {
  status: NormalizedUrlImportStatus;
  raw: string;
} {
  const raw = typeof input === "string" ? input : input == null ? "" : String(input);
  const s = raw.trim().toLowerCase();
  if (!s) return { status: "unknown", raw };
  if (["queued", "pending", "scheduled"].includes(s)) return { status: "queued", raw };
  if (["running", "crawling", "extracting", "in_progress", "in-progress", "started"].includes(s))
    return { status: "running", raw };
  if (["completed", "complete", "finished", "succeeded", "success", "done"].includes(s))
    return { status: "completed", raw };
  if (["failed", "error", "errored"].includes(s)) return { status: "failed", raw };
  if (["canceled", "cancelled", "aborted"].includes(s)) return { status: "canceled", raw };
  return { status: "unknown", raw };
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim()))
      .filter(Boolean);
  }
  if (typeof v === "string") {
    const t = v.trim();
    return t ? [t] : [];
  }
  return [];
}

function pickFirstString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = asString(o[k]);
    if (v) return v;
  }
  return null;
}

function unwrapExtractedField(v: unknown): unknown {
  const o = asObject(v);
  if (!o) return v;
  if ("raw_value" in o || "normalized_value" in o) {
    return o.raw_value ?? o.normalized_value ?? null;
  }
  return v;
}

const ATTR_FIELD_WHITELIST: Array<{ key: string; label: string }> = [
  { key: "material", label: "Material" },
  { key: "size", label: "Size" },
  { key: "color", label: "Color" },
  { key: "thickness_mil", label: "Thickness (mil)" },
  { key: "thickness", label: "Thickness" },
  { key: "powder_status", label: "Powder" },
  { key: "powder_free", label: "Powder free" },
  { key: "grade", label: "Grade" },
  { key: "glove_type", label: "Glove type" },
  { key: "case_qty", label: "Case qty" },
  { key: "box_qty", label: "Box qty" },
  { key: "gloves_per_box", label: "Gloves / box" },
  { key: "boxes_per_case", label: "Boxes / case" },
  { key: "total_gloves_per_case", label: "Total / case" },
];

function collectAttributes(payload: Record<string, unknown>): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  const seen = new Set<string>();
  for (const { key, label } of ATTR_FIELD_WHITELIST) {
    if (seen.has(label)) continue;
    const raw = unwrapExtractedField(payload[key]);
    const s = asString(raw);
    if (s) {
      out.push({ key: label, value: s });
      seen.add(label);
    }
  }
  return out;
}

function collectImages(payload: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u: string | null) => {
    if (!u) return;
    if (!(u.startsWith("http://") || u.startsWith("https://"))) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  push(asString(payload.image_url));
  for (const u of asStringArray(payload.images)) push(u);
  for (const u of asStringArray(payload.image_urls)) push(u);
  return out;
}

function collectDuplicateCandidates(
  payload: Record<string, unknown>,
  rootProduct: Record<string, unknown>
): UrlImportExtractedProduct["duplicateCandidates"] {
  const sources: unknown[] = [
    payload.potential_duplicates,
    payload.duplicate_candidates,
    payload.duplicates,
    rootProduct.potential_duplicates,
    rootProduct.duplicate_candidates,
    rootProduct.duplicates,
  ];
  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    return src
      .map((item) => {
        const o = asObject(item);
        if (!o) return null;
        const label =
          pickFirstString(o, ["product_name", "name", "title", "label"]) ?? "Possible duplicate";
        const targetId =
          pickFirstString(o, ["canonical_product_id", "product_id", "target_id", "id"]) ?? null;
        const similarity = asNumber(o.similarity_score ?? o.similarity ?? o.score);
        const reasons = asStringArray(o.match_reasons ?? o.reasons ?? o.signals);
        return { label, targetId, similarity, reasons };
      })
      .filter((x): x is UrlImportExtractedProduct["duplicateCandidates"][number] => x !== null);
  }
  return [];
}

function collectWarnings(payload: Record<string, unknown>, rootProduct: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const list of [payload.warnings, payload.extraction_warnings, rootProduct.warnings]) {
    for (const w of asStringArray(list)) out.add(w);
  }
  return Array.from(out);
}

function buildExtractedProduct(rawProduct: unknown): UrlImportExtractedProduct | null {
  const p = asObject(rawProduct);
  if (!p) return null;
  const id = pickFirstString(p, ["id", "product_id", "uuid"]);
  if (!id) return null;
  const payload = asObject(p.normalized_payload) ?? asObject(p.payload) ?? {};
  const title =
    pickFirstString(payload, ["name", "title", "product_name", "canonical_title"]) ??
    pickFirstString(p, ["title", "name"]) ??
    "Untitled extracted product";
  const brand = pickFirstString(payload, ["brand", "manufacturer"]);
  const sku = pickFirstString(payload, ["sku", "supplier_sku", "internal_sku"]);
  const mpn = pickFirstString(payload, ["manufacturer_part_number", "mpn", "part_number"]);
  const gtin = pickFirstString(payload, ["upc", "gtin", "ean", "barcode"]);
  const sourceUrl = pickFirstString(p, ["source_url"]) ?? pickFirstString(payload, ["source_url"]);
  const confidenceRaw = asNumber(p.confidence ?? payload.confidence);
  const confidence =
    confidenceRaw == null
      ? null
      : confidenceRaw > 1
        ? Math.min(1, confidenceRaw / 100)
        : Math.max(0, confidenceRaw);
  const aiUsedRaw = p.ai_used ?? payload.ai_used;
  const aiUsed = typeof aiUsedRaw === "boolean" ? aiUsedRaw : null;

  return {
    id,
    title,
    brand,
    sku,
    mpn,
    gtin,
    sourceUrl,
    images: collectImages(payload),
    attributes: collectAttributes(payload),
    warnings: collectWarnings(payload, p),
    duplicateCandidates: collectDuplicateCandidates(payload, p),
    familyGroupKey: pickFirstString(p, ["family_group_key"]),
    baseSku: pickFirstString(p, ["inferred_base_sku"]) ?? pickFirstString(payload, ["base_sku"]),
    size: pickFirstString(p, ["inferred_size"]) ?? pickFirstString(payload, ["size"]),
    confidence,
    aiUsed,
    extractionMethod: pickFirstString(p, ["extraction_method"]),
  };
}

export function adaptUrlImportJobSummary(input: unknown): UrlImportJobSummary | null {
  const root = asObject(input);
  if (!root) return null;
  const job = asObject(root.job) ?? root;
  const id = pickFirstString(job, ["id", "jobId"]);
  if (!id) return null;
  const { status, raw } = normalizeUrlImportStatus(job.status);
  return {
    id,
    supplierName: pickFirstString(job, ["supplier_name", "supplierName"]) ?? "Unknown supplier",
    startUrl: pickFirstString(job, ["start_url", "startUrl"]) ?? "",
    allowedDomain: pickFirstString(job, ["allowed_domain", "allowedDomain"]),
    crawlMode: pickFirstString(job, ["crawl_mode", "crawlMode"]),
    maxPages: asNumber(job.max_pages ?? job.maxPages),
    status,
    rawStatus: raw,
    pagesDiscovered: asNumber(job.pages_discovered ?? job.pagesDiscovered),
    pagesCrawled: asNumber(job.pages_crawled ?? job.pagesCrawled),
    productPagesDetected: asNumber(job.product_pages_detected ?? job.productPagesDetected),
    productsExtracted: asNumber(job.products_extracted ?? job.productsExtracted),
    familyGroupsInferred: asNumber(job.family_groups_inferred ?? job.familyGroupsInferred),
    failedPagesCount: asNumber(job.failed_pages_count ?? job.failedPagesCount),
    warnings: asStringArray(job.warnings),
    importBatchId: pickFirstString(job, ["import_batch_id", "importBatchId"]),
    startedAt: pickFirstString(job, ["started_at", "startedAt"]),
    finishedAt: pickFirstString(job, ["finished_at", "finishedAt"]),
    createdAt: pickFirstString(job, ["created_at", "createdAt"]),
  };
}

export function adaptUrlImportJobList(input: unknown): UrlImportJobSummary[] {
  const list = Array.isArray(input)
    ? input
    : Array.isArray(asObject(input)?.jobs)
      ? (asObject(input)!.jobs as unknown[])
      : Array.isArray(asObject(input)?.data)
        ? (asObject(input)!.data as unknown[])
        : [];
  const out: UrlImportJobSummary[] = [];
  for (const j of list) {
    const summary = adaptUrlImportJobSummary(j);
    if (summary) out.push(summary);
  }
  return out;
}

export function adaptUrlImportJobDetail(input: unknown): UrlImportJobDetail | null {
  const root = asObject(input);
  if (!root) return null;
  const job = adaptUrlImportJobSummary(root);
  if (!job) return null;

  const productList = Array.isArray(root.products) ? root.products : [];
  const products: UrlImportExtractedProduct[] = [];
  for (const p of productList) {
    const adapted = buildExtractedProduct(p);
    if (adapted) products.push(adapted);
  }

  const familyGroups: UrlImportJobDetail["familyGroups"] = [];
  const fgInput = Array.isArray(root.familyGroups) ? root.familyGroups : [];
  for (const g of fgInput) {
    const o = asObject(g);
    if (!o) continue;
    const key = pickFirstString(o, ["family_group_key", "key"]);
    if (!key) continue;
    const baseSku = pickFirstString(o, ["inferred_base_sku", "base_sku"]) ?? "";
    const count = asNumber(o.count) ?? 0;
    const ids: string[] = [];
    const pl = Array.isArray(o.products) ? o.products : [];
    for (const p of pl) {
      const id = pickFirstString(asObject(p) ?? {}, ["id", "product_id"]);
      if (id) ids.push(id);
    }
    familyGroups.push({ key, baseSku, count, productIds: ids });
  }

  return { job, products, familyGroups, raw: input };
}

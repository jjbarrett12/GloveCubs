/**
 * Canonical catalog reads for ingestion, matching, and supplier flows.
 * Truth: catalog_v2.catalog_products + catalogos.product_attributes + catalog_v2.catalog_variants.
 */

import { getSupabaseAdmin, getSupabaseCatalogos } from "../jobs/supabase";
import type { ProductData } from "../legacy/productMatching";

function v2() {
  return getSupabaseAdmin().schema("catalog_v2");
}

type PaRow = {
  product_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  attribute_definitions:
    | { attribute_key: string }
    | { attribute_key: string }[]
    | null;
};

function embedAttributeKey(embed: PaRow["attribute_definitions"]): string | null {
  if (!embed) return null;
  if (Array.isArray(embed)) {
    const k = embed[0]?.attribute_key;
    return typeof k === "string" ? k : null;
  }
  const k = embed.attribute_key;
  return typeof k === "string" ? k : null;
}

function cellToScalar(
  row: Pick<PaRow, "value_text" | "value_number" | "value_boolean">
): string | number | boolean | null {
  if (row.value_text != null && String(row.value_text).trim() !== "")
    return String(row.value_text).trim();
  if (row.value_number != null && Number.isFinite(Number(row.value_number)))
    return Number(row.value_number);
  if (row.value_boolean !== null && row.value_boolean !== undefined) return row.value_boolean;
  return null;
}

/** Escape % and _ when embedding user text inside ILIKE %…% patterns. */
export function escapeIlikeFragment(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function normalizeMatchKey(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

function mergePaRowsIntoRecord(rows: PaRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = embedAttributeKey(row.attribute_definitions);
    const v = cellToScalar(row);
    if (!key || v === null) continue;
    const cur = out[key];
    if (cur === undefined) {
      out[key] = v;
    } else if (Array.isArray(cur)) {
      (cur as unknown[]).push(v);
    } else {
      out[key] = [cur, v];
    }
  }
  return out;
}

function strAttr(attrs: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const raw = attrs[k];
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      const first = raw[0];
      if (first != null && typeof first !== "object") return String(first).trim();
      continue;
    }
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    if (typeof raw === "boolean") return raw ? "true" : "false";
  }
  return undefined;
}

function numAttr(attrs: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const raw = attrs[k];
    if (raw == null) continue;
    const n = typeof raw === "number" ? raw : Number(Array.isArray(raw) ? raw[0] : raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function boolAttr(attrs: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const k of keys) {
    const raw = attrs[k];
    if (typeof raw === "boolean") return raw;
    if (raw === "true" || raw === true) return true;
    if (raw === "false" || raw === false) return false;
  }
  return undefined;
}

export type V2MatchCorpus = {
  catalog: ProductData[];
  variantSkuToProductId: Map<string, string>;
  parentSkuToProductId: Map<string, string>;
};

/**
 * Active catalog parents with facet values from product_attributes and representative variant size.
 */
export async function loadV2CatalogMatchCorpus(limit: number): Promise<V2MatchCorpus> {
  const variantSkuToProductId = new Map<string, string>();
  const parentSkuToProductId = new Map<string, string>();

  const { data: products, error } = await v2()
    .from("catalog_products")
    .select("id, internal_sku, name, metadata")
    .eq("status", "active")
    .limit(limit);

  if (error) {
    throw new Error(`catalog_v2.catalog_products: ${error.message}`);
  }

  const rows = products ?? [];
  const ids = rows.map((r) => r.id as string).filter(Boolean);
  if (ids.length === 0) {
    return { catalog: [], variantSkuToProductId, parentSkuToProductId };
  }

  const cat = getSupabaseCatalogos();
  const { data: paRows, error: paErr } = await cat
    .from("product_attributes")
    .select(
      "product_id, value_text, value_number, value_boolean, attribute_definitions(attribute_key)"
    )
    .in("product_id", ids);

  if (paErr) {
    throw new Error(`catalogos.product_attributes: ${paErr.message}`);
  }

  const paLists = new Map<string, PaRow[]>();
  for (const r of (paRows ?? []) as PaRow[]) {
    const pid = r.product_id;
    if (!pid) continue;
    const list = paLists.get(pid) ?? [];
    list.push(r);
    paLists.set(pid, list);
  }

  const { data: varRows, error: vErr } = await v2()
    .from("catalog_variants")
    .select("catalog_product_id, variant_sku, size_code, sort_order")
    .in("catalog_product_id", ids)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (vErr) {
    throw new Error(`catalog_v2.catalog_variants: ${vErr.message}`);
  }

  const variantsByProduct = new Map<string, Array<{ variant_sku: string; size_code: string | null }>>();
  for (const v of varRows ?? []) {
    const pid = v.catalog_product_id as string;
    const vs = v.variant_sku as string;
    if (!pid || !vs) continue;
    const nk = normalizeMatchKey(vs);
    if (nk) variantSkuToProductId.set(nk, pid);
    const list = variantsByProduct.get(pid) ?? [];
    list.push({ variant_sku: vs, size_code: (v.size_code as string | null) ?? null });
    variantsByProduct.set(pid, list);
  }

  const catalog: ProductData[] = [];
  for (const p of rows) {
    const id = p.id as string;
    const internalSku = (p.internal_sku as string | null) ?? "";
    if (internalSku) {
      const nk = normalizeMatchKey(internalSku);
      if (nk) parentSkuToProductId.set(nk, id);
    }

    const attrs = mergePaRowsIntoRecord(paLists.get(id) ?? []);
    const vars = variantsByProduct.get(id) ?? [];
    const distinctSizes = new Set(
      vars
        .map((x) => x.size_code)
        .filter((s): s is string => s != null && String(s).trim() !== "")
    );
    const representativeSize =
      distinctSizes.size === 1
        ? Array.from(distinctSizes)[0]!
        : vars[0]?.size_code != null && String(vars[0].size_code).trim()
          ? String(vars[0].size_code)
          : undefined;

    catalog.push({
      id,
      sku: internalSku,
      name: (p.name as string) || "",
      canonical_title: (p.name as string) || "",
      material: strAttr(attrs, "material", "glove_material"),
      color: strAttr(attrs, "color"),
      grade: strAttr(attrs, "grade", "glove_grade"),
      texture: strAttr(attrs, "texture"),
      thickness_mil: numAttr(attrs, "thickness_mil", "mil"),
      size: representativeSize,
      units_per_box: numAttr(attrs, "units_per_box"),
      boxes_per_case: numAttr(attrs, "boxes_per_case"),
      total_units_per_case: numAttr(attrs, "total_units_per_case"),
      powder_free: boolAttr(attrs, "powder_free"),
      latex_free: boolAttr(attrs, "latex_free"),
      exam_grade: boolAttr(attrs, "exam_grade"),
      medical_grade: boolAttr(attrs, "medical_grade"),
      food_safe: boolAttr(attrs, "food_safe"),
      manufacturer_part_number: strAttr(attrs, "manufacturer_part_number", "mpn"),
      mpn: strAttr(attrs, "mpn"),
      upc: strAttr(attrs, "upc", "gtin"),
      brand: strAttr(attrs, "brand"),
    });
  }

  return { catalog, variantSkuToProductId, parentSkuToProductId };
}

/** Resolve by variant_sku first, then catalog_products.internal_sku (active only). */
export async function resolveCatalogProductBySku(
  sku: string
): Promise<{ id: string; name: string } | null> {
  const raw = String(sku ?? "").trim();
  if (!raw) return null;
  const v2c = v2();

  const { data: byVariant } = await v2c
    .from("catalog_variants")
    .select("catalog_product_id")
    .eq("variant_sku", raw)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  let productId: string | null = (byVariant?.catalog_product_id as string) ?? null;

  if (!productId) {
    const { data: byParent } = await v2c
      .from("catalog_products")
      .select("id")
      .eq("internal_sku", raw)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    productId = (byParent?.id as string) ?? null;
  }

  if (!productId) return null;

  const { data: row } = await v2c
    .from("catalog_products")
    .select("id, name")
    .eq("id", productId)
    .eq("status", "active")
    .single();

  if (!row?.id || row.name == null) return null;
  return { id: String(row.id), name: String(row.name) };
}

export async function fetchCatalogProductNamesByIds(
  productIds: string[]
): Promise<Map<string, string>> {
  const uniq = Array.from(
    new Set(productIds.filter((x) => typeof x === "string" && x.length > 0))
  ).slice(0, 500);
  if (uniq.length === 0) return new Map();

  const { data, error } = await v2()
    .from("catalog_products")
    .select("id, name")
    .in("id", uniq)
    .eq("status", "active");

  if (error) {
    throw new Error(`catalog_v2.catalog_products names: ${error.message}`);
  }

  const m = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.id != null && r.name != null) m.set(String(r.id), String(r.name));
  }
  return m;
}

export async function searchActiveCatalogProducts(
  search: string,
  limit: number
): Promise<Array<{ id: string; name: string; sku?: string }>> {
  const term = String(search ?? "").trim();
  if (!term) return [];

  const frag = escapeIlikeFragment(term);

  const { data, error } = await v2()
    .from("catalog_products")
    .select("id, name, internal_sku")
    .eq("status", "active")
    .or(`name.ilike.%${frag}%,internal_sku.ilike.%${frag}%`)
    .limit(limit);

  if (error) {
    throw new Error(`catalog_products search: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    sku: r.internal_sku != null ? String(r.internal_sku) : undefined,
  }));
}

/**
 * Match parent products that have a material-like facet and an active variant whose size_code matches.
 */
export async function findCatalogProductsByMaterialAndVariantSize(
  material: string,
  size: string,
  limit: number
): Promise<Array<{ id: string; name: string }>> {
  const mat = String(material ?? "").trim();
  const sz = String(size ?? "").trim();
  if (!mat || !sz) return [];

  const matPat = `%${escapeIlikeFragment(mat)}%`;
  const szKey = normalizeMatchKey(sz);

  const { data: paRows, error: paErr } = await getSupabaseCatalogos()
    .from("product_attributes")
    .select("product_id, value_text, attribute_definitions(attribute_key)")
    .ilike("value_text", matPat)
    .limit(400);

  if (paErr) {
    throw new Error(`product_attributes material scan: ${paErr.message}`);
  }

  const materialProductIds = new Set<string>();
  for (const r of (paRows ?? []) as PaRow[]) {
    const ak = embedAttributeKey(r.attribute_definitions);
    if (ak !== "material" && ak !== "glove_material") continue;
    if (r.product_id) materialProductIds.add(String(r.product_id));
  }

  if (materialProductIds.size === 0) return [];

  const { data: varRows, error: vErr } = await v2()
    .from("catalog_variants")
    .select("catalog_product_id, size_code")
    .in("catalog_product_id", Array.from(materialProductIds))
    .eq("is_active", true);

  if (vErr) {
    throw new Error(`catalog_variants size filter: ${vErr.message}`);
  }

  const hitIds: string[] = [];
  for (const v of varRows ?? []) {
    const pid = v.catalog_product_id as string;
    const sc = v.size_code != null ? normalizeMatchKey(String(v.size_code)) : "";
    if (!pid || !szKey) continue;
    if (sc === szKey || sc.includes(szKey) || szKey.includes(sc)) {
      hitIds.push(pid);
    }
  }

  const unique = Array.from(new Set(hitIds)).slice(0, limit);
  if (unique.length === 0) return [];

  const { data: prows, error: pErr } = await v2()
    .from("catalog_products")
    .select("id, name")
    .in("id", unique)
    .eq("status", "active");

  if (pErr) {
    throw new Error(`catalog_products by id: ${pErr.message}`);
  }

  return (prows ?? []).map((r) => ({ id: String(r.id), name: String(r.name ?? "") }));
}

export type CompetitorCatalogRow = {
  id: string;
  sku: string;
  name: string;
  upc?: string;
  mpn?: string;
};

async function attachBestVariantSkusAndIds(
  productIds: string[]
): Promise<Map<string, { variant_sku: string; gtin: string | null; mpn: string | null }>> {
  const out = new Map<string, { variant_sku: string; gtin: string | null; mpn: string | null }>();
  if (productIds.length === 0) return out;

  const { data: vars, error } = await v2()
    .from("catalog_variants")
    .select("catalog_product_id, variant_sku, gtin, mpn, sort_order")
    .in("catalog_product_id", productIds)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`catalog_variants batch: ${error.message}`);
  }

  for (const v of vars ?? []) {
    const pid = v.catalog_product_id as string;
    const sku = v.variant_sku as string;
    if (!pid || !sku || out.has(pid)) continue;
    out.set(pid, {
      variant_sku: sku,
      gtin: (v.gtin as string | null) ?? null,
      mpn: (v.mpn as string | null) ?? null,
    });
  }
  return out;
}

async function paUpcMpnForProducts(productIds: string[]): Promise<Map<string, { upc?: string; mpn?: string }>> {
  const m = new Map<string, { upc?: string; mpn?: string }>();
  if (productIds.length === 0) return m;

  const { data: paRows, error } = await getSupabaseCatalogos()
    .from("product_attributes")
    .select("product_id, value_text, attribute_definitions(attribute_key)")
    .in("product_id", productIds);

  if (error) {
    throw new Error(`product_attributes batch: ${error.message}`);
  }

  for (const r of (paRows ?? []) as PaRow[]) {
    const pid = r.product_id;
    const ak = embedAttributeKey(r.attribute_definitions);
    const vt = r.value_text != null ? String(r.value_text).trim() : "";
    if (!pid || !ak || !vt) continue;
    const cur = m.get(pid) ?? {};
    if ((ak === "upc" || ak === "gtin") && !cur.upc) cur.upc = vt;
    if ((ak === "mpn" || ak === "manufacturer_part_number") && !cur.mpn) cur.mpn = vt;
    m.set(pid, cur);
  }
  return m;
}

/** Rows for competitor price check: sellable SKU from first active variant when present. */
export async function loadCompetitorCatalogRowsByProductIds(
  ids: string[]
): Promise<CompetitorCatalogRow[]> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return [];

  const { data: prows, error } = await v2()
    .from("catalog_products")
    .select("id, internal_sku, name")
    .in("id", uniq)
    .eq("status", "active");

  if (error) {
    throw new Error(`catalog_products competitor batch: ${error.message}`);
  }

  const rows = prows ?? [];
  const pids = rows.map((r) => String(r.id));
  const [varMap, paMap] = await Promise.all([
    attachBestVariantSkusAndIds(pids),
    paUpcMpnForProducts(pids),
  ]);

  return rows.map((p) => {
    const id = String(p.id);
    const v0 = varMap.get(id);
    const pa = paMap.get(id);
    return {
      id,
      sku: v0?.variant_sku ?? (p.internal_sku != null ? String(p.internal_sku) : ""),
      name: String(p.name ?? ""),
      upc: v0?.gtin ?? pa?.upc,
      mpn: v0?.mpn ?? pa?.mpn,
    };
  });
}

export async function loadCompetitorCatalogRowsBySkus(
  skuList: string[]
): Promise<CompetitorCatalogRow[]> {
  const raw = Array.from(new Set(skuList.map((s) => String(s ?? "").trim()).filter(Boolean)));
  if (raw.length === 0) return [];

  const v2c = v2();
  const { data: varHits } = await v2c
    .from("catalog_variants")
    .select("catalog_product_id, variant_sku, gtin, mpn")
    .in("variant_sku", raw)
    .eq("is_active", true);

  const byVariantPid = new Set<string>();
  for (const v of varHits ?? []) {
    if (v.catalog_product_id) byVariantPid.add(String(v.catalog_product_id));
  }

  const unmatchedSkus = raw.filter(
    (s) => !(varHits ?? []).some((v) => String(v.variant_sku) === s)
  );

  const byParentPid = new Set<string>();
  if (unmatchedSkus.length) {
    const { data: parentHits } = await v2c
      .from("catalog_products")
      .select("id")
      .in("internal_sku", unmatchedSkus)
      .eq("status", "active");
    for (const p of parentHits ?? []) {
      if (p.id) byParentPid.add(String(p.id));
    }
  }

  const mergedIds = new Set<string>();
  byVariantPid.forEach((id) => mergedIds.add(id));
  byParentPid.forEach((id) => mergedIds.add(id));
  return loadCompetitorCatalogRowsByProductIds(Array.from(mergedIds));
}

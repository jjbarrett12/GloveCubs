import { cache } from "react";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { getAttributeDefinitionIdsByKeys } from "@/lib/catalog/store-attribute-defs";
import { fetchStoreProductRowsByIds, type StoreProductRow } from "@/lib/catalog/store-products";

const CERT_SECTION_KEYS = new Set([
  "certifications",
  "compliance_certifications",
  "sterility",
  "grade",
  "cut_level_ansi",
  "puncture_level",
  "abrasion_level",
  "flame_resistant",
  "arc_rating",
]);

/** Ordered commercial summary rows (attribute_key order). */
const COMMERCIAL_SUMMARY_KEYS = [
  "material",
  "grade",
  "uses",
  "industries",
  "protection_tags",
  "powder",
  "thickness_mil",
  "certifications",
] as const;

export type PdpGalleryImage = {
  url: string;
  is_primary: boolean;
  sort_order: number | null;
};

export type PdpVariantRow = {
  id: string;
  variant_sku: string;
  size_code: string | null;
  sort_order: number;
};

export type PdpLabeledValue = { label: string; value: string; attribute_key: string; sort_order: number };

export type PdpDownload = { label: string; url: string };

export type StoreProductDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  internalSku: string | null;
  brandId: string | null;
  brandName: string | null;
  metadata: Record<string, unknown> | null;
  bestPrice: number | null;
  gallery: PdpGalleryImage[];
  variants: PdpVariantRow[];
  defaultVariant: PdpVariantRow | null;
  commercialRows: { label: string; value: string }[];
  specRows: PdpLabeledValue[];
  certificationRows: { label: string; value: string }[];
  downloads: PdpDownload[];
  related: StoreProductRow[];
  /** Default listing row for quote actions (single batched hydrate with `related`). */
  quoteProductRow: StoreProductRow | null;
};

type CatalogProductRow = {
  id: string;
  name: string;
  slug: string;
  brand_id: string | null;
  status: string;
  internal_sku: string | null;
  metadata: Record<string, unknown> | null;
  description: string | null;
};

function validBestPrice(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatAttrCell(r: {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
}): string | null {
  if (r.value_text != null && String(r.value_text).trim() !== "") return String(r.value_text).trim();
  if (r.value_boolean === true || r.value_boolean === false) return r.value_boolean ? "Yes" : "No";
  if (r.value_number != null && Number.isFinite(Number(r.value_number))) return String(r.value_number);
  return null;
}

function isPdfUrl(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url.trim());
}

function downloadsFromMetadata(metadata: Record<string, unknown> | null): PdpDownload[] {
  if (!metadata || typeof metadata !== "object") return [];
  const out: PdpDownload[] = [];
  const seen = new Set<string>();

  const push = (label: string, raw: unknown) => {
    if (typeof raw !== "string") return;
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url) || !isPdfUrl(url) || seen.has(url)) return;
    seen.add(url);
    out.push({ label, url });
  };

  push("Spec sheet", metadata.spec_sheet_url);
  push("SDS", metadata.sds_url);
  push("Technical data sheet", metadata.technical_data_sheet_url);
  push("COA", metadata.coa_url);

  const rawDocs = metadata.product_documents;
  if (Array.isArray(rawDocs)) {
    for (const entry of rawDocs) {
      if (typeof entry === "string") push("Document", entry);
      else if (entry && typeof entry === "object") {
        const o = entry as Record<string, unknown>;
        const url = o.url;
        const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : "Document";
        push(label, url);
      }
    }
  }

  const rawPack = metadata.pack_documents;
  if (Array.isArray(rawPack)) {
    for (const entry of rawPack) {
      if (typeof entry === "string") push("Pack document", entry);
      else if (entry && typeof entry === "object") {
        const o = entry as Record<string, unknown>;
        push(typeof o.label === "string" ? o.label : "Pack document", o.url);
      }
    }
  }

  return out;
}

async function fetchRelatedProductIds(
  supabase: any,
  selfId: string,
  brandId: string | null,
  useValues: string[],
  industryValues: string[]
): Promise<string[]> {
  const defMap = await getAttributeDefinitionIdsByKeys(supabase, ["uses", "industries"]);
  const useDefs = defMap.get("uses") ?? [];
  const indDefs = defMap.get("industries") ?? [];
  const candidates = new Set<string>();

  if (useValues.length > 0 && useDefs.length > 0) {
    const { data } = await supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("product_id")
      .in("attribute_definition_id", useDefs)
      .eq("value_text", useValues[0])
      .neq("product_id", selfId)
      .limit(24);
    for (const r of data ?? []) candidates.add((r as { product_id: string }).product_id);
  }

  if (candidates.size < 8 && industryValues.length > 0 && indDefs.length > 0) {
    const { data } = await supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("product_id")
      .in("attribute_definition_id", indDefs)
      .eq("value_text", industryValues[0])
      .neq("product_id", selfId)
      .limit(24);
    for (const r of data ?? []) candidates.add((r as { product_id: string }).product_id);
  }

  const ordered = Array.from(candidates).filter((id) => id !== selfId);
  if (ordered.length >= 4 || !brandId) return ordered.slice(0, 8);

  const { data: brandPeers } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id")
    .eq("status", "active")
    .eq("brand_id", brandId)
    .neq("id", selfId)
    .limit(12);

  for (const r of brandPeers ?? []) {
    const id = (r as { id: string }).id;
    if (id !== selfId && !ordered.includes(id)) ordered.push(id);
    if (ordered.length >= 8) break;
  }

  return ordered.slice(0, 8);
}

async function loadStoreProductDetail(slug: string): Promise<StoreProductDetail | null> {
  if (!isSupabaseConfigured() || !slug.trim()) return null;

  const supabase = getSupabaseAdmin() as any;
  const { data: product, error: pErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, slug, brand_id, status, internal_sku, metadata, description")
    .eq("slug", slug.trim())
    .eq("status", "active")
    .maybeSingle();

  if (pErr || !product) return null;
  const p = product as CatalogProductRow;
  const pid = p.id;

  const [variantsRes, imagesRes, priceRes, attrsRes, brandRes] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, variant_sku, size_code, sort_order, is_active")
      .eq("catalog_product_id", pid)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }) as Promise<{ data: PdpVariantRow[] | null }>,
    supabase
      .schema("catalog_v2")
      .from("catalog_product_images")
      .select("url, is_primary, sort_order")
      .eq("catalog_product_id", pid)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true }) as Promise<{ data: PdpGalleryImage[] | null }>,
    supabase.from("product_best_offer_price").select("best_price").eq("product_id", pid).maybeSingle() as Promise<{
      data: { best_price: number } | null;
    }>,
    supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("attribute_definition_id, value_text, value_number, value_boolean")
      .eq("product_id", pid) as Promise<{
      data: {
        attribute_definition_id: string;
        value_text: string | null;
        value_number: number | null;
        value_boolean: boolean | null;
      }[] | null;
    }>,
    p.brand_id
      ? (supabase
          .schema("catalogos")
          .from("brands")
          .select("name")
          .eq("id", p.brand_id)
          .maybeSingle() as Promise<{ data: { name: string } | null }>)
      : Promise.resolve({ data: null }),
  ]);

  const attrRows = attrsRes.data ?? [];
  const defIds = Array.from(new Set(attrRows.map((a) => a.attribute_definition_id)));
  const { data: defRows } = defIds.length
    ? await supabase
        .schema("catalogos")
        .from("attribute_definitions")
        .select("id, attribute_key, label, display_group, sort_order")
        .in("id", defIds)
    : { data: [] };

  type DefRow = { attribute_key: string; label: string; sort_order: number };
  const defById = new Map<string, DefRow>(
    (defRows ?? []).map((d: { id: string; attribute_key: string; label: string | null; sort_order: number | null }) => [
      d.id,
      {
        attribute_key: d.attribute_key,
        label: (d.label && d.label.trim()) || d.attribute_key,
        sort_order: d.sort_order ?? 9999,
      },
    ])
  );

  const valuesByKey = new Map<string, { values: Set<string>; label: string; sort: number }>();
  const specRows: PdpLabeledValue[] = [];

  for (const row of attrRows) {
    const def = defById.get(row.attribute_definition_id);
    if (!def) continue;
    const cell = formatAttrCell(row);
    if (!cell) continue;

    specRows.push({
      attribute_key: def.attribute_key,
      label: def.label,
      value: cell,
      sort_order: def.sort_order,
    });

    const bucket = valuesByKey.get(def.attribute_key) ?? {
      values: new Set<string>(),
      label: def.label,
      sort: def.sort_order,
    };
    bucket.values.add(cell);
    if (def.sort_order < bucket.sort) bucket.sort = def.sort_order;
    valuesByKey.set(def.attribute_key, bucket);
  }

  specRows.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.label.localeCompare(b.label);
  });

  const commercialRows: { label: string; value: string }[] = [];
  for (const key of COMMERCIAL_SUMMARY_KEYS) {
    const b = valuesByKey.get(key);
    if (!b || b.values.size === 0) continue;
    commercialRows.push({
      label: b.label,
      value: Array.from(b.values).join(", "),
    });
  }

  const certificationRows: { label: string; value: string }[] = [];
  for (const row of specRows) {
    if (CERT_SECTION_KEYS.has(row.attribute_key)) {
      certificationRows.push({ label: row.label, value: row.value });
    }
  }

  const meta = (p.metadata ?? null) as Record<string, unknown> | null;

  const variantRows = (variantsRes.data ?? []) as (PdpVariantRow & { is_active?: boolean })[];
  const variants: PdpVariantRow[] = variantRows.map((v) => ({
    id: v.id,
    variant_sku: v.variant_sku,
    size_code: v.size_code,
    sort_order: v.sort_order ?? 0,
  }));
  const defaultVariant = variants[0] ?? null;

  const galleryRaw = imagesRes.data ?? [];
  const gallery = [...galleryRaw].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const useVals = Array.from(valuesByKey.get("uses")?.values ?? []);
  const industryVals = Array.from(valuesByKey.get("industries")?.values ?? []);
  const relatedIds = await fetchRelatedProductIds(supabase, pid, p.brand_id, useVals, industryVals);
  const mergedIds = Array.from(new Set([pid, ...relatedIds]));
  const mergedRows = mergedIds.length > 0 ? await fetchStoreProductRowsByIds(mergedIds) : [];
  const rowById = new Map(mergedRows.map((r) => [r.id, r]));
  const quoteProductRow = rowById.get(pid) ?? null;
  const related = relatedIds.map((id) => rowById.get(id)).filter((x): x is StoreProductRow => Boolean(x));

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    internalSku: p.internal_sku,
    brandId: p.brand_id,
    brandName: brandRes.data?.name ?? null,
    metadata: meta,
    bestPrice: validBestPrice(priceRes.data?.best_price ?? null),
    gallery,
    variants,
    defaultVariant,
    commercialRows,
    specRows,
    certificationRows,
    downloads: downloadsFromMetadata(meta),
    related,
    quoteProductRow,
  };
}

/** Dedupes Supabase work when `generateMetadata` and page both request the same slug. */
export const fetchStoreProductDetail = cache(loadStoreProductDetail);

export function buildStoreProductRowForVariant(
  base: StoreProductRow,
  variant: Pick<PdpVariantRow, "id" | "variant_sku" | "size_code">
): StoreProductRow {
  return {
    ...base,
    catalogVariantId: variant.id,
    variantSku: variant.variant_sku,
    sizeCode: variant.size_code,
  };
}

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchStoreProductRowsByIds, type StoreProductRow } from "@/lib/catalog/store-products";
import { getAttributeDefinitionIdsByKeys } from "@/lib/catalog/store-attribute-defs";
import { formatAttributeValueLabel } from "@/lib/catalog/attribute-value-labels";
import {
  buildCompareWizardPdpHref,
  formatSizeRange,
  isStorefrontGcSku,
  resolveBoxesPerCase,
  storefrontSafeCasePrice,
  storefrontSafePalletPrice,
} from "@/lib/catalog/compare-wizard-utils";
import type { CompareWizardRow } from "@/lib/catalog/compare-wizard-utils.types";

export type { CompareWizardRow } from "@/lib/catalog/compare-wizard-utils.types";

const MAX_PRODUCTS = 2000;
const MAX_ATTR_ROWS = 20_000;

const COMPARE_ATTR_KEYS = ["material", "grade", "color", "thickness_mil", "certifications", "uses", "industries"] as const;

export type CompareWizardResult = {
  rows: CompareWizardRow[];
  catalogUnavailable: boolean;
};

type AttrBucket = Partial<Record<(typeof COMPARE_ATTR_KEYS)[number], string[]>>;

function joinAttrLabels(key: string, values: string[] | undefined, max = 3): string | null {
  if (!values?.length) return null;
  return values
    .slice(0, max)
    .map((v) => formatAttributeValueLabel(key, v))
    .filter(Boolean)
    .join(", ");
}

function bestForFromBucket(bucket: AttrBucket | undefined): string | null {
  const uses = joinAttrLabels("uses", bucket?.uses, 2);
  const industries = joinAttrLabels("industries", bucket?.industries, 2);
  if (uses && industries) return `${uses} · ${industries}`;
  return uses ?? industries ?? null;
}

function industriesFromBucket(bucket: AttrBucket | undefined): string[] {
  if (!bucket?.industries?.length) return [];
  return bucket.industries
    .map((v) => formatAttributeValueLabel("industries", v))
    .filter(Boolean);
}

function dealBadgesFromProduct(row: StoreProductRow): string[] {
  const out = [...row.badges];
  if (row.caseOnSale) out.push("Case Deal");
  if (row.palletOnSale) out.push("Pallet Value");
  return Array.from(new Set(out));
}

async function fetchCompareAttrBucketsByProductIds(
  supabase: any,
  productIds: string[]
): Promise<Map<string, AttrBucket>> {
  const map = new Map<string, AttrBucket>();
  if (productIds.length === 0) return map;
  for (const id of productIds) map.set(id, {});

  const defMap = await getAttributeDefinitionIdsByKeys(supabase, [...COMPARE_ATTR_KEYS]);
  const defIds: string[] = [];
  const defIdToKey = new Map<string, (typeof COMPARE_ATTR_KEYS)[number]>();
  for (const key of COMPARE_ATTR_KEYS) {
    for (const defId of defMap.get(key) ?? []) {
      defIds.push(defId);
      defIdToKey.set(defId, key);
    }
  }
  if (defIds.length === 0) return map;

  const { data: rows } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("product_id, attribute_definition_id, value_text")
    .in("product_id", productIds)
    .in("attribute_definition_id", defIds)
    .not("value_text", "is", null)
    .limit(MAX_ATTR_ROWS);

  for (const r of rows ?? []) {
    const row = r as { product_id: string; attribute_definition_id: string; value_text: string | null };
    const key = defIdToKey.get(row.attribute_definition_id);
    if (!key || !row.value_text?.trim()) continue;
    const bucket = map.get(row.product_id) ?? {};
    const arr = bucket[key] ?? [];
    const val = row.value_text.trim();
    if (!arr.includes(val)) arr.push(val);
    bucket[key] = arr;
    map.set(row.product_id, bucket);
  }
  return map;
}

async function fetchSizeCodesByProductIds(
  supabase: any,
  productIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (productIds.length === 0) return map;

  const { data } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("catalog_product_id, size_code, sort_order")
    .in("catalog_product_id", productIds)
    .eq("is_active", true)
    .limit(MAX_ATTR_ROWS);

  const grouped = new Map<string, { code: string; sort: number }[]>();
  for (const r of data ?? []) {
    const row = r as { catalog_product_id: string; size_code: string | null; sort_order: number | null };
    if (!row.size_code?.trim()) continue;
    const list = grouped.get(row.catalog_product_id) ?? [];
    list.push({ code: row.size_code.trim(), sort: row.sort_order ?? 0 });
    grouped.set(row.catalog_product_id, list);
  }

  for (const [id, list] of Array.from(grouped.entries())) {
    list.sort((a, b) => a.sort - b.sort);
    map.set(id, list.map((x) => x.code));
  }
  return map;
}

export function buildCompareWizardRow(
  product: StoreProductRow,
  meta: Record<string, unknown> | null,
  attrs: AttrBucket | undefined,
  sizeCodes: string[] | undefined
): CompareWizardRow | null {
  if (!product.slug?.trim()) return null;

  const material =
    joinAttrLabels("material", attrs?.material, 1) ??
    (product.materialHint ? formatAttributeValueLabel("material", product.materialHint) : null);
  const certifications =
    joinAttrLabels("certifications", attrs?.certifications, 4) ??
    (product.certificationHints.length ? product.certificationHints.join(", ") : null);
  const codes = sizeCodes ?? (product.sizeCode ? [product.sizeCode] : []);

  return {
    id: product.id,
    slug: product.slug,
    sku: isStorefrontGcSku(product.internalSku) ? product.internalSku!.trim().toUpperCase() : null,
    name: product.name,
    boxesPerCase: resolveBoxesPerCase(meta, product.caseLabel),
    sizes: formatSizeRange(codes),
    sizeCodes: codes,
    material,
    color: joinAttrLabels("color", attrs?.color, 1),
    thicknessMil: joinAttrLabels("thickness_mil", attrs?.thickness_mil, 1),
    grade: joinAttrLabels("grade", attrs?.grade, 1),
    certifications,
    casePrice: storefrontSafeCasePrice(product.casePrice),
    palletPrice: storefrontSafePalletPrice(product.palletPrice, product.palletPricingAvailable),
    bestFor: bestForFromBucket(attrs) ?? product.commercialUseSummary,
    industries: industriesFromBucket(attrs),
    badges: dealBadgesFromProduct(product),
    pdpHref: buildCompareWizardPdpHref(product.slug),
  };
}

export async function fetchCompareWizardProducts(): Promise<CompareWizardResult> {
  if (!isSupabaseConfigured()) {
    return { rows: [], catalogUnavailable: true };
  }

  const supabase = getSupabaseAdmin() as any;

  const { data: products, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, slug, metadata")
    .eq("status", "active")
    .not("slug", "is", null)
    .order("name")
    .limit(MAX_PRODUCTS);

  if (error) {
    console.error("[compare-wizard] catalog_products failed:", error.message);
    return { rows: [], catalogUnavailable: true };
  }

  const ids = (products ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return { rows: [], catalogUnavailable: false };

  const metaById = new Map<string, Record<string, unknown> | null>(
    (products ?? []).map((p: { id: string; metadata: Record<string, unknown> | null }) => [p.id, p.metadata ?? null])
  );

  const [storeRows, attrBuckets, sizeCodesByProduct] = await Promise.all([
    fetchStoreProductRowsByIds(ids),
    fetchCompareAttrBucketsByProductIds(supabase, ids),
    fetchSizeCodesByProductIds(supabase, ids),
  ]);

  const storeById = new Map(storeRows.map((r) => [r.id, r]));
  const rows = ids
    .map((id: string) => {
      const product = storeById.get(id);
      if (!product) return null;
      return buildCompareWizardRow(product, metaById.get(id) ?? null, attrBuckets.get(id), sizeCodesByProduct.get(id));
    })
    .filter((r: CompareWizardRow | null): r is CompareWizardRow => Boolean(r));

  return { rows, catalogUnavailable: false };
}

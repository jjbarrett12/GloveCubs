import type { ImportDraftProductV1, StagingExtractedPayloadV1 } from "@/lib/admin/import-draft-types";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import { fetchCategoryAttributeDefinitions, productAttributesFromRows } from "@/lib/admin/product-attribute-sync";
import { detectLegacyMetadataFields, type LegacyMetadataField } from "@/lib/admin/legacy-metadata-migration";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { sanitizeSearchTerm } from "@/lib/catalog/store-catalog-constraints";
import {
  computeProductWarnings,
  type GovernanceWarning,
  type ProductGovernanceContext,
  THIN_PDP_MIN_ATTRIBUTE_ROWS,
} from "@/lib/admin/catalog-governance";

const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;
const MAX_SEARCH_IDS = 4000;
const MAX_SCAN_PRODUCTS = 5000;
const MAX_COLLISION_SCAN = 25_000;
const MAX_ATTR_ROWS = 80_000;

export const ADMIN_PRODUCT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminProductStatusFilter = "all" | "active" | "draft" | "archived";

export type AdminProductListSort =
  | "newest"
  | "oldest"
  | "most_variants"
  | "least_variants"
  | "warnings_desc"
  | "name_asc"
  | "name_desc";

export type AdminProductGovernanceFilters = {
  missing_images: boolean;
  placeholder_only_images: boolean;
  thin_pdp: boolean;
  missing_glove_attributes: boolean;
  orphan_category: boolean;
  /** no_active_variants OR single_active_variant OR duplicate gtin/sig */
  variant_issues: boolean;
  duplicate_warnings: boolean;
  pending_match_reviews: boolean;
};

export type AdminProductListRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  brandName: string | null;
  categoryName: string | null;
  updatedAt: string | null;
  primaryImageUrl: string | null;
  imageCount: number;
  imageHealth: "missing" | "placeholder_only" | "ok";
  pdpHealth: "thin" | "ok" | "n_a";
  activeVariantCount: number;
  quoteEnabled: boolean;
  storefrontVisible: boolean;
  warnings: GovernanceWarning[];
};

export type AdminProductsPageResult = {
  rows: AdminProductListRow[];
  total: number;
  page: number;
  limit: number;
  scanLimited: boolean;
  configured: boolean;
  error: string | null;
};

export type AdminProductDetailResult = {
  configured: boolean;
  notFound?: boolean;
  product?: {
    id: string;
    name: string;
    slug: string;
    status: string;
    brandName: string | null;
    categoryId: string | null;
    categoryName: string | null;
    internalSku: string | null;
    description: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  images?: Array<{
    url: string;
    isPrimary: boolean;
    sortOrder: number;
    provenance: string | null;
  }>;
  variants?: Array<{
    id: string;
    variantSku: string;
    gtin: string | null;
    attributeSignature: string | null;
    isActive: boolean;
    sizeCode: string | null;
    sortOrder: number;
    metadata: Record<string, unknown> | null;
    gtinDuplicateRisk: boolean;
    signatureDuplicateRisk: boolean;
  }>;
  warnings?: GovernanceWarning[];
  attributeRowCount?: number;
  quoteEnabled?: boolean;
  storefrontVisible?: boolean;
  storefrontPdpPath?: string | null;
  pendingMatchReviewCount?: number;
  editor?: {
    attributeDefinitions: AttributeDefinitionRow[];
    productAttributes: Record<string, string | string[]>;
    legacyMetadataFields: LegacyMetadataField[];
    importDraft: ImportDraftProductV1 | null;
    importStagingId: string | null;
    parserVersion: string | null;
  };
};

function parseBool(v: string | string[] | undefined): boolean {
  if (v === undefined) return false;
  const s = Array.isArray(v) ? v[0] : v;
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

function parseString(v: string | string[] | undefined): string {
  if (v === undefined) return "";
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function parseAdminProductListQuery(sp: Record<string, string | string[] | undefined>): {
  page: number;
  limit: number;
  q: string;
  sort: AdminProductListSort;
  status: AdminProductStatusFilter;
  categoryId: string | null;
  brand: string;
  filters: AdminProductGovernanceFilters;
} {
  const pageRaw = Number.parseInt(parseString(sp.page), 10);
  const limitRaw = Number.parseInt(parseString(sp.limit), 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT;

  const sortRaw = parseString(sp.sort) as AdminProductListSort;
  const sort: AdminProductListSort = [
    "newest",
    "oldest",
    "most_variants",
    "least_variants",
    "warnings_desc",
    "name_asc",
    "name_desc",
  ].includes(sortRaw)
    ? sortRaw
    : "newest";

  const st = parseString(sp.status) as AdminProductStatusFilter;
  const status: AdminProductStatusFilter = ["all", "active", "draft", "archived"].includes(st) ? st : "all";

  const cat = parseString(sp.category);
  const categoryId = ADMIN_PRODUCT_UUID_RE.test(cat) ? cat : null;

  const filters: AdminProductGovernanceFilters = {
    missing_images: parseBool(sp.missing_images),
    placeholder_only_images: parseBool(sp.placeholder_only_images),
    thin_pdp: parseBool(sp.thin_pdp),
    missing_glove_attributes: parseBool(sp.missing_glove_attributes),
    orphan_category: parseBool(sp.orphan_category),
    variant_issues: parseBool(sp.variant_issues),
    duplicate_warnings: parseBool(sp.duplicate_warnings),
    pending_match_reviews: parseBool(sp.pending_match_reviews),
  };

  return {
    page,
    limit,
    q: parseString(sp.q),
    sort,
    status,
    categoryId,
    brand: parseString(sp.brand),
    filters,
  };
}

function anyGovernanceFilter(f: AdminProductGovernanceFilters): boolean {
  return Object.values(f).some(Boolean);
}

function governanceFiltersPass(warnings: GovernanceWarning[], f: AdminProductGovernanceFilters): boolean {
  const codes = new Set(warnings.map((w) => w.code));
  if (f.missing_images && !codes.has("missing_images")) return false;
  if (f.placeholder_only_images && !codes.has("placeholder_only_images")) return false;
  if (f.thin_pdp && !codes.has("thin_pdp")) return false;
  if (f.missing_glove_attributes && !codes.has("missing_glove_attributes")) return false;
  if (f.orphan_category && !codes.has("orphan_category")) return false;
  if (f.variant_issues) {
    const hit =
      codes.has("no_active_variants") ||
      codes.has("single_active_variant") ||
      codes.has("duplicate_gtin") ||
      codes.has("duplicate_signature");
    if (!hit) return false;
  }
  if (f.duplicate_warnings && !codes.has("duplicate_gtin") && !codes.has("duplicate_signature")) return false;
  if (f.pending_match_reviews && !codes.has("pending_match_reviews")) return false;
  return true;
}

async function fetchGlobalCollisionSets(supabase: any): Promise<{
  gtinCollisionGtins: Set<string>;
  signatureCollisionKeys: Set<string>;
}> {
  const gtinCollisionGtins = new Set<string>();
  const signatureCollisionKeys = new Set<string>();

  const { data: gtinRows } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("gtin")
    .not("gtin", "is", null)
    .limit(MAX_COLLISION_SCAN);
  const gtinCounts = new Map<string, number>();
  for (const r of (gtinRows ?? []) as { gtin: string }[]) {
    const g = (r.gtin ?? "").trim();
    if (!g) continue;
    gtinCounts.set(g, (gtinCounts.get(g) ?? 0) + 1);
  }
  for (const [g, n] of Array.from(gtinCounts.entries())) if (n > 1) gtinCollisionGtins.add(g);

  const { data: sigRows } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("catalog_product_id, attribute_signature")
    .not("attribute_signature", "is", null)
    .limit(MAX_COLLISION_SCAN);
  const sigCounts = new Map<string, number>();
  for (const r of (sigRows ?? []) as { catalog_product_id: string; attribute_signature: string }[]) {
    const sig = (r.attribute_signature ?? "").trim();
    if (!sig) continue;
    const k = `${r.catalog_product_id}::${sig}`;
    sigCounts.set(k, (sigCounts.get(k) ?? 0) + 1);
  }
  for (const [k, n] of Array.from(sigCounts.entries())) if (n > 1) signatureCollisionKeys.add(k);

  return { gtinCollisionGtins, signatureCollisionKeys };
}

async function collectSearchProductIds(
  supabase: any,
  term: string,
  status: AdminProductStatusFilter
): Promise<Set<string>> {
  const q = sanitizeSearchTerm(term);
  const ids = new Set<string>();
  if (!q) return ids;

  const esc = q.replace(/\\/g, "");
  const pattern = `%${esc}%`;

  const applyStatus = (pq: any) => {
    if (status !== "all") return pq.eq("status", status);
    return pq;
  };

  const merge = (rows: { id: string }[] | null | undefined) => {
    for (const r of rows ?? []) {
      ids.add(r.id);
      if (ids.size >= MAX_SEARCH_IDS) return;
    }
  };

  if (ADMIN_PRODUCT_UUID_RE.test(q)) {
    const { data: one } = await applyStatus(
      supabase.schema("catalog_v2").from("catalog_products").select("id").eq("id", q).maybeSingle()
    );
    if (one?.id) ids.add(one.id);
  }

  const baseSelect = () => applyStatus(supabase.schema("catalog_v2").from("catalog_products").select("id"));

  const [n1, n2, n3, n4] = await Promise.all([
    baseSelect().ilike("name", pattern).limit(1500),
    baseSelect().ilike("slug", pattern).limit(1500),
    baseSelect().ilike("internal_sku", pattern).limit(1500),
    baseSelect().not("description", "is", null).ilike("description", pattern).limit(1500),
  ]);
  merge(n1.data as { id: string }[]);
  merge(n2.data as { id: string }[]);
  merge(n3.data as { id: string }[]);
  merge(n4.data as { id: string }[]);

  const { data: brandRows } = await supabase
    .schema("catalogos")
    .from("brands")
    .select("id")
    .ilike("name", pattern)
    .limit(80);
  const brandIds = (brandRows ?? []).map((b: { id: string }) => b.id).filter(Boolean);
  if (brandIds.length > 0 && ids.size < MAX_SEARCH_IDS) {
    const { data: byBrand } = await baseSelect().in("brand_id", brandIds).limit(2000);
    merge(byBrand as { id: string }[]);
  }

  const { data: catRows } = await supabase
    .schema("catalogos")
    .from("categories")
    .select("id")
    .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
    .limit(80);
  const catIds = (catRows ?? []).map((c: { id: string }) => c.id).filter(Boolean);
  for (const cid of catIds) {
    if (ids.size >= MAX_SEARCH_IDS) break;
    const { data: byCat } = await baseSelect().contains("metadata", { category_id: cid }).limit(800);
    merge(byCat as { id: string }[]);
  }

  const { data: varRows } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("catalog_product_id")
    .or(`variant_sku.ilike.${pattern},gtin.ilike.${pattern}`)
    .limit(2000);
  const vProd = Array.from(
    new Set((varRows ?? []).map((r: { catalog_product_id: string }) => r.catalog_product_id).filter(Boolean))
  );
  if (vProd.length > 0) {
    let pq = supabase.schema("catalog_v2").from("catalog_products").select("id").in("id", vProd.slice(0, 1500));
    if (status !== "all") pq = pq.eq("status", status);
    const { data: vp } = await pq;
    merge(vp as { id: string }[]);
  }

  return ids;
}

type ProductCore = {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand_id: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

async function batchHydrateGovernanceForProducts(
  supabase: any,
  productIds: string[],
  gtinCollisionGtins: Set<string>,
  signatureCollisionKeys: Set<string>
): Promise<{
  imageRowsByProduct: Map<string, Array<{ metadata: Record<string, unknown> | null }>>;
  primaryUrlByProduct: Map<string, string>;
  imageCountByProduct: Map<string, number>;
  activeVariantStats: Map<
    string,
    { count: number; gtins: string[]; signatures: string[] }
  >;
  attrCountByProduct: Map<string, number>;
  attrKeysByProduct: Map<string, Set<string>>;
  pendingReviewsByProduct: Map<string, number>;
}> {
  const imageRowsByProduct = new Map<string, Array<{ metadata: Record<string, unknown> | null }>>();
  const primaryUrlByProduct = new Map<string, string>();
  const imageCountByProduct = new Map<string, number>();

  const activeVariantStats = new Map<string, { count: number; gtins: string[]; signatures: string[] }>();
  const attrCountByProduct = new Map<string, number>();
  const attrKeysByProduct = new Map<string, Set<string>>();
  const pendingReviewsByProduct = new Map<string, number>();

  if (productIds.length === 0) {
    return {
      imageRowsByProduct,
      primaryUrlByProduct,
      imageCountByProduct,
      activeVariantStats,
      attrCountByProduct,
      attrKeysByProduct,
      pendingReviewsByProduct,
    };
  }

  const [{ data: imgs }, { data: variants }, { data: attrs }, { data: defs }] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_product_images")
      .select("catalog_product_id, url, is_primary, sort_order, metadata")
      .in("catalog_product_id", productIds) as Promise<{
      data: {
        catalog_product_id: string;
        url: string;
        is_primary: boolean;
        sort_order: number | null;
        metadata: Record<string, unknown> | null;
      }[] | null;
    }>,
    supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, gtin, attribute_signature, is_active, metadata, sort_order")
      .in("catalog_product_id", productIds) as Promise<{
      data: {
        id: string;
        catalog_product_id: string;
        variant_sku: string;
        gtin: string | null;
        attribute_signature: string | null;
        is_active: boolean;
        metadata: Record<string, unknown> | null;
        sort_order: number | null;
      }[] | null;
    }>,
    supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("product_id, attribute_definition_id, value_text")
      .in("product_id", productIds)
      .limit(MAX_ATTR_ROWS) as Promise<{
      data: { product_id: string; attribute_definition_id: string; value_text: string | null }[] | null;
    }>,
    supabase
      .schema("catalogos")
      .from("attribute_definitions")
      .select("id, attribute_key") as Promise<{ data: { id: string; attribute_key: string }[] | null }>,
  ]);

  const keyByDefId = new Map<string, string>();
  for (const d of defs ?? []) keyByDefId.set(d.id, d.attribute_key);

  const sortedImgs = [...(imgs ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  for (const im of sortedImgs) {
    const list = imageRowsByProduct.get(im.catalog_product_id) ?? [];
    list.push({ metadata: im.metadata });
    imageRowsByProduct.set(im.catalog_product_id, list);
    imageCountByProduct.set(im.catalog_product_id, (imageCountByProduct.get(im.catalog_product_id) ?? 0) + 1);
    if (!primaryUrlByProduct.has(im.catalog_product_id) && im.url?.trim()) {
      primaryUrlByProduct.set(im.catalog_product_id, im.url.trim());
    }
  }

  for (const v of variants ?? []) {
    const pid = v.catalog_product_id;
    if (!v.is_active) continue;
    const cur = activeVariantStats.get(pid) ?? { count: 0, gtins: [], signatures: [] };
    cur.count += 1;
    const g = (v.gtin ?? "").trim();
    if (g) cur.gtins.push(g);
    const s = (v.attribute_signature ?? "").trim();
    if (s) cur.signatures.push(s);
    activeVariantStats.set(pid, cur);
  }

  for (const r of attrs ?? []) {
    attrCountByProduct.set(r.product_id, (attrCountByProduct.get(r.product_id) ?? 0) + 1);
    if (!r.value_text?.trim()) continue;
    const key = keyByDefId.get(r.attribute_definition_id);
    if (!key) continue;
    const set = attrKeysByProduct.get(r.product_id) ?? new Set<string>();
    set.add(key);
    attrKeysByProduct.set(r.product_id, set);
  }

  const vidToPid = new Map<string, string>();
  for (const v of variants ?? []) {
    vidToPid.set(v.id, v.catalog_product_id);
  }
  const scopedVariantIds = Array.from(vidToPid.keys());
  if (scopedVariantIds.length > 0) {
    const chunk = 500;
    for (let i = 0; i < scopedVariantIds.length; i += chunk) {
      const slice = scopedVariantIds.slice(i, i + chunk);
      const { data: revRows } = await supabase
        .schema("catalog_v2")
        .from("catalog_match_reviews")
        .select("proposed_catalog_variant_id")
        .eq("review_status", "pending")
        .in("proposed_catalog_variant_id", slice);
      for (const r of revRows ?? []) {
        const vid = (r as { proposed_catalog_variant_id: string }).proposed_catalog_variant_id;
        const pid = vidToPid.get(vid);
        if (!pid) continue;
        pendingReviewsByProduct.set(pid, (pendingReviewsByProduct.get(pid) ?? 0) + 1);
      }
    }
  }

  return {
    imageRowsByProduct,
    primaryUrlByProduct,
    imageCountByProduct,
    activeVariantStats,
    attrCountByProduct,
    attrKeysByProduct,
    pendingReviewsByProduct,
  };
}

function withPrimaryImage(row: AdminProductListRow, primaryUrl: string | null): AdminProductListRow {
  return { ...row, primaryImageUrl: primaryUrl };
}

export async function fetchAdminProductsPage(qs: {
  page: number;
  limit: number;
  q: string;
  sort: AdminProductListSort;
  status: AdminProductStatusFilter;
  categoryId: string | null;
  brand: string;
  filters: AdminProductGovernanceFilters;
}): Promise<AdminProductsPageResult> {
  if (!isSupabaseConfigured()) {
    return {
      rows: [],
      total: 0,
      page: qs.page,
      limit: qs.limit,
      scanLimited: false,
      configured: false,
      error: null,
    };
  }

  const supabase = getSupabaseAdmin() as any;
  const { gtinCollisionGtins, signatureCollisionKeys } = await fetchGlobalCollisionSets(supabase);

  const needScan =
    anyGovernanceFilter(qs.filters) ||
    qs.sort === "warnings_desc" ||
    qs.sort === "most_variants" ||
    qs.sort === "least_variants" ||
    qs.brand.trim().length > 0;

  const searchIds = qs.q.trim() ? await collectSearchProductIds(supabase, qs.q, qs.status) : null;
  if (qs.q.trim() && searchIds && searchIds.size === 0) {
    return {
      rows: [],
      total: 0,
      page: qs.page,
      limit: qs.limit,
      scanLimited: false,
      configured: true,
      error: null,
    };
  }

  if (needScan || (searchIds && searchIds.size > 0)) {
    return fetchAdminProductsPageScan(supabase, qs, {
      gtinCollisionGtins,
      signatureCollisionKeys,
      searchIds,
    });
  }

  const from = (qs.page - 1) * qs.limit;
  const to = from + qs.limit - 1;

  let pq = supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, slug, status, brand_id, metadata, updated_at", { count: "exact" });

  if (qs.status !== "all") pq = pq.eq("status", qs.status);
  if (qs.categoryId) pq = pq.contains("metadata", { category_id: qs.categoryId });

  if (qs.sort === "newest") pq = pq.order("updated_at", { ascending: false, nullsFirst: false });
  else if (qs.sort === "oldest") pq = pq.order("updated_at", { ascending: true, nullsFirst: false });
  else if (qs.sort === "name_asc") pq = pq.order("name", { ascending: true });
  else if (qs.sort === "name_desc") pq = pq.order("name", { ascending: false });
  else pq = pq.order("updated_at", { ascending: false, nullsFirst: false });

  pq = pq.range(from, to);

  const { data: products, error, count } = (await pq) as {
    data: ProductCore[] | null;
    error: { message: string } | null;
    count: number | null;
  };

  if (error) {
    return {
      rows: [],
      total: 0,
      page: qs.page,
      limit: qs.limit,
      scanLimited: false,
      configured: true,
      error: error.message,
    };
  }

  const list = products ?? [];
  const ids = list.map((p) => p.id);
  const hydrated = await batchHydrateGovernanceForProducts(supabase, ids, gtinCollisionGtins, signatureCollisionKeys);

  const brandIds = Array.from(new Set(list.map((p) => p.brand_id).filter(Boolean))) as string[];
  const brandNameById = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: br } = await supabase.schema("catalogos").from("brands").select("id, name").in("id", brandIds);
    for (const b of br ?? []) brandNameById.set((b as { id: string; name: string }).id, (b as { name: string }).name);
  }

  const catIds = new Set<string>();
  for (const p of list) {
    const raw = (p.metadata as { category_id?: unknown } | null)?.category_id;
    if (typeof raw === "string" && raw.trim()) catIds.add(raw.trim());
  }
  const catNameById = new Map<string, string>();
  if (catIds.size > 0) {
    const { data: cats } = await supabase
      .schema("catalogos")
      .from("categories")
      .select("id, name")
      .in("id", Array.from(catIds));
    for (const c of cats ?? []) catNameById.set((c as { id: string; name: string }).id, (c as { name: string }).name);
  }

  const rows: AdminProductListRow[] = list.map((p) => {
    const imgs = hydrated.imageRowsByProduct.get(p.id) ?? [];
    const vs = hydrated.activeVariantStats.get(p.id) ?? { count: 0, gtins: [], signatures: [] };
    const rawCat = (p.metadata as { category_id?: unknown } | null)?.category_id;
    const categoryId = typeof rawCat === "string" ? rawCat.trim() : "";
    const categoryName = categoryId ? catNameById.get(categoryId) ?? null : null;
    const categoryIdValid = !categoryId || catNameById.has(categoryId);

    const governanceCtx: ProductGovernanceContext = {
      productId: p.id,
      status: p.status,
      metadata: p.metadata,
      imageRows: imgs,
      attributeRowCount: hydrated.attrCountByProduct.get(p.id) ?? 0,
      activeVariantCount: vs.count,
      activeVariantGtins: vs.gtins,
      activeVariantSignatures: vs.signatures,
      categoryId: categoryId || null,
      categoryIdValid,
      attributeKeysWithValues: hydrated.attrKeysByProduct.get(p.id) ?? new Set(),
      pendingMatchReviewCount: hydrated.pendingReviewsByProduct.get(p.id) ?? 0,
      globalGtinCollisionGtins: gtinCollisionGtins,
      globalSignatureCollisionKeys: signatureCollisionKeys,
    };

    const warnings = computeProductWarnings(governanceCtx);
    const ic = hydrated.imageCountByProduct.get(p.id) ?? 0;
    let imageHealth: AdminProductListRow["imageHealth"] = "ok";
    if (ic === 0 && (p.status === "active" || p.status === "draft")) imageHealth = "missing";
    else if (warnings.some((w) => w.code === "placeholder_only_images")) imageHealth = "placeholder_only";

    const attrCount = governanceCtx.attributeRowCount;
    const pdpHealth: AdminProductListRow["pdpHealth"] =
      p.status !== "active" ? "n_a" : attrCount < THIN_PDP_MIN_ATTRIBUTE_ROWS ? "thin" : "ok";

    return withPrimaryImage(
      {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        brandName: p.brand_id ? brandNameById.get(p.brand_id) ?? null : null,
        categoryName,
        updatedAt: p.updated_at,
        primaryImageUrl: null,
        imageCount: ic,
        imageHealth,
        pdpHealth,
        activeVariantCount: vs.count,
        quoteEnabled: p.status === "active" && vs.count > 0,
        storefrontVisible: p.status === "active",
        warnings,
      },
      hydrated.primaryUrlByProduct.get(p.id) ?? null
    );
  });

  return {
    rows,
    total: count ?? 0,
    page: qs.page,
    limit: qs.limit,
    scanLimited: false,
    configured: true,
    error: null,
  };
}

async function fetchAdminProductsPageScan(
  supabase: any,
  qs: {
    page: number;
    limit: number;
    q: string;
    sort: AdminProductListSort;
    status: AdminProductStatusFilter;
    categoryId: string | null;
    brand: string;
    filters: AdminProductGovernanceFilters;
  },
  ctx: {
    gtinCollisionGtins: Set<string>;
    signatureCollisionKeys: Set<string>;
    searchIds: Set<string> | null;
  }
): Promise<AdminProductsPageResult> {
  let candidates: ProductCore[] = [];
  let scanLimited = false;

  if (ctx.searchIds && ctx.searchIds.size > 0) {
    if (ctx.searchIds.size > MAX_SCAN_PRODUCTS) scanLimited = true;
    const idArr = Array.from(ctx.searchIds).slice(0, MAX_SCAN_PRODUCTS);
    let iq = supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, status, brand_id, metadata, updated_at")
      .in("id", idArr);
    if (qs.status !== "all") iq = iq.eq("status", qs.status);
    if (qs.categoryId) iq = iq.contains("metadata", { category_id: qs.categoryId });
    const { data: bySearch, error } = (await iq) as {
      data: ProductCore[] | null;
      error: { message: string } | null;
    };
    if (error) {
      return {
        rows: [],
        total: 0,
        page: qs.page,
        limit: qs.limit,
        scanLimited: false,
        configured: true,
        error: error.message,
      };
    }
    candidates = (bySearch ?? []) as ProductCore[];
  } else {
    let pq = supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, status, brand_id, metadata, updated_at")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(MAX_SCAN_PRODUCTS);

    if (qs.status !== "all") pq = pq.eq("status", qs.status);
    if (qs.categoryId) pq = pq.contains("metadata", { category_id: qs.categoryId });

    const { data: scanProds, error } = (await pq) as {
      data: ProductCore[] | null;
      error: { message: string } | null;
    };
    if (error) {
      return {
        rows: [],
        total: 0,
        page: qs.page,
        limit: qs.limit,
        scanLimited: false,
        configured: true,
        error: error.message,
      };
    }
    candidates = (scanProds ?? []) as ProductCore[];
    scanLimited = candidates.length >= MAX_SCAN_PRODUCTS;
  }

  if (qs.brand.trim()) {
    const pat = `%${sanitizeSearchTerm(qs.brand).replace(/%/g, "")}%`;
    const { data: br } = await supabase
      .schema("catalogos")
      .from("brands")
      .select("id, name")
      .ilike("name", pat)
      .limit(100);
    const bid = new Set((br ?? []).map((b: { id: string }) => b.id));
    candidates = candidates.filter((p) => p.brand_id && bid.has(p.brand_id));
  }

  const allIds = candidates.map((c) => c.id);
  const hydrated = await batchHydrateGovernanceForProducts(
    supabase,
    allIds,
    ctx.gtinCollisionGtins,
    ctx.signatureCollisionKeys
  );

  const brandIds = Array.from(new Set(candidates.map((p) => p.brand_id).filter(Boolean))) as string[];
  const brandNameById = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: br } = await supabase.schema("catalogos").from("brands").select("id, name").in("id", brandIds);
    for (const b of br ?? []) brandNameById.set((b as { id: string; name: string }).id, (b as { name: string }).name);
  }

  const catIds = new Set<string>();
  for (const p of candidates) {
    const raw = (p.metadata as { category_id?: unknown } | null)?.category_id;
    if (typeof raw === "string" && raw.trim()) catIds.add(raw.trim());
  }
  const catNameById = new Map<string, string>();
  if (catIds.size > 0) {
    const { data: cats } = await supabase
      .schema("catalogos")
      .from("categories")
      .select("id, name")
      .in("id", Array.from(catIds));
    for (const c of cats ?? []) catNameById.set((c as { id: string; name: string }).id, (c as { name: string }).name);
  }

  const enriched: AdminProductListRow[] = [];

  for (const p of candidates) {
    const imgs = hydrated.imageRowsByProduct.get(p.id) ?? [];
    const vs = hydrated.activeVariantStats.get(p.id) ?? { count: 0, gtins: [], signatures: [] };
    const rawCat = (p.metadata as { category_id?: unknown } | null)?.category_id;
    const categoryId = typeof rawCat === "string" ? rawCat.trim() : "";
    const categoryName = categoryId ? catNameById.get(categoryId) ?? null : null;
    const categoryIdValid = !categoryId || catNameById.has(categoryId);

    const governanceCtx: ProductGovernanceContext = {
      productId: p.id,
      status: p.status,
      metadata: p.metadata,
      imageRows: imgs,
      attributeRowCount: hydrated.attrCountByProduct.get(p.id) ?? 0,
      activeVariantCount: vs.count,
      activeVariantGtins: vs.gtins,
      activeVariantSignatures: vs.signatures,
      categoryId: categoryId || null,
      categoryIdValid,
      attributeKeysWithValues: hydrated.attrKeysByProduct.get(p.id) ?? new Set(),
      pendingMatchReviewCount: hydrated.pendingReviewsByProduct.get(p.id) ?? 0,
      globalGtinCollisionGtins: ctx.gtinCollisionGtins,
      globalSignatureCollisionKeys: ctx.signatureCollisionKeys,
    };

    const warnings = computeProductWarnings(governanceCtx);
    if (anyGovernanceFilter(qs.filters) && !governanceFiltersPass(warnings, qs.filters)) continue;

    const ic = hydrated.imageCountByProduct.get(p.id) ?? 0;
    let imageHealth: AdminProductListRow["imageHealth"] = "ok";
    if (ic === 0 && (p.status === "active" || p.status === "draft")) imageHealth = "missing";
    else if (warnings.some((w) => w.code === "placeholder_only_images")) imageHealth = "placeholder_only";

    const attrCount = governanceCtx.attributeRowCount;
    const pdpHealth: AdminProductListRow["pdpHealth"] =
      p.status !== "active" ? "n_a" : attrCount < THIN_PDP_MIN_ATTRIBUTE_ROWS ? "thin" : "ok";

    enriched.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
      brandName: p.brand_id ? brandNameById.get(p.brand_id) ?? null : null,
      categoryName,
      updatedAt: p.updated_at,
      primaryImageUrl: hydrated.primaryUrlByProduct.get(p.id) ?? null,
      imageCount: ic,
      imageHealth,
      pdpHealth,
      activeVariantCount: vs.count,
      quoteEnabled: p.status === "active" && vs.count > 0,
      storefrontVisible: p.status === "active",
      warnings,
    });
  }

  if (qs.sort === "newest")
    enriched.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  else if (qs.sort === "oldest")
    enriched.sort((a, b) => String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? "")));
  else if (qs.sort === "name_asc") enriched.sort((a, b) => a.name.localeCompare(b.name));
  else if (qs.sort === "name_desc") enriched.sort((a, b) => b.name.localeCompare(a.name));
  else if (qs.sort === "most_variants")
    enriched.sort((a, b) => b.activeVariantCount - a.activeVariantCount || a.name.localeCompare(b.name));
  else if (qs.sort === "least_variants")
    enriched.sort((a, b) => a.activeVariantCount - b.activeVariantCount || a.name.localeCompare(b.name));
  else if (qs.sort === "warnings_desc")
    enriched.sort((a, b) => b.warnings.length - a.warnings.length || a.name.localeCompare(b.name));
  else enriched.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));

  const total = enriched.length;
  const slice = enriched.slice((qs.page - 1) * qs.limit, (qs.page - 1) * qs.limit + qs.limit);

  return {
    rows: slice,
    total,
    page: qs.page,
    limit: qs.limit,
    scanLimited,
    configured: true,
    error: null,
  };
}

export async function fetchAdminProductDetail(productId: string): Promise<AdminProductDetailResult> {
  if (!ADMIN_PRODUCT_UUID_RE.test(productId)) {
    return { configured: true, notFound: true };
  }
  if (!isSupabaseConfigured()) {
    return { configured: false, notFound: true };
  }

  const supabase = getSupabaseAdmin() as any;
  const { gtinCollisionGtins, signatureCollisionKeys } = await fetchGlobalCollisionSets(supabase);

  const { data: p, error } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, slug, status, brand_id, metadata, internal_sku, description, created_at, updated_at")
    .eq("id", productId)
    .maybeSingle();

  if (error || !p) {
    return { configured: true, notFound: true };
  }

  const row = p as {
    id: string;
    name: string;
    slug: string;
    status: string;
    brand_id: string | null;
    metadata: Record<string, unknown> | null;
    internal_sku: string | null;
    description: string | null;
    created_at: string | null;
    updated_at: string | null;
  };

  const [{ data: imgs }, { data: variants }, { data: attrs }, { data: defs }, { data: brandRow }] = await Promise.all([
    supabase
      .schema("catalog_v2")
      .from("catalog_product_images")
      .select("url, is_primary, sort_order, metadata")
      .eq("catalog_product_id", productId)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, variant_sku, gtin, attribute_signature, is_active, size_code, sort_order, metadata")
      .eq("catalog_product_id", productId)
      .order("sort_order", { ascending: true }),
    supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("attribute_definition_id, value_text")
      .eq("product_id", productId),
    supabase.schema("catalogos").from("attribute_definitions").select("id, attribute_key"),
    row.brand_id
      ? supabase.schema("catalogos").from("brands").select("name").eq("id", row.brand_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const keyByDefId = new Map<string, string>();
  for (const d of defs ?? []) keyByDefId.set((d as { id: string; attribute_key: string }).id, (d as { attribute_key: string }).attribute_key);

  const attrKeysWithValues = new Set<string>();
  let attrCount = 0;
  for (const r of attrs ?? []) {
    attrCount += 1;
    const vt = (r as { value_text: string | null }).value_text;
    if (!vt?.trim()) continue;
    const k = keyByDefId.get((r as { attribute_definition_id: string }).attribute_definition_id);
    if (k) attrKeysWithValues.add(k);
  }

  const imageRows = (imgs ?? []).map((im: { metadata: Record<string, unknown> | null }) => ({ metadata: im.metadata }));
  const activeVs = (variants ?? []).filter((v: { is_active: boolean }) => v.is_active);
  const activeGtins = activeVs.map((v: { gtin: string | null }) => (v.gtin ?? "").trim()).filter(Boolean);
  const activeSigs = activeVs
    .map((v: { attribute_signature: string | null }) => (v.attribute_signature ?? "").trim())
    .filter(Boolean);

  const rawCat = (row.metadata as { category_id?: unknown } | null)?.category_id;
  const categoryId = typeof rawCat === "string" ? rawCat.trim() : "";
  let categoryName: string | null = null;
  let categoryIdValid = true;
  if (categoryId) {
    const { data: cat } = await supabase
      .schema("catalogos")
      .from("categories")
      .select("name")
      .eq("id", categoryId)
      .maybeSingle();
    categoryName = cat ? (cat as { name: string }).name : null;
    categoryIdValid = Boolean(cat);
  }

  const variantIds = (variants ?? []).map((v: { id: string }) => v.id);
  let pendingCount = 0;
  const chunk = 400;
  for (let i = 0; i < variantIds.length; i += chunk) {
    const slice = variantIds.slice(i, i + chunk);
    if (slice.length === 0) continue;
    const { data: prs } = await supabase
      .schema("catalog_v2")
      .from("catalog_match_reviews")
      .select("id")
      .eq("review_status", "pending")
      .in("proposed_catalog_variant_id", slice);
    pendingCount += (prs ?? []).length;
  }

  const governanceCtx: ProductGovernanceContext = {
    productId: row.id,
    status: row.status,
    metadata: row.metadata,
    imageRows,
    attributeRowCount: attrCount,
    activeVariantCount: activeVs.length,
    activeVariantGtins: activeGtins,
    activeVariantSignatures: activeSigs,
    categoryId: categoryId || null,
    categoryIdValid,
    attributeKeysWithValues: attrKeysWithValues,
    pendingMatchReviewCount: pendingCount,
    globalGtinCollisionGtins: gtinCollisionGtins,
    globalSignatureCollisionKeys: signatureCollisionKeys,
  };

  const warnings = computeProductWarnings(governanceCtx);
  const storefrontVisible = row.status === "active";
  const quoteEnabled = row.status === "active" && activeVs.length > 0;
  const storefrontPdpPath = storefrontVisible ? `/store/p/${encodeURIComponent(row.slug)}` : null;

  const sortedImages = [...(imgs ?? [])] as Array<{
    url: string;
    is_primary: boolean;
    sort_order: number | null;
    metadata: Record<string, unknown> | null;
  }>;
  sortedImages.sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const importStagingId =
    typeof meta.import_staging_id === "string" && meta.import_staging_id.trim()
      ? meta.import_staging_id.trim()
      : null;
  const parserVersion =
    typeof meta.import_parser_version === "string" ? meta.import_parser_version : null;

  let importDraft: ImportDraftProductV1 | null = null;
  if (importStagingId) {
    const { data: stagingRow } = await supabase
      .schema("catalog_v2")
      .from("admin_url_clipboard_staging")
      .select("extracted")
      .eq("id", importStagingId)
      .maybeSingle();
    const extracted = (stagingRow as { extracted?: unknown } | null)?.extracted;
    if (extracted && typeof extracted === "object") {
      const payload = extracted as StagingExtractedPayloadV1;
      if (payload.draft?.schema_version === 1) importDraft = payload.draft;
    }
  }

  const attributeDefinitions = categoryId ? await fetchCategoryAttributeDefinitions(categoryId) : [];
  const productAttributes = productAttributesFromRows(
    (attrs ?? []).map((r: { attribute_definition_id: string; value_text: string | null }) => ({
      attributeDefinitionId: r.attribute_definition_id,
      valueText: r.value_text,
    })),
    keyByDefId
  );
  const legacyMetadataFields = detectLegacyMetadataFields(meta, productAttributes);

  return {
    configured: true,
    product: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      brandName: brandRow?.data ? (brandRow.data as { name: string }).name : null,
      categoryId: categoryId || null,
      categoryName,
      internalSku: row.internal_sku,
      description: row.description,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    images: sortedImages.map((im) => ({
      url: im.url,
      isPrimary: im.is_primary,
      sortOrder: im.sort_order ?? 0,
      provenance: ((im.metadata ?? {}) as { image_provenance?: string }).image_provenance ?? null,
    })),
    variants: (variants ?? []).map(
      (v: {
        id: string;
        variant_sku: string;
        gtin: string | null;
        attribute_signature: string | null;
        is_active: boolean;
        size_code: string | null;
        sort_order: number | null;
        metadata: Record<string, unknown> | null;
      }) => {
        const g = (v.gtin ?? "").trim();
        const sig = (v.attribute_signature ?? "").trim();
        return {
          id: v.id,
          variantSku: v.variant_sku,
          gtin: v.gtin,
          attributeSignature: v.attribute_signature,
          isActive: v.is_active,
          sizeCode: v.size_code,
          sortOrder: v.sort_order ?? 0,
          metadata: v.metadata,
          gtinDuplicateRisk: Boolean(g && gtinCollisionGtins.has(g)),
          signatureDuplicateRisk: Boolean(sig && signatureCollisionKeys.has(`${row.id}::${sig}`)),
        };
      }
    ),
    warnings,
    attributeRowCount: attrCount,
    quoteEnabled,
    storefrontVisible,
    storefrontPdpPath,
    pendingMatchReviewCount: pendingCount,
    editor: {
      attributeDefinitions,
      productAttributes,
      legacyMetadataFields,
      importDraft,
      importStagingId,
      parserVersion,
    },
  };
}

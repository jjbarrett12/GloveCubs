/**
 * Read-only catalog health queries for /admin/catalog.
 *
 * Doctrine:
 *   - No mutations.
 *   - All counts are best-effort: failures degrade to `null` (rendered as
 *     "n/a") so an unrelated outage cannot blank the entire dashboard.
 *   - Each bucket maps to a row already present in the schema; no new tables.
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  isGloveAttributeCandidate,
  isMissingGloveAttributesForKeys,
  productHasOnlyPlaceholderImagery,
  THIN_PDP_MIN_ATTRIBUTE_ROWS,
} from "@/lib/admin/catalog-governance";

export type CatalogHealthBucket = {
  key: string;
  label: string;
  description: string;
  count: number | null;
};

const BUCKET_ORDER: Array<Pick<CatalogHealthBucket, "key" | "label" | "description">> = [
  {
    key: "drafts",
    label: "Draft products",
    description: "catalog_v2.catalog_products with status='draft'.",
  },
  {
    key: "missing_images",
    label: "Missing imagery",
    description: "Active or draft products with zero rows in catalog_product_images.",
  },
  {
    key: "placeholder_only_images",
    label: "Placeholder-only imagery",
    description: "Products whose only images carry image_provenance='placeholder'.",
  },
  {
    key: "thin_pdps",
    label: "Thin PDPs",
    description: "Active products with fewer than 5 rows in catalogos.product_attributes.",
  },
  {
    key: "missing_glove_attributes",
    label: "Missing required glove attributes",
    description: "Glove parents missing material, or all of (grade/powder/thickness_mil), or all of (industries/uses).",
  },
  {
    key: "orphan_categories",
    label: "Orphan category linkage",
    description: "Products whose metadata.category_id does not match any catalogos.categories row.",
  },
  {
    key: "low_variant_coverage",
    label: "Single-variant parents",
    description: "Active parents with exactly one active variant (review for missing sizes).",
  },
  {
    key: "pending_match_reviews",
    label: "Pending match reviews",
    description: "catalog_v2.catalog_match_reviews with review_status='pending'.",
  },
  {
    key: "gtin_collisions",
    label: "GTIN collisions",
    description: "Variants sharing a non-null GTIN (audit of identity-hardening constraint).",
  },
  {
    key: "signature_collisions",
    label: "Variant signature collisions",
    description: "Variants sharing (catalog_product_id, attribute_signature) when signature is non-null.",
  },
];

export async function fetchCatalogHealth(): Promise<{
  buckets: CatalogHealthBucket[];
  configured: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      buckets: BUCKET_ORDER.map((b) => ({ ...b, count: null })),
    };
  }

  const supabase = getSupabaseAdmin() as any;
  const counts: Record<string, number | null> = {};

  await Promise.all([
    safeCount(counts, "drafts", () =>
      supabase
        .schema("catalog_v2")
        .from("catalog_products")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft")
    ),
    safeCount(counts, "pending_match_reviews", () =>
      supabase
        .schema("catalog_v2")
        .from("catalog_match_reviews")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "pending")
    ),
    derivedMissingImages(supabase).then((n) => (counts.missing_images = n)),
    derivedPlaceholderOnly(supabase).then((n) => (counts.placeholder_only_images = n)),
    derivedThinPdps(supabase).then((n) => (counts.thin_pdps = n)),
    derivedOrphanCategories(supabase).then((n) => (counts.orphan_categories = n)),
    derivedLowVariantCoverage(supabase).then((n) => (counts.low_variant_coverage = n)),
    derivedGtinCollisions(supabase).then((n) => (counts.gtin_collisions = n)),
    derivedSignatureCollisions(supabase).then((n) => (counts.signature_collisions = n)),
    derivedMissingGloveAttributes(supabase).then((n) => (counts.missing_glove_attributes = n)),
  ]);

  const buckets = BUCKET_ORDER.map((b) => ({ ...b, count: counts[b.key] ?? null }));
  return { configured: true, buckets };
}

async function safeCount(
  out: Record<string, number | null>,
  key: string,
  run: () => Promise<{ count: number | null; error: { message: string } | null }>
): Promise<void> {
  try {
    const { count, error } = await run();
    out[key] = error ? null : count ?? 0;
  } catch {
    out[key] = null;
  }
}

const SOFT_LIMIT = 5000;

async function derivedMissingImages(supabase: any): Promise<number | null> {
  try {
    const { data: prods } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, status")
      .in("status", ["active", "draft"])
      .limit(SOFT_LIMIT);
    const ids = ((prods ?? []) as { id: string }[]).map((p) => p.id);
    if (ids.length === 0) return 0;
    const { data: imgs } = await supabase
      .schema("catalog_v2")
      .from("catalog_product_images")
      .select("catalog_product_id")
      .in("catalog_product_id", ids);
    const withImage = new Set(((imgs ?? []) as { catalog_product_id: string }[]).map((r) => r.catalog_product_id));
    let missing = 0;
    for (const id of ids) if (!withImage.has(id)) missing += 1;
    return missing;
  } catch {
    return null;
  }
}

async function derivedPlaceholderOnly(supabase: any): Promise<number | null> {
  try {
    const { data: imgs } = await supabase
      .schema("catalog_v2")
      .from("catalog_product_images")
      .select("catalog_product_id, metadata")
      .limit(SOFT_LIMIT * 4);
    const rowsByProduct = new Map<string, Array<{ metadata: Record<string, unknown> | null }>>();
    for (const r of (imgs ?? []) as { catalog_product_id: string; metadata: Record<string, unknown> | null }[]) {
      const list = rowsByProduct.get(r.catalog_product_id) ?? [];
      list.push({ metadata: r.metadata });
      rowsByProduct.set(r.catalog_product_id, list);
    }
    let onlyPlaceholder = 0;
    for (const [, rows] of Array.from(rowsByProduct.entries())) {
      if (productHasOnlyPlaceholderImagery(rows)) onlyPlaceholder += 1;
    }
    return onlyPlaceholder;
  } catch {
    return null;
  }
}

async function derivedThinPdps(supabase: any): Promise<number | null> {
  try {
    const { data: prods } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id")
      .eq("status", "active")
      .limit(SOFT_LIMIT);
    const ids = ((prods ?? []) as { id: string }[]).map((p) => p.id);
    if (ids.length === 0) return 0;
    const { data: attrs } = await supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("product_id")
      .in("product_id", ids);
    const counts = new Map<string, number>();
    for (const r of (attrs ?? []) as { product_id: string }[]) {
      counts.set(r.product_id, (counts.get(r.product_id) ?? 0) + 1);
    }
    let thin = 0;
    for (const id of ids) if ((counts.get(id) ?? 0) < THIN_PDP_MIN_ATTRIBUTE_ROWS) thin += 1;
    return thin;
  } catch {
    return null;
  }
}

async function derivedOrphanCategories(supabase: any): Promise<number | null> {
  try {
    const { data: prods } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, metadata")
      .in("status", ["active", "draft"])
      .limit(SOFT_LIMIT);
    const ids: string[] = [];
    const catIdByProduct = new Map<string, string>();
    for (const r of (prods ?? []) as { id: string; metadata: Record<string, unknown> | null }[]) {
      const raw = (r.metadata as { category_id?: unknown } | null)?.category_id;
      const catId = typeof raw === "string" ? raw.trim() : "";
      if (catId) {
        ids.push(catId);
        catIdByProduct.set(r.id, catId);
      }
    }
    if (ids.length === 0) return 0;
    const uniqueCatIds = Array.from(new Set(ids));
    const { data: cats } = await supabase
      .schema("catalogos")
      .from("categories")
      .select("id")
      .in("id", uniqueCatIds);
    const known = new Set<string>(((cats ?? []) as { id: string }[]).map((c) => c.id));
    let orphans = 0;
    for (const [, catId] of Array.from(catIdByProduct.entries())) {
      if (!known.has(catId)) orphans += 1;
    }
    return orphans;
  } catch {
    return null;
  }
}

async function derivedLowVariantCoverage(supabase: any): Promise<number | null> {
  try {
    const { data: prods } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id")
      .eq("status", "active")
      .limit(SOFT_LIMIT);
    const ids = ((prods ?? []) as { id: string }[]).map((p) => p.id);
    if (ids.length === 0) return 0;
    const { data: variants } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("catalog_product_id")
      .in("catalog_product_id", ids)
      .eq("is_active", true);
    const counts = new Map<string, number>();
    for (const r of (variants ?? []) as { catalog_product_id: string }[]) {
      counts.set(r.catalog_product_id, (counts.get(r.catalog_product_id) ?? 0) + 1);
    }
    let single = 0;
    for (const id of ids) if ((counts.get(id) ?? 0) === 1) single += 1;
    return single;
  } catch {
    return null;
  }
}

async function derivedGtinCollisions(supabase: any): Promise<number | null> {
  try {
    const { data } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("gtin")
      .not("gtin", "is", null)
      .limit(SOFT_LIMIT * 4);
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { gtin: string }[]) {
      counts.set(r.gtin, (counts.get(r.gtin) ?? 0) + 1);
    }
    let collisions = 0;
    for (const [, n] of Array.from(counts.entries())) if (n > 1) collisions += n;
    return collisions;
  } catch {
    return null;
  }
}

async function derivedSignatureCollisions(supabase: any): Promise<number | null> {
  try {
    const { data } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("catalog_product_id, attribute_signature")
      .not("attribute_signature", "is", null)
      .limit(SOFT_LIMIT * 4);
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { catalog_product_id: string; attribute_signature: string }[]) {
      const k = `${r.catalog_product_id}::${r.attribute_signature}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let collisions = 0;
    for (const [, n] of Array.from(counts.entries())) if (n > 1) collisions += n;
    return collisions;
  } catch {
    return null;
  }
}

async function derivedMissingGloveAttributes(supabase: any): Promise<number | null> {
  try {
    const { data: prods } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, metadata")
      .eq("status", "active")
      .limit(SOFT_LIMIT);
    const candidateIds: string[] = [];
    for (const r of (prods ?? []) as { id: string; metadata: Record<string, unknown> | null }[]) {
      if (isGloveAttributeCandidate(r.metadata)) candidateIds.push(r.id);
    }
    if (candidateIds.length === 0) return 0;

    const { data: attrs } = await supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("product_id, attribute_definition_id, value_text")
      .in("product_id", candidateIds);
    const { data: defs } = await supabase
      .schema("catalogos")
      .from("attribute_definitions")
      .select("id, attribute_key");
    const keyByDefId = new Map<string, string>();
    for (const d of (defs ?? []) as { id: string; attribute_key: string }[]) keyByDefId.set(d.id, d.attribute_key);

    const keysByProduct = new Map<string, Set<string>>();
    for (const r of (attrs ?? []) as { product_id: string; attribute_definition_id: string; value_text: string | null }[]) {
      if (!r.value_text || !r.value_text.trim()) continue;
      const key = keyByDefId.get(r.attribute_definition_id);
      if (!key) continue;
      const set = keysByProduct.get(r.product_id) ?? new Set<string>();
      set.add(key);
      keysByProduct.set(r.product_id, set);
    }

    let missing = 0;
    for (const id of candidateIds) {
      const keys = keysByProduct.get(id) ?? new Set<string>();
      if (isMissingGloveAttributesForKeys(keys)) missing += 1;
    }
    return missing;
  } catch {
    return null;
  }
}

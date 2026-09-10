import { classifyGloveCubsSavingsReadiness, type GloveCubsSavingsReadinessRow } from "@/lib/procurement/glovecubs-savings-readiness";

const MAX_ACTIVE_PRODUCTS = 500;
const MAX_VARIANTS = 4000;
const MAX_ATTR_ROWS = 20_000;

function attrKey(embed: unknown): string | null {
  if (!embed) return null;
  if (Array.isArray(embed)) {
    const k = (embed[0] as { attribute_key?: string } | undefined)?.attribute_key;
    return typeof k === "string" ? k : null;
  }
  const k = (embed as { attribute_key?: string }).attribute_key;
  return typeof k === "string" ? k : null;
}

export async function auditGloveCubsSavingsReadiness(supabase: any): Promise<{
  rows: GloveCubsSavingsReadinessRow[];
  active_product_count: number;
  eligible_variant_count: number;
  ineligible_variant_count: number;
}> {
  const { data: products, error: pErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, slug, status, metadata")
    .eq("status", "active")
    .limit(MAX_ACTIVE_PRODUCTS);
  if (pErr) throw new Error(pErr.message);
  const productList = (products ?? []) as Array<{
    id: string;
    name: string;
    slug: string | null;
    status: string;
    metadata: Record<string, unknown> | null;
  }>;
  const ids = productList.map((p) => p.id);
  if (ids.length === 0) {
    return { rows: [], active_product_count: 0, eligible_variant_count: 0, ineligible_variant_count: 0 };
  }

  const { data: variants } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id, catalog_product_id, size_code, is_active")
    .in("catalog_product_id", ids)
    .eq("is_active", true)
    .limit(MAX_VARIANTS);

  const { data: attrs } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("product_id, value_text, value_number, attribute_definitions(attribute_key)")
    .in("product_id", ids)
    .limit(MAX_ATTR_ROWS);

  const specByProduct = new Map<string, Record<string, string>>();
  for (const row of attrs ?? []) {
    const r = row as {
      product_id: string;
      value_text?: string | null;
      value_number?: number | null;
      attribute_definitions?: unknown;
    };
    const key = attrKey(r.attribute_definitions);
    const val =
      r.value_text != null && String(r.value_text).trim()
        ? String(r.value_text).trim()
        : r.value_number != null
          ? String(r.value_number)
          : null;
    if (!key || val == null) continue;
    const cur = specByProduct.get(r.product_id) ?? {};
    cur[key] = val;
    specByProduct.set(r.product_id, cur);
  }

  const variantIds = ((variants ?? []) as Array<{ id: string }>).map((v) => v.id);
  const priceByVariant = new Map<string, number>();
  if (variantIds.length) {
    const { data: prices } = await supabase
      .schema("catalogos")
      .from("variant_best_offer_price")
      .select("catalog_variant_id, list_unit_price_major")
      .in("catalog_variant_id", variantIds);
    for (const row of prices ?? []) {
      const r = row as { catalog_variant_id: string; list_unit_price_major?: number | null };
      if (r.list_unit_price_major != null && Number(r.list_unit_price_major) > 0) {
        priceByVariant.set(r.catalog_variant_id, Number(r.list_unit_price_major));
      }
    }
  }

  const rows: GloveCubsSavingsReadinessRow[] = [];
  for (const p of productList) {
    const commerce = (p.metadata?.commerce_packaging as Record<string, unknown> | undefined) ?? {};
    const glovesPerBox = commerce.units_per_inner != null ? Number(commerce.units_per_inner) : null;
    const boxesPerCase = commerce.inners_per_case != null ? Number(commerce.inners_per_case) : null;
    const glovesPerCase = commerce.units_per_case != null ? Number(commerce.units_per_case) : null;
    const specs = specByProduct.get(p.id) ?? {};
    const milRaw = specs.thickness_mil ?? specs.thickness ?? specs.mil ?? null;
    const mil = milRaw != null ? Number(milRaw) : null;
    const certs = specs.certifications ?? specs.certification ?? null;
    const pVariants = ((variants ?? []) as Array<{
      id: string;
      catalog_product_id: string;
      size_code: string | null;
      is_active: boolean;
    }>).filter((v) => v.catalog_product_id === p.id);
    const list = pVariants.length ? pVariants : [{ id: "", catalog_product_id: p.id, size_code: null, is_active: false }];
    for (const v of list) {
      rows.push(
        classifyGloveCubsSavingsReadiness({
          catalog_product_id: p.id,
          name: p.name,
          slug: p.slug,
          status: p.status,
          size: v.size_code,
          catalog_variant_id: v.id || null,
          variant_is_active: Boolean(v.id) && v.is_active,
          material: specs.material ?? specs.primary_material ?? specs.glove_material ?? null,
          grade: specs.grade ?? null,
          thickness_mil: mil != null && Number.isFinite(mil) ? mil : null,
          powder: specs.powder ?? specs.powder_status ?? null,
          gloves_per_box: glovesPerBox != null && Number.isFinite(glovesPerBox) ? glovesPerBox : null,
          list_unit_price_major: v.id ? priceByVariant.get(v.id) ?? null : null,
          color: specs.color ?? null,
          texture: specs.texture ?? specs.texture_type ?? null,
          cuff: specs.cuff ?? specs.cuff_style ?? null,
          certifications: certs,
          boxes_per_case: boxesPerCase != null && Number.isFinite(boxesPerCase) ? boxesPerCase : null,
          gloves_per_case:
            glovesPerCase != null && Number.isFinite(glovesPerCase)
              ? glovesPerCase
              : glovesPerBox != null && boxesPerCase != null && Number.isFinite(glovesPerBox) && Number.isFinite(boxesPerCase)
                ? glovesPerBox * boxesPerCase
                : null,
        }),
      );
    }
  }

  return {
    rows,
    active_product_count: productList.length,
    eligible_variant_count: rows.filter((r) => r.savings_eligible).length,
    ineligible_variant_count: rows.filter((r) => !r.savings_eligible).length,
  };
}

/**
 * Load competitor + PA V2 sell price, evaluate governed comparison, persist snapshot.
 * Deterministic DB lookups only — no AI.
 */

import { identifyCompetitorProduct, normalizeCompetitorAlias, type CompetitorAliasType } from "@/lib/procurement/competitor-identify";
import {
  evaluateInvoiceLineComparison,
  type CompetitorIdentity,
  type EquivalencyRef,
  type GloveCubsSide,
  type InvoiceLineComparison,
} from "@/lib/procurement/invoice-line-comparison";
import type { InvoicePackFacts } from "@/lib/procurement/invoice-pack-authority";
import type { GloveSpecSnapshot } from "@/lib/procurement/glove-compatibility";
import { resolveBuyerUnitPriceViaRpc } from "@/lib/pricing/resolve-buyer-unit-price";
import { sellPriceLooksLikeCost } from "@/lib/procurement/governed-savings";

export type LineForComparison = {
  id: string;
  raw_description: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  supplier_sku: string | null;
  manufacturer_sku: string | null;
  quantity_uom: string | null;
  gloves_per_box: number | null;
  boxes_per_case: number | null;
  gloves_per_case: number | null;
  size?: string | null;
  normalized_snapshot?: Record<string, unknown> | null;
};

function packFromLine(ln: LineForComparison): InvoicePackFacts {
  const u = ln.quantity_uom;
  return {
    quantity_uom: u === "EA" || u === "BX" || u === "CS" ? u : null,
    gloves_per_box: ln.gloves_per_box,
    boxes_per_case: ln.boxes_per_case,
    gloves_per_case: ln.gloves_per_case,
  };
}

function specsFromSnapshot(snap: Record<string, unknown> | null | undefined, fallbackSize?: string | null): GloveSpecSnapshot {
  const attrs = (snap?.filter_attributes as Record<string, unknown> | undefined) ?? snap ?? {};
  const mil = attrs.thickness_mil != null ? Number(attrs.thickness_mil) : null;
  return {
    material: attrs.material != null ? String(attrs.material) : null,
    grade: attrs.grade != null ? String(attrs.grade) : null,
    thickness_mil: mil != null && Number.isFinite(mil) ? mil : null,
    powder: attrs.powder != null ? String(attrs.powder) : null,
    size: fallbackSize ?? (attrs.size != null ? String(attrs.size) : null),
    texture: attrs.texture != null ? String(attrs.texture) : attrs.texture_type != null ? String(attrs.texture_type) : null,
    cuff: attrs.cuff != null ? String(attrs.cuff) : attrs.cuff_style != null ? String(attrs.cuff_style) : null,
    certifications: Array.isArray(attrs.certifications) ? (attrs.certifications as string[]) : null,
    color: attrs.color != null ? String(attrs.color) : null,
  } as GloveSpecSnapshot;
}

function supabaseAliasRepo(supabase: any) {
  return {
    async findAlias(type: CompetitorAliasType, normalized: string) {
      const { data } = await supabase
        .schema("gc_commerce")
        .from("competitor_product_aliases")
        .select("competitor_product_id, alias_type")
        .eq("alias_type", type)
        .eq("normalized_value", normalized)
        .maybeSingle();
      if (!data) return null;
      return {
        competitor_product_id: String((data as { competitor_product_id: string }).competitor_product_id),
        alias_type: type,
      };
    },
  };
}

async function loadCompetitor(supabase: any, id: string, identified_by: CompetitorIdentity["identified_by"]): Promise<CompetitorIdentity | null> {
  const { data } = await supabase.schema("gc_commerce").from("competitor_products").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id,
    manufacturer: r.manufacturer != null ? String(r.manufacturer) : null,
    brand: r.brand != null ? String(r.brand) : null,
    sku: r.sku != null ? String(r.sku) : null,
    upc_gtin: r.upc_gtin != null ? String(r.upc_gtin) : null,
    product_name: r.product_name != null ? String(r.product_name) : null,
    identified_by,
    specs: {
      material: r.material != null ? String(r.material) : null,
      grade: r.grade != null ? String(r.grade) : null,
      thickness_mil: r.thickness_mil != null ? Number(r.thickness_mil) : null,
      powder: r.powder != null ? String(r.powder) : null,
      size: r.size != null ? String(r.size) : null,
      texture: r.texture != null ? String(r.texture) : null,
      cuff: r.cuff != null ? String(r.cuff) : null,
      certifications: Array.isArray(r.certifications) ? (r.certifications as string[]) : null,
      color: r.color != null ? String(r.color) : null,
    },
    pack: {
      quantity_uom: r.quantity_uom === "EA" || r.quantity_uom === "BX" || r.quantity_uom === "CS" ? r.quantity_uom : null,
      gloves_per_box: r.gloves_per_box != null ? Number(r.gloves_per_box) : null,
      boxes_per_case: r.boxes_per_case != null ? Number(r.boxes_per_case) : null,
      gloves_per_case: r.gloves_per_case != null ? Number(r.gloves_per_case) : null,
    },
  };
}

async function loadEquivalency(supabase: any, competitorId: string): Promise<EquivalencyRef | null> {
  const { data } = await supabase
    .schema("gc_commerce")
    .from("competitor_equivalencies")
    .select("id, status, catalog_product_id, catalog_variant_id")
    .eq("competitor_product_id", competitorId)
    .in("status", ["approved", "candidate", "needs_review"]);
  const rows = (data ?? []) as Record<string, unknown>[];
  const pick = rows.find((r) => r.status === "approved") ?? rows[0];
  if (!pick) return null;
  return {
    id: String(pick.id),
    status: pick.status as EquivalencyRef["status"],
    catalog_product_id: pick.catalog_product_id != null ? String(pick.catalog_product_id) : null,
    catalog_variant_id: pick.catalog_variant_id != null ? String(pick.catalog_variant_id) : null,
  };
}

function attrKey(embed: unknown): string | null {
  if (!embed) return null;
  if (Array.isArray(embed)) {
    const k = (embed[0] as { attribute_key?: string } | undefined)?.attribute_key;
    return typeof k === "string" ? k : null;
  }
  const k = (embed as { attribute_key?: string }).attribute_key;
  return typeof k === "string" ? k : null;
}

async function loadCatalogProductSpecs(supabase: any, catalogProductId: string): Promise<GloveSpecSnapshot> {
  const { data: rows } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("value_text, value_number, attribute_definitions(attribute_key)")
    .eq("product_id", catalogProductId)
    .limit(200);
  const map: Record<string, string> = {};
  const certs: string[] = [];
  for (const row of rows ?? []) {
    const r = row as { value_text?: string | null; value_number?: number | null; attribute_definitions?: unknown };
    const key = attrKey(r.attribute_definitions);
    const val =
      r.value_text != null && String(r.value_text).trim()
        ? String(r.value_text).trim()
        : r.value_number != null && Number.isFinite(Number(r.value_number))
          ? String(r.value_number)
          : null;
    if (!key || val == null) continue;
    if (key === "certifications") certs.push(val);
    else map[key] = val;
  }
  const mil = map.thickness_mil != null ? Number(map.thickness_mil) : null;
  return {
    material: map.material ?? null,
    grade: map.grade ?? null,
    thickness_mil: mil != null && Number.isFinite(mil) ? mil : null,
    powder: map.powder ?? null,
    size: map.size ?? null,
    texture: map.texture ?? map.texture_type ?? null,
    cuff: map.cuff ?? map.cuff_style ?? null,
    certifications: certs.length ? certs : null,
    color: map.color ?? null,
  };
}

async function loadGloveCubsSide(
  supabase: any,
  catalogProductId: string,
  catalogVariantId: string | null,
  size: string | null,
  companyId: string | null,
): Promise<GloveCubsSide | null> {
  let variantId = catalogVariantId;
  const sizes: string[] = [];
  const { data: variants } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id, variant_sku, size_code, is_active")
    .eq("catalog_product_id", catalogProductId)
    .eq("is_active", true);
  for (const v of variants ?? []) {
    const row = v as { id: string; size_code: string | null };
    if (row.size_code) sizes.push(String(row.size_code));
    if (!variantId && size && String(row.size_code ?? "").toLowerCase() === size.toLowerCase()) {
      variantId = row.id;
    }
  }
  if (!variantId && Array.isArray(variants) && variants.length === 1) {
    variantId = String((variants[0] as { id: string }).id);
  }

  let sell_unit_price: number | null = null;
  let pricing_source: string | null = null;
  if (variantId && companyId) {
    const priced = await resolveBuyerUnitPriceViaRpc(supabase, {
      companyId,
      catalogVariantId: variantId,
      quantity: 1,
    });
    if (priced.ok && priced.data.resolved_unit_price_major != null) {
      sell_unit_price = priced.data.resolved_unit_price_major;
      pricing_source = priced.data.pricing_source;
    }
  } else if (variantId) {
    const { data: list } = await supabase
      .schema("catalogos")
      .from("variant_best_offer_price")
      .select("list_unit_price_major, pricing_source")
      .eq("catalog_variant_id", variantId)
      .maybeSingle();
    const row = list as { list_unit_price_major?: number; pricing_source?: string } | null;
    if (row?.list_unit_price_major != null && Number.isFinite(row.list_unit_price_major)) {
      sell_unit_price = Number(row.list_unit_price_major);
      pricing_source = String(row.pricing_source ?? "catalogos.variant_best_offer_price");
    }
  }
  if (pricing_source && sellPriceLooksLikeCost(pricing_source)) {
    sell_unit_price = null;
    pricing_source = "blocked_supplier_cost";
  }

  const { data: product } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, internal_sku, metadata")
    .eq("id", catalogProductId)
    .maybeSingle();
  const p = product as { name?: string; internal_sku?: string; metadata?: Record<string, unknown> } | null;
  const commerce = (p?.metadata?.commerce_packaging as Record<string, unknown> | undefined) ?? {};
  const unitsPerInner = commerce.units_per_inner != null ? Number(commerce.units_per_inner) : null;
  const innersPerCase = commerce.inners_per_case != null ? Number(commerce.inners_per_case) : null;
  const unitsPerCase = commerce.units_per_case != null ? Number(commerce.units_per_case) : null;
  const glovesPerBox = unitsPerInner != null && Number.isFinite(unitsPerInner) ? unitsPerInner : null;
  const boxesPerCase = innersPerCase != null && Number.isFinite(innersPerCase) ? innersPerCase : null;
  const glovesPerCase =
    unitsPerCase != null && Number.isFinite(unitsPerCase)
      ? unitsPerCase
      : glovesPerBox != null && boxesPerCase != null
        ? glovesPerBox * boxesPerCase
        : null;

  const specs = await loadCatalogProductSpecs(supabase, catalogProductId);
  if (size && !specs.size) specs.size = size;
  /** PA V2 unit price is the variant sell unit (typically a box). Do not silently treat case pack as that unit. */
  const sell_gloves_per_unit = glovesPerBox;

  return {
    catalog_product_id: catalogProductId,
    catalog_variant_id: variantId,
    name: p?.name ?? null,
    sku: p?.internal_sku ?? null,
    specs,
    pack: {
      quantity_uom: glovesPerBox != null ? "BX" : glovesPerCase != null ? "CS" : null,
      gloves_per_box: glovesPerBox,
      boxes_per_case: boxesPerCase,
      gloves_per_case: glovesPerCase,
    },
    available_sizes: sizes,
    sell_unit_price,
    sell_gloves_per_unit,
    pricing_source,
  };
}

export async function runAndPersistLineComparison(
  supabase: any,
  input: {
    line: LineForComparison;
    companyId: string | null;
    catalogosCandidate?: { catalog_product_id: string | null; match_reason: string; normalized_snapshot?: Record<string, unknown> } | null;
  },
): Promise<InvoiceLineComparison | null> {
  try {
    const hit = await identifyCompetitorProduct({
      sku: input.line.supplier_sku,
      manufacturer_sku: input.line.manufacturer_sku,
      description: input.line.raw_description,
      repo: supabaseAliasRepo(supabase),
    });
    const competitor = hit ? await loadCompetitor(supabase, hit.competitor_product_id, hit.identified_by) : null;
    const equivalency = competitor ? await loadEquivalency(supabase, competitor.id) : null;
    let gloveCubs: GloveCubsSide | null = null;
    if (equivalency?.status === "approved" && equivalency.catalog_product_id) {
      gloveCubs = await loadGloveCubsSide(
        supabase,
        equivalency.catalog_product_id,
        equivalency.catalog_variant_id,
        specsFromSnapshot(input.line.normalized_snapshot, input.line.size).size ?? null,
        input.companyId,
      );
    }
    const comparison = evaluateInvoiceLineComparison({
      description: input.line.raw_description,
      quantity: Number(input.line.quantity) || 0,
      unit_price: input.line.unit_price,
      line_total: input.line.line_total,
      sku: input.line.supplier_sku,
      pack: packFromLine(input.line),
      specs: specsFromSnapshot(input.line.normalized_snapshot, input.line.size),
      competitor,
      equivalency,
      gloveCubs,
      catalogos_candidate:
        input.catalogosCandidate?.catalog_product_id && input.catalogosCandidate.match_reason === "fuzzy_title"
          ? { catalog_product_id: input.catalogosCandidate.catalog_product_id, match_reason: "fuzzy_title" }
          : input.catalogosCandidate?.catalog_product_id && !competitor
            ? { catalog_product_id: input.catalogosCandidate.catalog_product_id, match_reason: input.catalogosCandidate.match_reason }
            : null,
    });
    await supabase
      .schema("gc_commerce")
      .from("invoice_lines")
      .update({
        competitor_product_id: competitor?.id ?? null,
        match_trust_status: comparison.trust_status,
        comparison_snapshot: comparison,
        comparison_block_reason: comparison.block_reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.line.id);
    return comparison;
  } catch {
    return null;
  }
}

export async function persistGovernedComparisonsForInvoice(
  supabase: any,
  uploadedInvoiceId: string,
  companyId: string | null,
  catalogByLine: Map<string, { catalog_product_id: string | null; match_reason: string; normalized_snapshot?: Record<string, unknown> }>,
): Promise<void> {
  const { data: lines } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select(
      "id, raw_description, quantity, unit_price, line_total, supplier_sku, manufacturer_sku, quantity_uom, gloves_per_box, boxes_per_case, gloves_per_case, normalized_snapshot",
    )
    .eq("uploaded_invoice_id", uploadedInvoiceId);
  for (const ln of lines ?? []) {
    const row = ln as LineForComparison;
    await runAndPersistLineComparison(supabase, {
      line: row,
      companyId,
      catalogosCandidate: catalogByLine.get(row.id) ?? null,
    });
  }
}

export async function recomputeInvoiceLineComparison(
  supabase: any,
  lineId: string,
  companyId: string | null,
): Promise<InvoiceLineComparison | null> {
  const { data: line, error } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select(
      "id, raw_description, quantity, unit_price, line_total, supplier_sku, manufacturer_sku, quantity_uom, gloves_per_box, boxes_per_case, gloves_per_case, normalized_snapshot, match_reason, catalog_product_id",
    )
    .eq("id", lineId)
    .maybeSingle();
  if (error || !line) return null;
  const row = line as LineForComparison & { match_reason?: string | null; catalog_product_id?: string | null };
  return runAndPersistLineComparison(supabase, {
    line: row,
    companyId,
    catalogosCandidate:
      row.catalog_product_id != null
        ? { catalog_product_id: row.catalog_product_id, match_reason: String(row.match_reason ?? "unknown") }
        : null,
  });
}

export { normalizeCompetitorAlias };

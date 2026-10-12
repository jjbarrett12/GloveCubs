#!/usr/bin/env node
/**
 * Read-only GloveCubs savings-readiness audit. No writes. Does not print secrets.
 * Usage: node scripts/audit-savings-readiness.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_ENV_FILE_PATHS, mergeEnvFileVars } from "./env-file-utils.mjs";

const fileEnv = mergeEnvFileVars(DEFAULT_ENV_FILE_PATHS);
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim() ||
  fileEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  fileEnv.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || fileEnv.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("[audit-savings-readiness] Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function present(s) {
  return s != null && String(s).trim().length > 0;
}
function positive(n) {
  return n != null && Number.isFinite(Number(n)) && Number(n) > 0;
}
function attrKey(embed) {
  if (!embed) return null;
  if (Array.isArray(embed)) {
    const k = embed[0]?.attribute_key;
    return typeof k === "string" ? k : null;
  }
  return typeof embed.attribute_key === "string" ? embed.attribute_key : null;
}

function classify(facts) {
  const blockers = [];
  if (facts.status !== "active") blockers.push("inactive_product");
  if (!facts.catalog_variant_id || !facts.variant_is_active) blockers.push("inactive_or_missing_variant");
  if (!present(facts.material)) blockers.push("missing_material");
  if (!present(facts.grade)) blockers.push("missing_grade");
  if (!positive(facts.thickness_mil)) blockers.push("missing_thickness");
  if (!present(facts.powder)) blockers.push("missing_powder");
  const packaging_ready = positive(facts.gloves_per_box);
  if (!packaging_ready) blockers.push("missing_packaging");
  const sell_price_ready = positive(facts.list_unit_price_major);
  if (!sell_price_ready) blockers.push("missing_sell_price");
  return {
    name: facts.name,
    slug: facts.slug,
    size: facts.size,
    specs_ready:
      present(facts.material) && present(facts.grade) && positive(facts.thickness_mil) && present(facts.powder),
    packaging_ready,
    sell_price_ready,
    savings_eligible: blockers.length === 0,
    blockers,
    color_present: present(facts.color),
    texture_present: present(facts.texture),
    cuff_present: present(facts.cuff),
    certifications_present: present(facts.certifications),
    boxes_per_case_present: positive(facts.boxes_per_case),
    gloves_per_case_present: positive(facts.gloves_per_case),
  };
}

const { error: tableErr } = await supabase.schema("gc_commerce").from("competitor_products").select("id").limit(1);
const competitor_tables = tableErr ? { ok: false, message: tableErr.message } : { ok: true };

const { data: products, error: pErr } = await supabase
  .schema("catalog_v2")
  .from("catalog_products")
  .select("id, name, slug, status, metadata")
  .eq("status", "active")
  .limit(500);

if (pErr) {
  console.error("[audit-savings-readiness] catalog_products query failed:", pErr.message);
  process.exit(1);
}

const productList = products ?? [];
const ids = productList.map((p) => p.id);

const { data: variants } = ids.length
  ? await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, size_code, is_active")
      .in("catalog_product_id", ids)
      .eq("is_active", true)
      .limit(4000)
  : { data: [] };

const { data: attrs } = ids.length
  ? await supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("product_id, value_text, value_number, attribute_definitions(attribute_key)")
      .in("product_id", ids)
      .limit(20000)
  : { data: [] };

const specByProduct = new Map();
const keysSeen = new Set();
for (const row of attrs ?? []) {
  const key = attrKey(row.attribute_definitions);
  const val =
    row.value_text != null && String(row.value_text).trim()
      ? String(row.value_text).trim()
      : row.value_number != null
        ? String(row.value_number)
        : null;
  if (!key || val == null) continue;
  keysSeen.add(key);
  const cur = specByProduct.get(row.product_id) ?? {};
  cur[key] = val;
  specByProduct.set(row.product_id, cur);
}

const variantIds = (variants ?? []).map((v) => v.id);
const priceByVariant = new Map();
if (variantIds.length) {
  const { data: prices, error: priceErr } = await supabase
    .schema("catalogos")
    .from("variant_best_offer_price")
    .select("catalog_variant_id, list_unit_price_major")
    .in("catalog_variant_id", variantIds);
  if (priceErr) {
    console.error("[audit-savings-readiness] variant_best_offer_price query failed:", priceErr.message);
  }
  for (const row of prices ?? []) {
    if (row.list_unit_price_major != null && Number(row.list_unit_price_major) > 0) {
      priceByVariant.set(row.catalog_variant_id, Number(row.list_unit_price_major));
    }
  }
}

const rows = [];
for (const p of productList) {
  const commerce = p.metadata?.commerce_packaging ?? {};
  const glovesPerBox = commerce.units_per_inner != null ? Number(commerce.units_per_inner) : null;
  const boxesPerCase = commerce.inners_per_case != null ? Number(commerce.inners_per_case) : null;
  const glovesPerCase = commerce.units_per_case != null ? Number(commerce.units_per_case) : null;
  const specs = specByProduct.get(p.id) ?? {};
  const milRaw = specs.thickness_mil ?? specs.thickness ?? specs.mil ?? null;
  const mil = milRaw != null ? Number(milRaw) : null;
  const pVariants = (variants ?? []).filter((v) => v.catalog_product_id === p.id);
  const list = pVariants.length ? pVariants : [{ id: "", catalog_product_id: p.id, size_code: null, is_active: false }];
  for (const v of list) {
    rows.push(
      classify({
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
        certifications: specs.certifications ?? specs.certification ?? null,
        boxes_per_case: boxesPerCase != null && Number.isFinite(boxesPerCase) ? boxesPerCase : null,
        gloves_per_case:
          glovesPerCase != null && Number.isFinite(glovesPerCase)
            ? glovesPerCase
            : glovesPerBox != null && boxesPerCase != null
              ? glovesPerBox * boxesPerCase
              : null,
      }),
    );
  }
}

const eligible = rows.filter((r) => r.savings_eligible);
const blockerCounts = {};
for (const r of rows) {
  for (const b of r.blockers) blockerCounts[b] = (blockerCounts[b] ?? 0) + 1;
}

console.log(
  JSON.stringify(
    {
      supabase_host: (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "invalid";
        }
      })(),
      competitor_tables,
      active_product_count: productList.length,
      variant_row_count: rows.length,
      eligible_variant_count: eligible.length,
      ineligible_variant_count: rows.length - eligible.length,
      truncated_at_500_products: productList.length >= 500,
      attribute_keys_seen: [...keysSeen].sort(),
      blocker_counts: blockerCounts,
      rows: rows.map((r) => ({
        product: r.name,
        slug: r.slug,
        size: r.size,
        specs_ready: r.specs_ready,
        packaging_ready: r.packaging_ready,
        sell_price_ready: r.sell_price_ready,
        savings_eligible: r.savings_eligible,
        blockers: r.blockers,
        color_present: r.color_present,
        texture_present: r.texture_present,
        cuff_present: r.cuff_present,
        certifications_present: r.certifications_present,
        boxes_per_case_present: r.boxes_per_case_present,
        gloves_per_case_present: r.gloves_per_case_present,
      })),
    },
    null,
    2,
  ),
);

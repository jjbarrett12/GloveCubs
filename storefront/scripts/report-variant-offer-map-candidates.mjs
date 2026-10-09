#!/usr/bin/env node
/**
 * Read-only report of apparent variant ↔ supplier_offer candidates.
 * Does NOT write mappings. Does not apply migrations. Do not use as auto-repair.
 *
 * Usage: node scripts/report-variant-offer-map-candidates.mjs
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
  console.error("[report-variant-offer-map-candidates] Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function manufacturerSku(meta, mpn) {
  if (meta && typeof meta === "object" && typeof meta.manufacturer_sku === "string" && meta.manufacturer_sku.trim()) {
    return meta.manufacturer_sku.trim();
  }
  const m = typeof mpn === "string" ? mpn.trim() : "";
  return m || null;
}

const { data: variants, error: vErr } = await supabase
  .schema("catalog_v2")
  .from("catalog_variants")
  .select("id, catalog_product_id, variant_sku, size_code, metadata, mpn, is_active")
  .eq("is_active", true);

if (vErr) {
  console.error("[report-variant-offer-map-candidates] variants:", vErr.message);
  process.exit(1);
}

const { data: offers, error: oErr } = await supabase
  .schema("catalogos")
  .from("supplier_offers")
  .select("id, product_id, supplier_id, supplier_sku, sell_price, is_active, catalog_variant_id");

if (oErr) {
  console.error("[report-variant-offer-map-candidates] offers:", oErr.message);
  process.exit(1);
}

const offerList = offers ?? [];
const mapped = offerList.filter((o) => o.catalog_variant_id).length;
const unmappedOffers = offerList.filter((o) => !o.catalog_variant_id);
const variantsList = variants ?? [];

const apparent = [];
for (const v of variantsList) {
  const mfr = manufacturerSku(v.metadata, v.mpn);
  if (!mfr) continue;
  for (const o of unmappedOffers) {
    if (o.product_id !== v.catalog_product_id) continue;
    if (String(o.supplier_sku).trim() !== mfr) continue;
    apparent.push({
      variant_id: v.id,
      variant_sku: v.variant_sku,
      size_code: v.size_code,
      manufacturer_sku: mfr,
      offer_id: o.id,
      supplier_sku: o.supplier_sku,
      sell_price: o.sell_price,
      is_active: o.is_active,
    });
  }
}

console.log(
  JSON.stringify(
    {
      mode: "report_only",
      writes: false,
      active_variants: variantsList.length,
      offers: offerList.length,
      offers_already_mapped: mapped,
      apparent_manufacturer_sku_matches: apparent.length,
      variants_with_no_mapped_offer: variantsList.filter(
        (v) => !offerList.some((o) => o.catalog_variant_id === v.id)
      ).length,
      apparent,
    },
    null,
    2
  )
);

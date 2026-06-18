#!/usr/bin/env node
/**
 * Read-only launch catalog readiness report (no publish, no writes).
 * Usage: node scripts/launch-catalog-readiness.mjs [--min=10]
 */
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_ENV_FILE_PATHS, mergeEnvFileVars } from "./env-file-utils.mjs";

const fileEnv = mergeEnvFileVars(DEFAULT_ENV_FILE_PATHS);
const min = Number.parseInt(process.argv.find((a) => a.startsWith("--min="))?.split("=")[1] ?? "10", 10);

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim() ||
  fileEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  fileEnv.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || fileEnv.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("[launch-catalog-readiness] Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: products, error } = await supabase
  .schema("catalog_v2")
  .from("catalog_products")
  .select("id, name, slug, status, internal_sku, metadata")
  .eq("status", "active")
  .limit(500);

if (error) {
  console.error("[launch-catalog-readiness] query failed:", error.message);
  process.exit(1);
}

const rows = products ?? [];
const issues = [];

for (const p of rows) {
  const id = String(p.id);
  const missing = [];
  if (!String(p.name ?? "").trim()) missing.push("name");
  if (!String(p.slug ?? "").trim()) missing.push("slug");
  const { data: variants } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id, size_code, variant_sku, is_active")
    .eq("catalog_product_id", id)
    .eq("is_active", true)
    .limit(20);
  if (!variants?.length) missing.push("active_variant");
  const { data: images } = await supabase
    .schema("catalog_v2")
    .from("catalog_product_images")
    .select("id")
    .eq("catalog_product_id", id)
    .limit(1);
  if (!images?.length) missing.push("image");
  if (missing.length) issues.push({ id, slug: p.slug, missing });
}

const readyCount = rows.length - issues.length;
const pass = rows.length >= min && issues.length === 0;

console.log(
  JSON.stringify(
    {
      active_products: rows.length,
      launch_min: min,
      ready_without_gaps: readyCount,
      products_with_gaps: issues.length,
      gap_samples: issues.slice(0, 10),
      pass,
      note: "Read-only. Publish via CatalogOS runPublish only.",
    },
    null,
    2
  )
);

process.exit(pass ? 0 : 1);

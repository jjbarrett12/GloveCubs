import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

config({ path: join(__dirname, "../.env.local") });

async function loadTs(fnPath) {
  const { register } = await import("tsx/esm/api");
  register();
  return import(fnPath);
}

async function main() {
  const out = { staging: null, product: null, variants: null, attributes: null, liveParse: null };

  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (u && k) {
    const sb = createClient(u, k);
    const { data: rows, error } = await sb
      .schema("catalog_v2")
      .from("admin_url_clipboard_staging")
      .select("id, product_page_url, review_status, created_catalog_product_id, extracted, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    out.staging = { error: error?.message, rows: rows ?? [] };

    const promoted = (rows ?? []).find((r) => r.created_catalog_product_id);
    if (promoted?.created_catalog_product_id) {
      const pid = promoted.created_catalog_product_id;
      const { data: prod } = await sb
        .schema("catalog_v2")
        .from("catalog_products")
        .select("id, name, metadata, description, brand_id")
        .eq("id", pid)
        .maybeSingle();
      const { data: vars } = await sb
        .schema("catalog_v2")
        .from("catalog_variants")
        .select("variant_sku, size_code, sort_order, metadata")
        .eq("catalog_product_id", pid)
        .order("sort_order");
      const { data: attrs } = await sb
        .schema("catalogos")
        .from("product_attributes")
        .select("attribute_definition_id, value_text, value_number, value_boolean")
        .eq("product_id", pid);
      out.product = prod;
      out.variants = vars;
      out.attributes = attrs;
    }
  } else {
    out.staging = { error: "NO_SUPABASE_ENV" };
  }

  try {
    const { fetchHtmlForImport } = await import("../src/lib/admin/import-draft-fetch.ts");
    const { toImportDraftProductV1 } = await import("../src/lib/admin/import-draft-mapper.ts");
    const { extractProductFromHtml } = await import("../src/lib/admin/productExtraction.ts");
    const url = "https://safety-zone.com/disposable-gloves/";
    const { html, truncated } = await fetchHtmlForImport(url, 200_000);
    const result = extractProductFromHtml(html, url);
    const draft = toImportDraftProductV1(result, url);
    out.liveParse = {
      url,
      truncated,
      product_name: draft.product_name,
      brand: draft.brand,
      material: draft.material,
      color: draft.color,
      thickness_mil: draft.thickness_mil,
      case_pack: draft.case_pack,
      units_per_case: draft.units_per_case,
      powder_free: draft.powder_free,
      exam_grade: draft.exam_grade,
      variants: draft.variants,
      warnings: draft.parse_warnings,
    };
  } catch (e) {
    out.liveParse = { error: e instanceof Error ? e.message : String(e) };
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

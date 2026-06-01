import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const PRODUCT_ID = process.argv[2] || "2a428f39-2752-47ba-886a-6e560b7e8a8f";
const STAGING_ID = process.argv[3] || "6841a0a9-66a2-48f2-8fa5-3d0c735d3839";
const CATEGORY_ID = "71c407a2-0ee0-455c-b4fb-0c8d930ad6f5";

async function main() {
  const { parseImportDraftFromExtracted } = await import("../src/lib/admin/import-draft-mapper");
  const { upsertImportDraftGloveAttributes } = await import("../src/lib/admin/product-attribute-upsert");
  const { getSupabaseAdmin } = await import("../src/lib/supabase/server");

  const supabase = getSupabaseAdmin() as any;
  const { data: row } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("extracted, product_page_url")
    .eq("id", STAGING_ID)
    .single();

  const draft = parseImportDraftFromExtracted(
    (row as { extracted: Record<string, unknown> }).extracted,
    (row as { product_page_url: string }).product_page_url
  );
  if (!draft) throw new Error("no draft");

  const res = await upsertImportDraftGloveAttributes(PRODUCT_ID, CATEGORY_ID, draft);
  console.log("UPSERT:", JSON.stringify(res, null, 2));

  const { data: attrs } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("attribute_definition_id, value_text")
    .eq("product_id", PRODUCT_ID);

  const { data: defs } = await supabase
    .schema("catalogos")
    .from("attribute_definitions")
    .select("id, attribute_key")
    .eq("category_id", CATEGORY_ID);

  const keyById = new Map((defs ?? []).map((d: { id: string; attribute_key: string }) => [d.id, d.attribute_key]));
  console.log(
    "ATTRS:",
    JSON.stringify(
      (attrs ?? []).map((a: { attribute_definition_id: string; value_text: string }) => ({
        key: keyById.get(a.attribute_definition_id),
        value_text: a.value_text,
      })),
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

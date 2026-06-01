import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const STAGING_ID = process.argv[2] || "538412ef-c3bc-4bfe-8b57-1b94c4cd943a";
const CATEGORY_ID = "71c407a2-0ee0-455c-b4fb-0c8d930ad6f5";

async function main() {
  const { promoteStagingToDraftProduct } = await import("../src/lib/admin/product-write");
  const { parseImportDraftFromExtracted } = await import("../src/lib/admin/import-draft-mapper");
  const { importDraftToProductWriteInput } = await import("../src/lib/admin/import-draft-promote");
  const { getSupabaseAdmin } = await import("../src/lib/supabase/server");

  const supabase = getSupabaseAdmin() as any;
  const { data: row } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("extracted, product_page_url, image_url")
    .eq("id", STAGING_ID)
    .single();

  const draft = parseImportDraftFromExtracted(
    (row as { extracted: Record<string, unknown> }).extracted,
    (row as { product_page_url: string }).product_page_url
  );
  if (!draft) throw new Error("no draft");

  const input = importDraftToProductWriteInput(
    draft,
    { category_id: CATEGORY_ID },
    { stagingImageUrl: (row as { image_url: string | null }).image_url }
  );

  const created = await promoteStagingToDraftProduct(STAGING_ID, input, null);
  console.log("PROMOTE:", JSON.stringify(created, null, 2));

  if ("productId" in created) {
    const pid = created.productId;
    const { data: prod } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("name, metadata, description")
      .eq("id", pid)
      .single();
    const { data: vars } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("variant_sku, size_code, metadata")
      .eq("catalog_product_id", pid);
    const { data: attrs } = await supabase
      .schema("catalogos")
      .from("product_attributes")
      .select("attribute_definition_id, value_text, value_number")
      .eq("product_id", pid);
    const { data: defs } = await supabase
      .schema("catalogos")
      .from("attribute_definitions")
      .select("id, attribute_key")
      .eq("category_id", CATEGORY_ID)
      .in("attribute_key", ["material", "thickness_mil", "powder", "grade"]);

    console.log("\nPRODUCT:", JSON.stringify(prod, null, 2));
    console.log("\nVARIANTS:", JSON.stringify(vars, null, 2));
    console.log("\nATTRS:", JSON.stringify(attrs, null, 2));
    console.log("\nDEFS:", JSON.stringify(defs, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const PRODUCT_ID = "2a428f39-2752-47ba-886a-6e560b7e8a8f";

function metaStr(meta: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

async function main() {
  const { fetchAdminProductDetail } = await import("../src/lib/admin/product-operations");
  const { updateCatalogProduct } = await import("../src/lib/admin/product-write");

  const before = await fetchAdminProductDetail(PRODUCT_ID);
  if (!before.product) throw new Error("product not found");

  const p = before.product;
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const primary =
    (before.images ?? []).find((im) => im.isPrimary)?.url ?? (before.images ?? [])[0]?.url ?? "";
  const variants = (before.variants ?? [])
    .filter((v) => v.isActive)
    .map((v) => {
      const vm = (v.metadata ?? {}) as Record<string, unknown>;
      const lp = vm.list_price;
      const listPrice = typeof lp === "number" ? String(lp) : typeof lp === "string" ? lp : "";
      return { sizeCode: v.sizeCode ?? "", variantSku: v.variantSku, listPrice };
    });

  const editorBrand = p.brandName ?? metaStr(meta, ["brand_name_hint"]) ?? "";

  const attrs = before.editor?.productAttributes ?? {};
  const ui = {
    brand: editorBrand,
    attributes: attrs,
    importPanel: {
      sourceUrl: metaStr(meta, ["import_source_url"]),
      parser: metaStr(meta, ["import_parser_version"]),
      unitsPerCase: meta.units_per_case,
      powderFree: meta.powder_free,
      examGrade: meta.exam_grade,
    },
    variants,
  };

  console.log("UI_LOAD:", JSON.stringify(ui, null, 2));

  const saveRes = await updateCatalogProduct(PRODUCT_ID, {
    name: p.name,
    brandName: editorBrand,
    categoryId: typeof meta.category_id === "string" ? meta.category_id : "",
    description: p.description ?? "",
    primaryImageUrl: primary,
    status: p.status === "active" ? "active" : "draft",
    quoteOnly: meta.quote_only === true,
    attributes: attrs as Record<string, string | string[]>,
    variants: variants.length ? variants : [{ sizeCode: "M", variantSku: "", listPrice: "" }],
  });
  console.log("SAVE:", saveRes);

  const after = await fetchAdminProductDetail(PRODUCT_ID);
  const m2 = (after.product?.metadata ?? {}) as Record<string, unknown>;
  const keys = [
    "import_source_url",
    "import_parser_version",
    "import_schema_version",
    "import_staging_id",
    "units_per_case",
    "powder_free",
    "exam_grade",
    "color",
    "material",
    "case_pack",
    "mil_thickness",
  ];
  const preserved: Record<string, unknown> = {};
  for (const k of keys) preserved[k] = m2[k];
  console.log("METADATA_AFTER_SAVE:", JSON.stringify(preserved, null, 2));

  const { getSupabaseAdmin } = await import("../src/lib/supabase/server");
  const supabase = getSupabaseAdmin() as any;
  const cat = typeof m2.category_id === "string" ? m2.category_id : "";
  const { data: paRows } = await supabase
    .schema("catalogos")
    .from("product_attributes")
    .select("attribute_definition_id, value_text")
    .eq("product_id", PRODUCT_ID);
  const { data: defs } = await supabase
    .schema("catalogos")
    .from("attribute_definitions")
    .select("id, attribute_key")
    .eq("category_id", cat);
  const keyById = new Map((defs ?? []).map((d: { id: string; attribute_key: string }) => [d.id, d.attribute_key]));
  console.log(
    "ATTRS:",
    JSON.stringify(
      (paRows ?? []).map((a: { attribute_definition_id: string; value_text: string }) => ({
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

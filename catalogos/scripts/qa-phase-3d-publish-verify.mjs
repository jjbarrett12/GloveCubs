/** Publish-path SKU verification after master exists (draft-first to satisfy catalog_v2 guard). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.resolve(__dirname, "../../storefront/.env.local"), "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.+)$", "m"));
  return m ? m[1].trim() : "";
};
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.SUPABASE_SERVICE_ROLE_KEY = key;

const catalogos = createClient(url, key, { db: { schema: "catalogos" }, auth: { persistSession: false } });
const admin = createClient(url, key, { auth: { persistSession: false } });

const IDS = {
  XS: "a4e016e1-b661-470c-bf84-8d91e1907668",
  S: "1d1e6e33-bd7b-409e-b1b3-113cf3381a86",
  M: "c45a385e-8e45-4bb5-a0ee-9829daab0ef0",
  L: "28f500ac-8d3f-4284-b50d-71624fd4961a",
  XL: "9a3b3735-1892-407d-8f2b-bfa3827cc408",
};
const EXPECT = {
  parent: "GLV-GL-N125",
  variants: { XS: "GLV-GL-N125XS", S: "GLV-GL-N125S", M: "GLV-GL-N125M", L: "GLV-GL-N125L", XL: "GLV-GL-N125XL" },
  mfr: { XS: "GL-N125F-XS", S: "GL-N125F-S", M: "GL-N125F-M", L: "GL-N125F-L", XL: "GL-N125F-XL" },
};

async function main() {
  const { approveMatch, publishStagedToLive } = await import("../src/app/actions/review.ts");
  const { upsertSellableForCatalogV2Product } = await import("../src/lib/publish/ensure-catalog-v2-link.ts");

  // cleanup prior failed masters for this QA sku
  const { data: old } = await admin.schema("catalog_v2").from("catalog_products").select("id").eq("internal_sku", EXPECT.parent);
  for (const row of old ?? []) {
    await admin.schema("catalog_v2").from("catalog_variants").delete().eq("catalog_product_id", row.id);
    await admin.schema("catalog_v2").from("catalog_products").delete().eq("id", row.id);
  }

  const { data: product, error: pErr } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .insert({
      product_type_id: "b1111111-1111-4111-8111-111111111111",
      slug: `qa-proworks-gl-n125-${Date.now()}`,
      internal_sku: EXPECT.parent,
      name: "ProWorks Blue-Violet Nitrile Exam Gloves",
      status: "draft",
      metadata: { category_id: "71c407a2-0ee0-455c-b4fb-0c8d930ad6f5", facet_attributes: {} },
    })
    .select("id")
    .single();
  if (pErr || !product) throw new Error(pErr?.message ?? "master insert failed");
  const masterId = product.id;

  await admin.schema("catalog_v2").from("catalog_product_images").insert({
    catalog_product_id: masterId,
    url: "https://example.com/qa-placeholder.png",
    sort_order: 0,
    metadata: { image_provenance: "manual_upload" },
  });
  // Leave master draft until first publish adds size variants (avoids placeholder variant SKU collision).

  const publishResults = [];
  for (const [size, id] of Object.entries(IDS)) {
    const appr = await approveMatch(id, masterId, { skipRevalidate: true });
    if (!appr.success) {
      publishResults.push({ size, pass: false, stage: "approve", error: appr.error });
      continue;
    }
    const pub = await publishStagedToLive(id, { skipRevalidate: true });
    publishResults.push({
      size,
      pass: !!(pub.success && pub.published),
      stage: "publish",
      error: pub.error ?? pub.publishError,
    });
  }

  const { data: master } = await admin.schema("catalog_v2").from("catalog_products").select("internal_sku").eq("id", masterId).single();
  const { data: variants } = await admin
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("variant_sku,metadata")
    .eq("catalog_product_id", masterId);

  const variantChecks = Object.entries(EXPECT.variants).map(([size, sku]) => {
    const v = variants?.find((row) => row.variant_sku === sku);
    return {
      size,
      pass: !!v && v.metadata?.manufacturer_sku === EXPECT.mfr[size] && !String(v.variant_sku).startsWith("GL-N125F"),
      variant_sku: v?.variant_sku,
      manufacturer_sku: v?.metadata?.manufacturer_sku,
    };
  });

  console.log(
    JSON.stringify(
      {
        masterId,
        parent_internal_sku: master?.internal_sku,
        publishResults,
        variantChecks,
        allPass: master?.internal_sku === EXPECT.parent && variantChecks.every((v) => v.pass) && publishResults.every((r) => r.pass),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

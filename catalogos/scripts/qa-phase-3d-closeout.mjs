/**
 * Phase 3D closeout QA — URL import smoke + Hospeco GL-N125 publish path.
 *
 * Must run from catalogos/ so tsconfig path aliases resolve (@glove-sku-intelligence, etc.):
 *   cd catalogos
 *   GLOVECUBS_URL_EXTRACTION_V2=false npx tsx --tsconfig tsconfig.json scripts/qa-phase-3d-closeout.mjs
 *
 * From repo root:
 *   GLOVECUBS_URL_EXTRACTION_V2=false npx tsx --tsconfig catalogos/tsconfig.json catalogos/scripts/qa-phase-3d-closeout.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../storefront/.env.local");
const env = fs.readFileSync(envPath, "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.+)$", "m"));
  return m ? m[1].trim() : "";
};

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
const catalogos = createClient(url, key, { db: { schema: "catalogos" }, auth: { persistSession: false } });
const admin = createClient(url, key, { auth: { persistSession: false } });

const HOSPECO_URL =
  "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl";

const FALLBACK_IDS = {
  XS: "a4e016e1-b661-470c-bf84-8d91e1907668",
  S: "1d1e6e33-bd7b-409e-b1b3-113cf3381a86",
  M: "c45a385e-8e45-4bb5-a0ee-9829daab0ef0",
  L: "28f500ac-8d3f-4284-b50d-71624fd4961a",
  XL: "9a3b3735-1892-407d-8f2b-bfa3827cc408",
};

const EXPECT = {
  parent: "GLV-GL-N125",
  variants: {
    XS: "GLV-GL-N125XS",
    S: "GLV-GL-N125S",
    M: "GLV-GL-N125M",
    L: "GLV-GL-N125L",
    XL: "GLV-GL-N125XL",
  },
  mfr: {
    XS: "GL-N125F-XS",
    S: "GL-N125F-S",
    M: "GL-N125F-M",
    L: "GL-N125F-L",
    XL: "GL-N125F-XL",
  },
};

async function cleanupQaPollution(stagingIds) {
  const { data: old } = await admin.schema("catalog_v2").from("catalog_products").select("id").eq("internal_sku", EXPECT.parent);
  for (const row of old ?? []) {
    await admin.schema("catalog_v2").from("catalog_product_images").delete().eq("catalog_product_id", row.id);
    await admin.schema("catalog_v2").from("catalog_variants").delete().eq("catalog_product_id", row.id);
    await admin.schema("gc_commerce").from("sellable_products").delete().eq("catalog_product_id", row.id);
    await catalogos.from("supplier_offers").delete().eq("product_id", row.id);
    await admin.schema("catalog_v2").from("catalog_products").delete().eq("id", row.id);
  }
  await catalogos
    .from("supplier_products_normalized")
    .update({ master_product_id: null, status: "pending", updated_at: new Date().toISOString() })
    .in("id", stagingIds);
}

async function urlImportSmoke() {
  try {
    const res = await fetch("http://localhost:3010/api/admin/url-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier_name: "Hospeco QA Closeout",
        start_url: HOSPECO_URL,
        allowed_domain: "hospecobrands.com",
        crawl_mode: "single_product",
        max_pages: 1,
      }),
    });
    const data = await res.json();
    return { pass: res.ok && !!data.jobId, detail: data };
  } catch (e) {
    return { pass: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;

  const { applySkuProposalsToNormalizedData } = await import("../src/lib/sku-intelligence/staging-sku-proposals.ts");
  const { createNewMasterProduct, approveMatch, publishStagedToLive } = await import("../src/app/actions/review.ts");
  const { pdpCommerceFromProductMetadata } = await import("../../storefront/src/lib/catalog/store-product-commerce.ts");

  const stagingIds = Object.values(FALLBACK_IDS);
  await cleanupQaPollution(stagingIds);

  const report = [];

  report.push({ step: 1, name: "url_import_post", ...(await urlImportSmoke()) });

  const { data: rows } = await catalogos
    .from("supplier_products_normalized")
    .select("id,inferred_size,normalized_data")
    .in("id", stagingIds);

  const step3 = rows?.length === 5 && rows.every((r) => r.normalized_data?.sku_proposals?.proposed_parent_sku === EXPECT.parent);
  report.push({ step: 3, pass: step3, detail: "sku_proposals on all family rows" });

  for (const id of stagingIds) {
    const row = rows.find((r) => r.id === id);
    const next = applySkuProposalsToNormalizedData(row.normalized_data, { overwrite: false });
    await catalogos.from("supplier_products_normalized").update({ normalized_data: next, updated_at: new Date().toISOString() }).eq("id", id);
  }
  const { data: appliedRows } = await catalogos
    .from("supplier_products_normalized")
    .select("id,normalized_data->sku_proposals")
    .in("id", stagingIds);
  const step6 = appliedRows?.every((r) => {
    const sp = r.sku_proposals;
    return sp?.applied_parent_sku === EXPECT.parent && Object.keys(sp?.applied_variant_skus ?? {}).length === 5;
  });
  report.push({ step: 6, pass: step6, detail: "applied_parent_sku + applied_variant_skus" });

  const masterRes = await createNewMasterProduct(
    FALLBACK_IDS.M,
    {
      sku: EXPECT.parent,
      name: "ProWorks Blue-Violet Nitrile Exam Gloves",
      category_id: "71c407a2-0ee0-455c-b4fb-0c8d930ad6f5",
      product_type_id: "b1111111-1111-4111-8111-111111111111",
      list_price_minor: 8500,
    },
    { publishToLive: false, publishedBy: "qa-phase-3d-closeout", skipRevalidate: true }
  );
  report.push({ step: 7, pass: masterRes.success, detail: masterRes.error ?? masterRes.masterProductId });
  if (!masterRes.success || !masterRes.masterProductId) {
    console.log(JSON.stringify({ report }, null, 2));
    process.exit(1);
  }
  const masterId = masterRes.masterProductId;

  const { data: draftMaster } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("status")
    .eq("id", masterId)
    .single();
  report.push({ step: "7b", pass: draftMaster?.status === "draft", detail: `master status=${draftMaster?.status}` });

  await admin.schema("catalog_v2").from("catalog_product_images").insert({
    catalog_product_id: masterId,
    url: "https://example.com/qa-hospeco-gl-n125.png",
    sort_order: 0,
    metadata: { image_provenance: "supplier_feed" },
  });

  const publishResults = [];
  for (const [size, id] of Object.entries(FALLBACK_IDS)) {
    if (id !== FALLBACK_IDS.M) {
      const appr = await approveMatch(id, masterId, { skipRevalidate: true });
      if (!appr.success) {
        publishResults.push({ size, pass: false, stage: "approve", error: appr.error });
        continue;
      }
    }
    const pub = await publishStagedToLive(id, { publishedBy: "qa-phase-3d-closeout", skipRevalidate: true });
    publishResults.push({ size, pass: !!(pub.success && pub.published), stage: "publish", error: pub.error ?? pub.publishError });
  }
  report.push({ step: 8, pass: publishResults.every((r) => r.pass), detail: publishResults });

  const { data: masters } = await admin.schema("catalog_v2").from("catalog_products").select("id,internal_sku,status,slug,metadata").eq("internal_sku", EXPECT.parent);
  const { data: variants } = await admin.schema("catalog_v2").from("catalog_variants").select("variant_sku,metadata").eq("catalog_product_id", masterId);
  const { data: offers } = await catalogos.from("supplier_offers").select("supplier_sku").eq("product_id", masterId);

  const variantChecks = Object.entries(EXPECT.variants).map(([size, sku]) => {
    const v = variants?.find((row) => row.variant_sku === sku);
    return {
      size,
      pass: !!v && v.metadata?.manufacturer_sku === EXPECT.mfr[size] && !String(v.variant_sku).startsWith("GL-N125F"),
      variant_sku: v?.variant_sku,
      manufacturer_sku: v?.metadata?.manufacturer_sku,
    };
  });

  const cp = masters?.[0]?.metadata?.commerce_packaging;
  const pkg = pdpCommerceFromProductMetadata(masters?.[0]?.metadata, 85);

  report.push({
    step: 9,
    pass: masters?.length === 1 && masters[0].status === "active" && variantChecks.every((v) => v.pass),
    duplicateMasters: masters?.length,
    parent: masters?.[0]?.internal_sku,
    variants: variantChecks,
    supplierSkusOnOffers: offers?.map((o) => o.supplier_sku),
    supplierSkuNotOnVariants: variants?.every((v) => !String(v.variant_sku).startsWith("GL-N125F")),
  });

  report.push({
    step: 11,
    pass: cp?.units_per_case === 2000 && cp?.inners_per_case === 10 && cp?.case_label === "10 boxes × 200 gloves = 2,000 gloves",
    staging_case_label: (await catalogos.from("supplier_products_normalized").select("normalized_data->commerce_packaging").eq("id", FALLBACK_IDS.M).single()).data?.commerce_packaging?.case_label,
    catalog_case_label: cp?.case_label,
  });

  report.push({
    step: 12,
    pass: pkg.caseLabel === "10 boxes × 200 gloves = 2,000 gloves" && pkg.unitsPerCase === 2000,
    storefront_caseLabel: pkg.caseLabel,
    storefront_unitsPerCase: pkg.unitsPerCase,
    slug: masters?.[0]?.slug,
  });

  const allPass = report.every((r) => r.pass === true);
  console.log(JSON.stringify({ allPass, masterId, report }, null, 2));
  if (!allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

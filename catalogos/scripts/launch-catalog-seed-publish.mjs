/**
 * Launch catalog seed/publish — canonical CatalogOS runPublish only.
 *
 * Usage (from catalogos/):
 *   GLOVECUBS_LAUNCH_CATALOG_SEED=1 GLOVECUBS_URL_EXTRACTION_V2=true \
 *     npx tsx --tsconfig tsconfig.json scripts/launch-catalog-seed-publish.mjs
 *
 * Dry run (no writes):
 *   ... scripts/launch-catalog-seed-publish.mjs --dry-run
 *
 * Requires storefront/.env.local Supabase credentials.
 * Does NOT use storefront manual active publish or legacy public.products.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOGOS_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.resolve(CATALOGOS_ROOT, "../storefront/.env.local");

const DISPOSABLE_GLOVES_CATEGORY_ID = "71c407a2-0ee0-455c-b4fb-0c8d930ad6f5";
const LEGACY_GLOVE_PRODUCT_TYPE_ID = "b1111111-1111-4111-8111-111111111111";
const DEFAULT_LIST_PRICE_MINOR = 8500;
const TEST_PRODUCT_ID = "a0c88bf6-b338-4ce4-a433-e6daafbba7e1";
const EXISTING_N105_MASTER_ID = "ac5dedb3-949a-407b-b85c-586c726cfbd5";

/** Real Hospeco disposable glove PDPs — diverse launch mix. Skips already-active families. */
const LAUNCH_URLS = [
  {
    url: "https://www.hospecobrands.com/products/hbg-products/gloves/polyethylene-gloves-20-boxes-of-500-gloves-small",
    label: "polyethylene GL-P500S",
  },
  {
    url: "https://www.hospecobrands.com/products/hbg-products/gloves/proworks-grizzlynite-nitrile-exam-gloves-powder-free-5-5-mil-hos-gl-n105f-xl",
    label: "grizzlynite black nitrile N105",
    existingMasterId: EXISTING_N105_MASTER_ID,
  },
  {
    url: "https://www.hospecobrands.com/products/hbg-products/gloves/glove-nitrile-powder-free-4",
    label: "blue nitrile exam 4mil",
  },
  {
    url: "https://www.hospecobrands.com/products/hbg-products/gloves/vinyl-powdered-glove-clear-10-100-xlg",
    label: "vinyl clear powdered",
  },
  {
    url: "https://www.hospecobrands.com/products/hbg-products/gloves/nitrile-powder-free-exam-glove-black-10-100-xl",
    label: "black nitrile exam",
  },
  {
    url: "https://www.hospecobrands.com/products/hbg-products/gloves/glove-latex-powder-free-2",
    label: "latex powder-free natural",
  },
  {
    url: "https://www.hospecobrands.com/products/hbg-products/gloves/micro-textured-strech-hybrid-3",
    label: "stretch hybrid polyethylene",
  },
  {
    url: "https://www.hospecobrands.com/products/hbg-industries/retail/gloves/the-safety-zone-blue-nitrile-gloves-3-7-mil-powder-free-sz-gnpr-size-1m-xl",
    label: "blue nitrile 3.7mil",
  },
];

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return null;
  const env = fs.readFileSync(ENV_PATH, "utf8");
  const get = (k) => {
    const m = env.match(new RegExp("^" + k + "=(.+)$", "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  return {
    supabaseUrl: get("NEXT_PUBLIC_SUPABASE_URL"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function productNameFromNormalized(nd) {
  return (
    String(nd?.canonical_title ?? nd?.title ?? nd?.product_name ?? nd?.name ?? "").trim() ||
    "Disposable Gloves"
  );
}

function parentSkuFromNormalized(nd) {
  const sp = nd?.sku_proposals ?? {};
  return (
    String(sp.applied_parent_sku ?? sp.proposed_parent_sku ?? nd?.proposed_parent_sku ?? "").trim() ||
    `GLV-LAUNCH-${Date.now().toString(36).slice(-6).toUpperCase()}`
  );
}

async function ensureMasterImage(admin, masterId, imageUrl) {
  const url = String(imageUrl ?? "").trim();
  if (!url || !masterId) return;
  const { data: existing } = await admin
    .schema("catalog_v2")
    .from("catalog_product_images")
    .select("id")
    .eq("catalog_product_id", masterId)
    .limit(1);
  if (existing?.length) return;
  await admin.schema("catalog_v2").from("catalog_product_images").insert({
    catalog_product_id: masterId,
    url,
    sort_order: 0,
    metadata: { image_provenance: "supplier_feed" },
  });
}

async function deactivateTestProduct(admin, dryRun, report) {
  const { data: row } = await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, slug, status")
    .eq("id", TEST_PRODUCT_ID)
    .maybeSingle();
  if (!row || row.status !== "active") {
    report.push({ step: "deactivate_test_product", skipped: true, slug: row?.slug, status: row?.status });
    return;
  }
  if (dryRun) {
    report.push({ step: "deactivate_test_product", dryRun: true, slug: row.slug });
    return;
  }
  await admin
    .schema("catalog_v2")
    .from("catalog_products")
    .update({
      status: "draft",
      metadata: { launch_excluded: true, launch_excluded_reason: "test_product_not_launch_catalog" },
      updated_at: new Date().toISOString(),
    })
    .eq("id", TEST_PRODUCT_ID);
  report.push({ step: "deactivate_test_product", slug: row.slug, newStatus: "draft" });
}

function inferLaunchAttributes(nd) {
  const title = productNameFromNormalized(nd).toLowerCase();
  const material = String(nd?.material ?? nd?.filter_attributes?.material ?? "").toLowerCase();
  let color = String(nd?.color ?? nd?.filter_attributes?.color ?? "").trim();
  if (!color) {
    if (/\bclear\b/.test(title)) color = "clear";
    else if (/\bblack\b/.test(title)) color = "black";
    else if (/\bblue[\s-]?violet\b/.test(title)) color = "blue_violet";
    else if (/\bblue\b/.test(title)) color = "blue";
    else if (/\bnatural\b/.test(title)) color = "natural";
    else if (/\borange\b/.test(title)) color = "orange";
    else if (material.includes("poly")) color = "clear";
    else if (material.includes("vinyl")) color = "clear";
    else if (material.includes("latex")) color = "natural";
    else if (material.includes("nitrile") && /\bblack\b/.test(title)) color = "black";
    else if (material.includes("nitrile")) color = "blue";
  }
  let grade = String(nd?.grade ?? nd?.filter_attributes?.grade ?? "").trim();
  if (!grade) {
    if (/\bexam\b/.test(title)) grade = "medical_exam_grade";
    else if (/\bindustrial\b/.test(title)) grade = "industrial_grade";
    else if (/\bfood\b/.test(title) || material.includes("poly") || material.includes("vinyl")) {
      grade = "food_service_grade";
    } else grade = "industrial_grade";
  }
  const powder = /\bpowder[\s-]?free\b/i.test(title)
    ? "powder_free"
    : /\bpowdered\b/i.test(title)
      ? "powdered"
      : "powder_free";
  return { color, grade, powder };
}

async function applyLaunchPublishPatch(catalogos, admin, normalizedId) {
  const { computeImportAutoPricing } = await import("../src/lib/ingestion/import-pricing.ts");
  const { data: row, error } = await catalogos
    .from("supplier_products_normalized")
    .select("normalized_data, attributes")
    .eq("id", normalizedId)
    .single();
  if (error || !row) throw new Error(`staging row not found: ${normalizedId}`);

  const nd = { ...(row.normalized_data ?? {}) };
  const { data: stagingMeta } = await catalogos
    .from("supplier_products_normalized")
    .select("master_product_id, inferred_size")
    .eq("id", normalizedId)
    .single();

  const sizeCode = inferSizeCode(stagingMeta, nd);
  const attrs = { ...(row.attributes ?? {}), ...(nd.filter_attributes ?? {}) };
  const inferred = inferLaunchAttributes(nd);
  attrs.color = inferred.color;
  attrs.grade = inferred.grade;
  attrs.powder = inferred.powder;
  attrs.material = attrs.material ?? nd.material ?? "nitrile";
  attrs.category = "disposable_gloves";
  attrs.size = sizeCode;
  nd.filter_attributes = { ...(nd.filter_attributes ?? {}), ...attrs };
  nd.name = nd.name ?? nd.canonical_title ?? nd.title ?? nd.product_name;
  nd.canonical_title = nd.canonical_title ?? nd.name;

  let parentSku = "";
  if (stagingMeta?.master_product_id) {
    const { data: master } = await admin
      .schema("catalog_v2")
      .from("catalog_products")
      .select("internal_sku")
      .eq("id", stagingMeta.master_product_id)
      .maybeSingle();
    parentSku = String(master?.internal_sku ?? "").trim();
  }
  if (!parentSku) parentSku = parentSkuFromNormalized(nd);

  let variantSku = `${parentSku}${sizeCode}`;
  if (stagingMeta?.master_product_id) {
    const { data: existingVariant } = await admin
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("variant_sku")
      .eq("catalog_product_id", stagingMeta.master_product_id)
      .eq("size_code", sizeCode)
      .maybeSingle();
    if (existingVariant?.variant_sku) variantSku = String(existingVariant.variant_sku);
  }

  nd.sku_proposals = {
    ...(nd.sku_proposals ?? {}),
    schema_version: 1,
    proposed_parent_sku: parentSku,
    applied_parent_sku: parentSku,
    applied_variant_skus: { [sizeCode]: variantSku },
  };
  nd.supplier_sku = String(nd.manufacturer_sku ?? nd.supplier_sku ?? nd.sku ?? variantSku).trim() || variantSku;

  const cp = { ...(nd.commerce_packaging ?? {}) };
  const unitsPerCase = Number(cp.units_per_case ?? nd.units_per_case ?? 1000) || 1000;
  const unitCost = Number(nd.supplier_unit_cost ?? 0.035);
  const pricing =
    computeImportAutoPricing({
      supplierCost: unitCost,
      categorySlug: "disposable_gloves",
      filterAttributes: attrs,
    }) ?? null;
  if (pricing) nd.import_auto_pricing = pricing;

  const caseCost = roundMoney(pricing?.list_price ? pricing.list_price * unitsPerCase : unitCost * unitsPerCase * 1.15);
  nd.supplier_cost = caseCost;
  nd.normalized_case_cost = caseCost;
  cp.case_price = cp.case_price ?? caseCost;
  cp.units_per_case = cp.units_per_case ?? unitsPerCase;
  nd.commerce_packaging = cp;
  nd.list_price = nd.list_price ?? (pricing?.list_price ?? roundMoney(caseCost / unitsPerCase));
  nd.pricing = {
    ...(nd.pricing ?? {}),
    sell_unit: "case",
    normalized_case_cost: caseCost,
  };

  await catalogos
    .from("supplier_products_normalized")
    .update({
      normalized_data: nd,
      attributes: attrs,
      inferred_size: sizeCode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedId);
}

function normalizeSizeCode(sizeRaw) {
  const s = String(sizeRaw ?? "").trim().toUpperCase();
  if (!s) return "M";
  if (s === "X-SMALL" || s === "XS") return "XS";
  if (s === "SMALL" || s === "S") return "S";
  if (s === "MEDIUM" || s === "M") return "M";
  if (s === "LARGE" || s === "L") return "L";
  if (s === "X-LARGE" || s === "XL") return "XL";
  if (s === "XXL" || s === "2XL") return "2XL";
  if (s === "XXXL" || s === "3XL") return "3XL";
  return s;
}

function inferSizeCode(stagingMeta, nd) {
  if (stagingMeta?.inferred_size) return normalizeSizeCode(stagingMeta.inferred_size);
  const fromNd = nd.size ?? nd.normalized_size_code ?? nd.inferred_size;
  if (fromNd) return normalizeSizeCode(fromNd);
  const title = productNameFromNormalized(nd);
  const titleMatch = title.match(/\b-\s*(XS|S|M|L|XL|2XL|3XL|XXL|XXXL)\s*$/i);
  if (titleMatch) return normalizeSizeCode(titleMatch[1]);
  const url = String(nd.source_url ?? nd.import_source_url ?? "");
  const urlMatch = url.match(/\b(xs|s|m|l|xl|2xl|3xl|xxl|xxxl)\b/i);
  if (urlMatch) return normalizeSizeCode(urlMatch[1]);
  return "M";
}

function roundMoney(n) {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

async function prepareStagingRows(catalogos, admin, normalizedIds) {
  const { applyProductSetupWizardFields } = await import("../src/app/actions/review-setup-wizard.ts");

  for (const id of normalizedIds) {
    await applyProductSetupWizardFields(id, { applyAllSafe: true, skipRevalidate: true });
    await applyLaunchPublishPatch(catalogos, admin, id);
  }
}

async function publishNormalizedRows(ctx, normalizedIds, config, report) {
  const {
    approveMatch,
    createNewMasterProduct,
    publishStagedToLive,
    publishVariantGroup,
  } = await import("../src/app/actions/review.ts");
  const { evaluatePublishReadiness } = await import("../src/lib/review/publish-guards.ts");

  if (normalizedIds.length === 0) {
    throw new Error("No normalized rows to publish");
  }

  const familyKey = config.familyGroupKey;
  if (familyKey && normalizedIds.length > 1) {
    for (const id of normalizedIds) {
      const readiness = await evaluatePublishReadiness(id);
      if (!readiness.canPublish) {
        throw new Error(`${id}: ${readiness.blockers.join("; ")}`);
      }
    }
    const pub = await publishVariantGroup(normalizedIds, { publishedBy: "launch-catalog-seed" });
    if (!pub.success) throw new Error(pub.publishError ?? pub.errors?.join("; ") ?? "variant group publish failed");
    report.push({
      label: config.label,
      path: "runPublishVariantGroup",
      normalizedIds,
      familyId: pub.familyId,
      productIds: pub.productIds,
    });
    return pub.productIds?.[0] ?? null;
  }

  const primaryId = normalizedIds[0];
  await prepareStagingRows(ctx.catalogos, ctx.admin, normalizedIds);
  const { data: primaryRow } = await ctx.catalogos
    .from("supplier_products_normalized")
    .select("normalized_data")
    .eq("id", primaryId)
    .single();
  const nd = primaryRow?.normalized_data ?? {};
  const imageUrl =
    nd.selected_primary_image_url ??
    nd.primary_image_url ??
    nd.image_url ??
    (Array.isArray(nd.image_candidates) ? nd.image_candidates[0]?.url : null);

  let masterId = config.existingMasterId ?? null;

  if (!masterId) {
    const masterRes = await createNewMasterProduct(
      primaryId,
      {
        sku: parentSkuFromNormalized(nd),
        name: productNameFromNormalized(nd),
        category_id: DISPOSABLE_GLOVES_CATEGORY_ID,
        product_type_id: LEGACY_GLOVE_PRODUCT_TYPE_ID,
        list_price_minor: DEFAULT_LIST_PRICE_MINOR,
      },
      { publishToLive: false, publishedBy: "launch-catalog-seed", skipRevalidate: true }
    );
    if (!masterRes.success || !masterRes.masterProductId) {
      throw new Error(masterRes.error ?? "createNewMasterProduct failed");
    }
    masterId = masterRes.masterProductId;
  } else {
    const appr = await approveMatch(primaryId, masterId, { skipRevalidate: true });
    if (!appr.success) throw new Error(appr.error ?? "approveMatch failed");
  }

  await ensureMasterImage(ctx.admin, masterId, imageUrl);

  for (const id of normalizedIds.slice(1)) {
    const appr = await approveMatch(id, masterId, { skipRevalidate: true });
    if (!appr.success) throw new Error(`${id}: ${appr.error ?? "approveMatch failed"}`);
  }

  const publishResults = [];
  for (const id of normalizedIds) {
    const readiness = await evaluatePublishReadiness(id);
    if (!readiness.canPublish) {
      throw new Error(`${id}: ${readiness.blockers.join("; ")}`);
    }
    const pub = await publishStagedToLive(id, { publishedBy: "launch-catalog-seed", skipRevalidate: true });
    publishResults.push({
      id,
      published: !!(pub.success && pub.published),
      error: pub.publishError ?? pub.error,
      slug: pub.readiness ? undefined : undefined,
    });
    if (!pub.success || !pub.published) {
      throw new Error(`${id}: ${pub.publishError ?? pub.error ?? "publish failed"}`);
    }
  }

  const { data: master } = await ctx.admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, slug, status, internal_sku")
    .eq("id", masterId)
    .single();

  report.push({
    label: config.label,
    path: "runPublish",
    url: config.url,
    masterId,
    slug: master?.slug,
    status: master?.status,
    internal_sku: master?.internal_sku,
    publishResults,
  });
  return masterId;
}

async function importAndPublishUrl(ctx, entry, dryRun, report) {
  const { getOrCreateSupplierId } = await import("../src/lib/url-import/supplier.ts");
  const { createUrlImportJob, runUrlImportCrawl } = await import("../src/lib/url-import/crawl-service.ts");
  const { bridgeUrlImportToBatch } = await import("../src/lib/url-import/bridge.ts");

  if (dryRun) {
    report.push({ label: entry.label, dryRun: true, url: entry.url });
    return null;
  }

  const supplierId = await getOrCreateSupplierId("GloveCubs Launch Seed");
  const { jobId } = await createUrlImportJob({
    supplierId,
    supplierName: "GloveCubs Launch Seed",
    startUrl: entry.url,
    allowedDomain: "hospecobrands.com",
    crawlMode: "single_product",
    maxPages: 1,
    createdBy: "launch-catalog-seed",
  });

  const crawl = await runUrlImportCrawl(jobId);
  if ((crawl.productsExtracted ?? 0) < 1) {
    throw new Error(`${entry.label}: crawl extracted 0 products (${entry.url})`);
  }

  const bridge = await bridgeUrlImportToBatch({ jobId });
  if (!bridge.success || !bridge.batchId) {
    throw new Error(`${entry.label}: bridge failed — ${bridge.error ?? "unknown"}`);
  }

  const { data: normRows, error: normErr } = await ctx.catalogos
    .from("supplier_products_normalized")
    .select("id, family_group_key, inferred_size, normalized_data")
    .eq("batch_id", bridge.batchId)
    .order("created_at", { ascending: true });

  if (normErr || !normRows?.length) {
    throw new Error(`${entry.label}: no normalized rows for batch ${bridge.batchId}`);
  }

  const byFamily = new Map();
  for (const row of normRows) {
    const key = String(row.family_group_key ?? row.id);
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push(row);
  }

  const familyGroups = [...byFamily.values()];
  if (familyGroups.length > 1) {
    throw new Error(`${entry.label}: expected one family group, got ${familyGroups.length}`);
  }

  const group = familyGroups[0];
  const normalizedIds = group.map((r) => r.id);
  await prepareStagingRows(ctx.catalogos, ctx.admin, normalizedIds);

  return publishNormalizedRows(
    ctx,
    normalizedIds,
    {
      label: entry.label,
      url: entry.url,
      existingMasterId: entry.existingMasterId,
      familyGroupKey: group.length > 1 ? group[0].family_group_key : null,
    },
    report
  );
}

async function publishDraftMasters(ctx, dryRun, report) {
  const { publishStagedToLive } = await import("../src/app/actions/review.ts");
  const { evaluatePublishReadiness } = await import("../src/lib/review/publish-guards.ts");

  const { data: drafts } = await ctx.admin
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, slug, internal_sku, name")
    .eq("status", "draft")
    .neq("id", TEST_PRODUCT_ID);

  for (const master of drafts ?? []) {
    const { data: liveCheck } = await ctx.admin
      .schema("catalog_v2")
      .from("catalog_products")
      .select("status")
      .eq("id", master.id)
      .single();
    if (liveCheck?.status === "active") {
      report.steps.push({ label: master.internal_sku, skipped: true, reason: "already active" });
      report.published.push({ label: master.internal_sku, masterId: master.id, slug: master.slug, skipped: true });
      continue;
    }

    const { data: staged } = await ctx.catalogos
      .from("supplier_products_normalized")
      .select("id, status")
      .eq("master_product_id", master.id)
      .in("status", ["approved", "merged"])
      .order("updated_at", { ascending: false })
      .limit(20);

    const rows = staged ?? [];
    if (rows.length === 0) {
      report.steps.push({ label: master.internal_sku, skipped: true, reason: "no approved staging" });
      continue;
    }

    if (dryRun) {
      report.steps.push({ label: master.internal_sku, dryRun: true, slug: master.slug, staged: rows.length });
      continue;
    }

    try {
      await prepareStagingRows(
        ctx.catalogos,
        ctx.admin,
        rows.map((r) => r.id)
      );

      const publishResults = [];
      for (const row of rows) {
        const readiness = await evaluatePublishReadiness(row.id);
        if (!readiness.canPublish) {
          throw new Error(`${readiness.blockers.join("; ")}`);
        }
        const pub = await publishStagedToLive(row.id, { publishedBy: "launch-catalog-seed", skipRevalidate: true });
        publishResults.push({
          id: row.id,
          published: !!(pub.success && pub.published),
          error: pub.publishError ?? pub.error,
        });
        if (!pub.success || !pub.published) {
          throw new Error(pub.publishError ?? pub.error ?? "publish failed");
        }
      }

      const { data: live } = await ctx.admin
        .schema("catalog_v2")
        .from("catalog_products")
        .select("slug, status")
        .eq("id", master.id)
        .single();

      report.steps.push({
        label: master.internal_sku,
        path: "runPublish",
        slug: live?.slug,
        status: live?.status,
        publishResults,
      });
      report.published.push({ label: master.internal_sku, masterId: master.id, slug: live?.slug });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      report.errors.push({ label: master.internal_sku, slug: master.slug, error: msg });
      report.steps.push({ label: master.internal_sku, failed: true, error: msg });
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const publishDraftsOnly = process.argv.includes("--publish-drafts-only");
  const seedFlag = process.env.GLOVECUBS_LAUNCH_CATALOG_SEED?.trim();
  if (!dryRun && seedFlag !== "1" && seedFlag?.toLowerCase() !== "true") {
    console.error("[launch-catalog-seed] Set GLOVECUBS_LAUNCH_CATALOG_SEED=1 to run (or use --dry-run).");
    process.exit(2);
  }

  process.env.GLOVECUBS_URL_EXTRACTION_V2 = process.env.GLOVECUBS_URL_EXTRACTION_V2 ?? "true";

  const env = loadEnv();
  if (!env?.supabaseUrl || !env?.serviceKey) {
    console.error("[launch-catalog-seed] Missing Supabase creds in storefront/.env.local");
    process.exit(2);
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = env.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey;

  const catalogos = createClient(env.supabaseUrl, env.serviceKey, {
    db: { schema: "catalogos" },
    auth: { persistSession: false },
  });
  const admin = createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false },
  });

  const report = {
    dryRun,
    startedAt: new Date().toISOString(),
    steps: [],
    published: [],
    errors: [],
  };

  const ctx = { catalogos, admin };

  try {
    if (publishDraftsOnly) {
      await publishDraftMasters(ctx, dryRun, report);
    } else {
      await deactivateTestProduct(admin, dryRun, report.steps);

      for (const entry of LAUNCH_URLS) {
        try {
          const masterId = await importAndPublishUrl(ctx, entry, dryRun, report.steps);
          if (masterId) report.published.push({ label: entry.label, masterId, url: entry.url });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          report.errors.push({ label: entry.label, url: entry.url, error: msg });
          report.steps.push({ label: entry.label, failed: true, error: msg });
        }
      }
    }
  } catch (e) {
    report.errors.push({ fatal: e instanceof Error ? e.message : String(e) });
  }

  report.finishedAt = new Date().toISOString();
  report.success = report.errors.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.success ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

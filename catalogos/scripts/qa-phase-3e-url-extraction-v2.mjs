/**
 * Phase 3E.A closeout QA — Product URL Extraction V2 url_import_products payload shape.
 *
 * Run from catalogos/ (required for tsconfig path aliases):
 *
 * Fixture-only (no DB, no dev server):
 *   npx tsx --tsconfig tsconfig.json scripts/qa-phase-3e-url-extraction-v2.mjs --fixture
 *
 * Live smoke via admin HTTP (catalogos dev on :3010 must have GLOVECUBS_URL_EXTRACTION_V2=true):
 *   GLOVECUBS_URL_EXTRACTION_V2=true npx tsx --tsconfig tsconfig.json scripts/qa-phase-3e-url-extraction-v2.mjs
 *
 * Live smoke in-process (sets V2 flag locally; needs storefront/.env.local Supabase creds):
 *   GLOVECUBS_URL_EXTRACTION_V2=true PHASE_3E_DIRECT_CRAWL=true npx tsx --tsconfig tsconfig.json scripts/qa-phase-3e-url-extraction-v2.mjs
 *
 * Env:
 *   PHASE_3E_TEST_URL — product URL (defaults to Hospeco GL-N125 family page)
 *   PHASE_3E_API_BASE — default http://localhost:3010
 *   PHASE_3E_DIRECT_CRAWL=true — bypass HTTP; run crawl-service in this process
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOGOS_ROOT = path.resolve(__dirname, "..");

const DEFAULT_TEST_URL =
  "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves-powder-free-3-mil-hos-gl-n125f-l-gl-n125fl";

const HOSPECO_FIXTURE = path.resolve(
  CATALOGOS_ROOT,
  "../lib/commerce-packaging/fixtures/hospeco-proworks-nitrile.html"
);

const INTERNAL_SKU_KEYS = [
  "internal_sku",
  "variant_sku",
  "catalog_sku",
  "glovecubs_sku",
  "proposed_glovecubs_sku",
];

const GLV_RE = /\bGLV[-_]/i;

const args = process.argv.slice(2);
const fixtureOnly = args.includes("--fixture");
const directCrawl = args.includes("--direct-crawl") || process.env.PHASE_3E_DIRECT_CRAWL === "true";

function loadEnv() {
  const envPath = path.resolve(CATALOGOS_ROOT, "../storefront/.env.local");
  if (!fs.existsSync(envPath)) return null;
  const env = fs.readFileSync(envPath, "utf8");
  const get = (k) => {
    const m = env.match(new RegExp("^" + k + "=(.+)$", "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  return {
    supabaseUrl: get("NEXT_PUBLIC_SUPABASE_URL"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function assertV2PayloadShape(rows, context) {
  const checks = [];
  const fail = (name, detail) => checks.push({ name, pass: false, detail });
  const ok = (name, detail) => checks.push({ name, pass: true, detail });

  if (!rows?.length) {
    fail("row_count", "expected at least one url_import_products row");
    return { pass: false, checks, rowCount: 0, fullV2OnFirstOnly: false };
  }
  ok("row_count", `${rows.length} row(s)`);

  const withFullV2 = rows.filter((r) => r.raw_payload?.extraction_v2);
  if (withFullV2.length !== 1) {
    fail("full_v2_once", `expected exactly 1 row with raw_payload.extraction_v2, got ${withFullV2.length}`);
  } else {
    ok("full_v2_once", "full extraction_v2 on one row only");
  }

  const firstFull = withFullV2[0]?.raw_payload?.extraction_v2;
  if (firstFull) {
    if (firstFull.version !== "product-url-extraction-v2") {
      fail("v2_version", `got ${firstFull.version}`);
    } else ok("v2_version", firstFull.version);

    if (firstFull.schemaVersion !== 1) {
      fail("v2_schema", `got ${firstFull.schemaVersion}`);
    } else ok("v2_schema", "1");

    const title =
      firstFull.identity?.normalizedTitle?.value ??
      firstFull.identity?.sourceTitle?.value;
    if (!title) fail("identity_title", "missing normalized/source title");
    else ok("identity_title", title);

    const overall = firstFull.confidence?.overall;
    if (typeof overall !== "number" || overall < 0 || overall > 1) {
      fail("confidence_overall", `expected 0–1 number, got ${overall}`);
    } else ok("confidence_overall", overall);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prefix = `row[${i}]`;

    if (i > 0 && row.raw_payload?.extraction_v2) {
      fail(`${prefix}_no_dup_full_v2`, "sibling row must not include raw_payload.extraction_v2");
    }

    if (row.extraction_method !== "deterministic") {
      fail(`${prefix}_extraction_method`, `expected deterministic, got ${row.extraction_method}`);
    } else if (i === 0) ok("extraction_method", "deterministic");

    const norm = row.normalized_payload ?? {};
    if (!norm._extraction_v2) {
      fail(`${prefix}_summary`, "missing normalized_payload._extraction_v2");
    } else {
      const s = norm._extraction_v2;
      if (s.version !== "product-url-extraction-v2") {
        fail(`${prefix}_summary_version`, s.version);
      }
      if (norm.extraction_v2) {
        fail(`${prefix}_no_full_in_norm`, "normalized_payload must not contain extraction_v2");
      }
      if (s.identity) {
        fail(`${prefix}_summary_compact`, "_extraction_v2 must not embed full identity block");
      }
      if (Array.isArray(s.images?.candidates) || Array.isArray(s.candidates)) {
        fail(`${prefix}_summary_compact`, "_extraction_v2 must not embed image candidate arrays");
      }
      if (s.jsonLdProduct) {
        fail(`${prefix}_summary_compact`, "_extraction_v2 must not embed jsonLdProduct");
      }
      if (i === 0) ok("_extraction_v2_summary", "compact summary on all rows");
    }

    for (const key of INTERNAL_SKU_KEYS) {
      if (norm[key] != null && norm[key] !== "") {
        fail(`${prefix}_no_internal_${key}`, String(norm[key]));
      }
    }
    if (norm.sku && GLV_RE.test(String(norm.sku))) {
      fail(`${prefix}_no_glv_sku`, String(norm.sku));
    }

    const mfr = norm.manufacturer_sku ?? norm.manufacturer_part_number;
    if (mfr && GLV_RE.test(String(mfr))) {
      fail(`${prefix}_mfr_not_glv`, String(mfr));
    } else if (mfr) ok(`${prefix}_manufacturer_sku`, String(mfr));

    const supplier = norm.supplier_sku;
    if (supplier && GLV_RE.test(String(supplier))) {
      fail(`${prefix}_supplier_not_glv`, String(supplier));
    }
  }

  const anyPackaging = rows.some((r) => r.normalized_payload?.commerce_packaging);
  if (anyPackaging) ok("commerce_packaging", "present on at least one row");
  else checks.push({ name: "commerce_packaging", pass: null, detail: "not present (fixture may lack packaging evidence)" });

  const pass = checks.every((c) => c.pass !== false);
  return {
    pass,
    checks,
    rowCount: rows.length,
    fullV2OnFirstOnly: withFullV2.length === 1 && rows.every((r, i) => (i === 0 ? !!r.raw_payload?.extraction_v2 : !r.raw_payload?.extraction_v2)),
  };
}

function toInsertShape(inserts) {
  return inserts.map((ins) => ({
    raw_payload: ins.raw_payload,
    normalized_payload: ins.normalized_payload,
    extraction_method: ins.extraction_method,
    confidence: ins.confidence,
    ai_used: ins.ai_used,
  }));
}

async function runFixtureMode() {
  if (!fs.existsSync(HOSPECO_FIXTURE)) {
    throw new Error(`Hospeco fixture missing: ${HOSPECO_FIXTURE}`);
  }
  const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
  const { runUrlExtractionV2 } = await import("../src/lib/product-extraction/url-extraction-v2.ts");
  const { buildUrlImportProductInsertsFromExtractionV2 } = await import("../src/lib/url-import/crawl-v2-wire.ts");

  const extraction = await runUrlExtractionV2({
    url: process.env.PHASE_3E_TEST_URL ?? "https://www.hospecobrands.com/products/proworks-blue-violet-nitrile-exam-gloves",
    html,
  });
  const { inserts } = buildUrlImportProductInsertsFromExtractionV2({
    extraction,
    legacyRawPayload: {
      extraction_source: "product-url-extraction-v2",
      legacy_openclaw_available: false,
    },
  });

  const result = assertV2PayloadShape(toInsertShape(inserts), "fixture");
  return { mode: "fixture", ...result };
}

async function fetchProductsForJob(catalogos, jobId) {
  const { data, error } = await catalogos
    .from("url_import_products")
    .select("id, source_url, raw_payload, normalized_payload, extraction_method, confidence, ai_used")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function runHttpSmoke(env) {
  const testUrl = process.env.PHASE_3E_TEST_URL ?? DEFAULT_TEST_URL;
  const apiBase = process.env.PHASE_3E_API_BASE ?? "http://localhost:3010";

  const res = await fetch(`${apiBase}/api/admin/url-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supplier_name: "Phase 3E V2 QA",
      start_url: testUrl,
      allowed_domain: "hospecobrands.com",
      crawl_mode: "single_product",
      max_pages: 1,
      created_by: "qa-phase-3e-url-extraction-v2",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.jobId) {
    throw new Error(
      `HTTP url-import failed (${res.status}): ${data.error ?? JSON.stringify(data)}. ` +
        "Ensure catalogos dev is running on :3010 with GLOVECUBS_URL_EXTRACTION_V2=true, or use PHASE_3E_DIRECT_CRAWL=true."
    );
  }

  const catalogos = createClient(env.supabaseUrl, env.serviceKey, {
    db: { schema: "catalogos" },
    auth: { persistSession: false },
  });
  const products = await fetchProductsForJob(catalogos, data.jobId);
  const result = assertV2PayloadShape(products, "live-http");
  return {
    mode: "live-http",
    jobId: data.jobId,
    crawl: {
      productsExtracted: data.productsExtracted,
      warnings: data.warnings,
      errors: data.errors,
    },
    ...result,
  };
}

async function runDirectCrawlSmoke(env) {
  process.env.GLOVECUBS_URL_EXTRACTION_V2 = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey;

  const testUrl = process.env.PHASE_3E_TEST_URL ?? DEFAULT_TEST_URL;
  const { getOrCreateSupplierId } = await import("../src/lib/url-import/supplier.ts");
  const { createUrlImportJob, runUrlImportCrawl } = await import("../src/lib/url-import/crawl-service.ts");

  const supplierId = await getOrCreateSupplierId("Phase 3E V2 QA Direct");
  const { jobId } = await createUrlImportJob({
    supplierId,
    supplierName: "Phase 3E V2 QA Direct",
    startUrl: testUrl,
    allowedDomain: "hospecobrands.com",
    crawlMode: "single_product",
    maxPages: 1,
    createdBy: "qa-phase-3e-url-extraction-v2",
  });
  const crawl = await runUrlImportCrawl(jobId);

  const catalogos = createClient(env.supabaseUrl, env.serviceKey, {
    db: { schema: "catalogos" },
    auth: { persistSession: false },
  });
  const products = await fetchProductsForJob(catalogos, jobId);
  const result = assertV2PayloadShape(products, "live-direct");
  return { mode: "live-direct", jobId, crawl, ...result };
}

async function main() {
  if (process.env.GLOVECUBS_URL_EXTRACTION_V2 !== "true" && !fixtureOnly) {
    console.error("Set GLOVECUBS_URL_EXTRACTION_V2=true for live V2 smoke (fixture mode: --fixture).");
    process.exit(1);
  }

  let report;
  if (fixtureOnly) {
    report = await runFixtureMode();
  } else {
    const env = loadEnv();
    if (!env?.supabaseUrl || !env?.serviceKey) {
      console.error("Missing Supabase creds in storefront/.env.local — cannot run live smoke.");
      console.error("Use --fixture for local deterministic coverage.");
      process.exit(1);
    }
    report = directCrawl ? await runDirectCrawlSmoke(env) : await runHttpSmoke(env);
  }

  const summary = {
    phase: "3E.A",
    allPass: report.pass,
    mode: report.mode,
    rowCount: report.rowCount,
    fullV2OnFirstOnly: report.fullV2OnFirstOnly,
    jobId: report.jobId ?? null,
    checks: report.checks,
    crawl: report.crawl ?? null,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

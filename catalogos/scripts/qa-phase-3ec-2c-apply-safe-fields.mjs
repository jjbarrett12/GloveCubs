/**
 * Phase 3E.C.2c live QA — Product Setup Wizard Apply Safe Fields
 *
 * Run from catalogos/:
 *   GLOVECUBS_URL_EXTRACTION_V2=true npx tsx --tsconfig tsconfig.json scripts/qa-phase-3ec-2c-apply-safe-fields.mjs
 *
 * Uses Hospeco polyethylene fixture → url_import → bridge → staged row → apply actions.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOGOS_ROOT = path.resolve(__dirname, "..");

const HOSPECO_FIXTURE = path.join(
  CATALOGOS_ROOT,
  "src/lib/product-extraction/fixtures/hospeco-polyethylene-gloves-small.html"
);
const HOSPECO_URL =
  "https://www.hospecobrands.com/products/hbg-products/gloves/polyethylene-gloves-20-boxes-of-500-gloves-small";

const GLV_RE = /\bGLV[-_]/i;
const WIZARD_SECTIONS = [
  "identity",
  "variants",
  "images",
  "commercePackaging",
  "attributes",
  "certifications",
  "sku",
  "pricing",
  "publishReadiness",
];

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

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
}

async function main() {
  if (process.env.GLOVECUBS_URL_EXTRACTION_V2 !== "true") {
    console.error("Set GLOVECUBS_URL_EXTRACTION_V2=true");
    process.exit(1);
  }

  const env = loadEnv();
  if (!env?.supabaseUrl || !env?.serviceKey) {
    console.error("Missing Supabase creds in storefront/.env.local");
    process.exit(1);
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = env.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey;

  const catalogos = createClient(env.supabaseUrl, env.serviceKey, {
    db: { schema: "catalogos" },
    auth: { persistSession: false },
  });

  const report = {
    phase: "3E.C.2c",
    url: HOSPECO_URL,
    v2Enabled: true,
    fixtureUsed: true,
    jobId: null,
    batchId: null,
    normalizedId: null,
    checks: [],
    bugs: [],
  };

  const check = (name, pass, detail) => report.checks.push({ name, pass, detail });

  if (!fs.existsSync(HOSPECO_FIXTURE)) {
    check("fixture_exists", false, HOSPECO_FIXTURE);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const html = fs.readFileSync(HOSPECO_FIXTURE, "utf8");
  const { runUrlExtractionV2 } = await import("../src/lib/product-extraction/url-extraction-v2.ts");
  const { buildUrlImportProductInsertsFromExtractionV2 } = await import("../src/lib/url-import/crawl-v2-wire.ts");
  const { getOrCreateSupplierId } = await import("../src/lib/url-import/supplier.ts");
  const { createUrlImportJob } = await import("../src/lib/url-import/crawl-service.ts");
  const { bridgeUrlImportToBatch } = await import("../src/lib/url-import/bridge.ts");
  const { buildProductSetupWizardReadiness, resolveWizardContractSummary } = await import(
    "../src/lib/product-extraction/product-setup-wizard-readiness.ts"
  );
  const {
    buildProductSetupApplyCandidates,
    isHighRiskComplianceField,
  } = await import("../src/lib/product-extraction/product-setup-apply-candidates.ts");
  const { applyProductSetupWizardFields } = await import("../src/app/actions/review-setup-wizard.ts");

  const extraction = await runUrlExtractionV2({ url: HOSPECO_URL, html });
  check("extraction_material", extraction.attributes.material?.value === "polyethylene", extraction.attributes.material?.value);
  check("extraction_thickness", extraction.attributes.thicknessMil?.value === 0.5, extraction.attributes.thicknessMil?.value);
  check("extraction_units_per_case", extraction.commercePackaging.unitsPerCase?.value === 10000, extraction.commercePackaging.unitsPerCase?.value);
  check("extraction_mfr_sku", (extraction.identity.manufacturerSkuCandidates?.value ?? []).includes("GL-P500S"), "GL-P500S");

  const { inserts } = buildUrlImportProductInsertsFromExtractionV2({
    extraction,
    legacyRawPayload: { extraction_source: "product-url-extraction-v2", qa: "phase-3ec-2c" },
  });
  check("insert_rows", inserts.length >= 1, `${inserts.length} row(s)`);

  const supplierId = await getOrCreateSupplierId("Phase 3E.C.2c QA");
  const { jobId } = await createUrlImportJob({
    supplierId,
    supplierName: "Phase 3E.C.2c QA",
    startUrl: HOSPECO_URL,
    allowedDomain: "hospecobrands.com",
    crawlMode: "single_product",
    maxPages: 1,
    createdBy: "qa-phase-3ec-2c",
  });
  report.jobId = jobId;

  const { data: pageRow, error: pageErr } = await catalogos
    .from("url_import_pages")
    .insert({
      job_id: jobId,
      url: HOSPECO_URL,
      page_type: "product",
      status: "crawled",
      raw_html_length: html.length,
      discovered_at: new Date().toISOString(),
      crawled_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (pageErr || !pageRow?.id) throw new Error(`Page insert: ${pageErr?.message ?? "no id"}`);
  const pageId = pageRow.id;

  for (const ins of inserts) {
    const { error } = await catalogos.from("url_import_products").insert({
      job_id: jobId,
      page_id: pageId,
      source_url: HOSPECO_URL,
      raw_payload: ins.raw_payload,
      normalized_payload: ins.normalized_payload,
      extraction_method: ins.extraction_method,
      confidence: ins.confidence,
      ai_used: ins.ai_used,
    });
    if (error) throw new Error(`Product insert: ${error.message}`);
  }

  const bridge = await bridgeUrlImportToBatch({ jobId });
  check("bridge_success", bridge.success, bridge.error ?? bridge.batchId);
  report.batchId = bridge.batchId ?? null;
  if (!bridge.success || !bridge.batchId) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const { data: normRows, error: normErr } = await catalogos
    .from("supplier_products_normalized")
    .select("id, normalized_data, attributes, master_product_id, raw_id")
    .eq("batch_id", bridge.batchId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (normErr || !normRows?.length) {
    check("staged_row", false, normErr?.message ?? "no normalized row");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const row = normRows[0];
  report.normalizedId = row.id;
  let nd = row.normalized_data ?? {};
  const masterBefore = row.master_product_id;
  const skuProposalsBefore = JSON.stringify(nd.sku_proposals ?? null);

  let rawPayload = {};
  if (row.raw_id) {
    const { data: rawRow } = await catalogos
      .from("supplier_products_raw")
      .select("raw_payload")
      .eq("id", row.raw_id)
      .maybeSingle();
    rawPayload = rawRow?.raw_payload ?? {};
  }

  const contractSummary = resolveWizardContractSummary(nd, rawPayload);
  check("contract_summary", !!contractSummary, contractSummary ? "present" : "missing");
  check("_extraction_v2", !!nd._extraction_v2, nd._extraction_v2 ? "present" : "missing");

  const readiness = contractSummary
    ? buildProductSetupWizardReadiness({ contractSummary, normalizedData: nd })
    : null;
  check("wizard_readiness", !!readiness, readiness?.overallStatus ?? "null");

  if (readiness) {
    const sectionKeys = WIZARD_SECTIONS.map((k) => readiness.sections[k]?.key ?? k);
    const allSections = WIZARD_SECTIONS.every((k) => readiness.sections[k]?.fields?.length > 0);
    check("wizard_9_sections", allSections, sectionKeys.join(", "));
    const hasEvidence = readiness.sections.identity.fields.some((f) => f.evidenceText || f.confidence != null);
    check("wizard_evidence_visible", hasEvidence, "identity fields have confidence/evidence");
    const imageSummary = readiness.sections.images.fields.find((f) => f.key === "candidateRoles");
    check("wizard_image_summary", !!imageSummary && imageSummary.displayValue !== "—", imageSummary?.displayValue ?? "—");
  }

  const candidates = contractSummary
    ? buildProductSetupApplyCandidates(readiness, contractSummary, nd)
    : [];
  const blockedCompliance = ["foodSafe", "examGrade", "medicalGrade", "sterile"].every((k) => {
    const c = candidates.find((x) => x.fieldKey === k);
    return !c || c.applyStatus === "blocked" || c.applyStatus === "needs_review";
  });
  check("blocked_compliance_fields", blockedCompliance, "foodSafe/examGrade/medicalGrade/sterile not safe_to_apply");

  const glvMfrBlocked = candidates.find((c) => c.fieldKey === "manufacturerSku" && c.extractedValue && GLV_RE.test(c.extractedValue));
  check("glv_mfr_not_safe", !candidates.some((c) => c.fieldKey === "manufacturerSku" && c.applyStatus === "safe_to_apply" && GLV_RE.test(c.extractedValue ?? "")), glvMfrBlocked?.blockReason ?? "non-GLV or absent");

  // Clear brand/title for field-level apply test
  const snapshotBeforeApply = JSON.parse(JSON.stringify(nd));
  nd = {
    ...nd,
    brand: undefined,
    canonical_title: undefined,
    name: undefined,
    title: undefined,
    product_name: undefined,
  };
  delete nd.product_setup_wizard_applied;
  await catalogos
    .from("supplier_products_normalized")
    .update({ normalized_data: nd, updated_at: new Date().toISOString() })
    .eq("id", row.id);

  const fieldApply = await applyProductSetupWizardFields(row.id, { fieldKeys: ["brand"], skipRevalidate: true });
  check("field_apply_brand", fieldApply.appliedFields.includes("brand"), JSON.stringify(fieldApply));

  const { data: afterBrand } = await catalogos
    .from("supplier_products_normalized")
    .select("normalized_data")
    .eq("id", row.id)
    .single();
  nd = afterBrand?.normalized_data ?? {};
  check("brand_written", typeof nd.brand === "string" && nd.brand.length > 0, String(nd.brand));
  check("brand_only_change", nd.manufacturer_sku === snapshotBeforeApply.manufacturer_sku, "manufacturer_sku unchanged");

  const attrApply = await applyProductSetupWizardFields(row.id, {
    fieldKeys: ["material", "thicknessMil", "powderFree", "latexFree"],
    skipRevalidate: true,
  });
  check("attribute_apply", attrApply.appliedFields.length > 0 || attrApply.skippedFields.some((s) => s.reason === "Already applied"), JSON.stringify(attrApply));

  const { data: afterAttr } = await catalogos
    .from("supplier_products_normalized")
    .select("normalized_data, attributes")
    .eq("id", row.id)
    .single();
  nd = afterAttr?.normalized_data ?? {};
  const fa = nd.filter_attributes ?? afterAttr?.attributes ?? {};
  check("material_canonical", fa.material === "polyethylene_pe", String(fa.material));
  check("thickness_canonical", fa.thickness_mil === "0.5", String(fa.thickness_mil));

  const cpBefore = JSON.stringify(nd.commerce_packaging ?? null);
  const commerceApply = await applyProductSetupWizardFields(row.id, { sectionKey: "commercePackaging", skipRevalidate: true });
  check("commerce_section_apply", commerceApply.appliedFields.length > 0 || commerceApply.skippedFields.length > 0, JSON.stringify(commerceApply));

  const { data: afterCommerce } = await catalogos
    .from("supplier_products_normalized")
    .select("normalized_data")
    .eq("id", row.id)
    .single();
  nd = afterCommerce?.normalized_data ?? {};
  const cp = nd.commerce_packaging;
  check("commerce_units_per_case", cp?.units_per_case === 10000, String(cp?.units_per_case));
  check("commerce_schema_unchanged", cp?.schema_version === "commerce_packaging_v1", cp?.schema_version ?? "missing");

  const imageApply = await applyProductSetupWizardFields(row.id, { fieldKeys: ["selectedPrimary"], skipRevalidate: true });
  check("image_apply_attempt", imageApply.appliedFields.includes("selectedPrimary") || imageApply.skippedFields.length > 0, JSON.stringify(imageApply));

  const identitySection = await applyProductSetupWizardFields(row.id, { sectionKey: "identity", skipRevalidate: true });
  check("section_identity_apply", identitySection.appliedFields.length >= 0, JSON.stringify(identitySection));

  const globalApply = await applyProductSetupWizardFields(row.id, { applyAllSafe: true, skipRevalidate: true });
  check("global_apply", globalApply.appliedFields.length >= 0, JSON.stringify({ applied: globalApply.appliedFields, skipped: globalApply.skippedFields.length }));

  const blockedApply = await applyProductSetupWizardFields(row.id, { fieldKeys: ["foodSafe", "examGrade"], skipRevalidate: true });
  check(
    "server_blocks_compliance",
    !blockedApply.appliedFields.includes("foodSafe") && !blockedApply.appliedFields.includes("examGrade"),
    JSON.stringify(blockedApply)
  );

  const idempotent = await applyProductSetupWizardFields(row.id, { applyAllSafe: true, skipRevalidate: true });
  check(
    "idempotency",
    idempotent.appliedFields.length === 0 || idempotent.skippedFields.every((s) => s.reason === "Already applied" || s.reason.includes("Not safe")),
    JSON.stringify(idempotent)
  );

  const { data: finalRow } = await catalogos
    .from("supplier_products_normalized")
    .select("normalized_data, master_product_id")
    .eq("id", row.id)
    .single();
  nd = finalRow?.normalized_data ?? {};
  const appliedMeta = nd.product_setup_wizard_applied;
  check("audit_fieldKeys", Array.isArray(appliedMeta?.fieldKeys) && appliedMeta.fieldKeys.length > 0, JSON.stringify(appliedMeta?.fieldKeys));
  check("audit_appliedAt", !!appliedMeta?.appliedAt, appliedMeta?.appliedAt ?? "missing");
  check("contract_preserved", !!nd.product_setup_contract_summary, "present");
  check("extraction_v2_preserved", !!nd._extraction_v2, "present");
  check("mfr_not_glv", !GLV_RE.test(String(nd.manufacturer_sku ?? "")), String(nd.manufacturer_sku));
  check("no_canonical_created", finalRow?.master_product_id === masterBefore, String(finalRow?.master_product_id));
  check("sku_proposals_unchanged", JSON.stringify(nd.sku_proposals ?? null) === skuProposalsBefore, "unchanged by apply");

  const summary = {
    ...report,
    wizardRendered: report.checks.find((c) => c.name === "wizard_readiness")?.pass ?? false,
    fieldApplyPassed: report.checks.find((c) => c.name === "field_apply_brand")?.pass ?? false,
    sectionApplyPassed: report.checks.find((c) => c.name === "section_identity_apply")?.pass ?? false,
    globalApplyPassed: report.checks.find((c) => c.name === "global_apply")?.pass ?? false,
    blockedFieldsPassed: report.checks.find((c) => c.name === "server_blocks_compliance")?.pass ?? false,
    idempotencyPassed: report.checks.find((c) => c.name === "idempotency")?.pass ?? false,
    publishSkuCommerceUnchanged:
      (report.checks.find((c) => c.name === "no_canonical_created")?.pass ?? false) &&
      (report.checks.find((c) => c.name === "sku_proposals_unchanged")?.pass ?? false) &&
      (report.checks.find((c) => c.name === "commerce_schema_unchanged")?.pass ?? false),
    allPass: report.checks.every((c) => c.pass),
    liveQaApproved: report.checks.every((c) => c.pass),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

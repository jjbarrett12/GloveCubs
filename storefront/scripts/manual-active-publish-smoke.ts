/**
 * Operator-assisted manual active publish smoke (local/staging Supabase).
 * Usage: npx tsx scripts/manual-active-publish-smoke.ts [--keep-product]
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const KEEP = process.argv.includes("--keep-product");
const TEST_SUPPLIER_OFFER = process.argv.includes("--test-supplier-offer");
const CLEANUP_SLUG = process.argv.find((a) => a.startsWith("--cleanup-slug="))?.split("=")[1];
const CATEGORY_ID = "71c407a2-0ee0-455c-b4fb-0c8d930ad6f5";
const SMOKE_SKU = `SMK-${randomBytes(3).toString("hex").toUpperCase()}`;

function redactUuid(id: string): string {
  const t = id.trim();
  if (t.length < 12) return "***";
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

type SmokeReport = {
  env: Record<string, unknown>;
  supplierValidation: Record<string, unknown>;
  positiveSmoke: Record<string, unknown>;
  negativeSmoke: Record<string, unknown>;
  storefrontHttp: Record<string, unknown>;
  cleanup?: string;
  blocked?: string;
};

async function main() {
  const report: SmokeReport = {
    env: {},
    supplierValidation: {},
    positiveSmoke: {},
    negativeSmoke: {},
    storefrontHttp: {},
  };

  const { getSupabaseAdmin } = await import("../src/lib/supabase/server");

  if (CLEANUP_SLUG) {
    const { deleteCatalogProduct } = await import("../src/lib/admin/product-write");
    const supabase = getSupabaseAdmin() as any;
    const { data } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id")
      .eq("slug", CLEANUP_SLUG)
      .maybeSingle();
    if (!data?.id) {
      console.log(JSON.stringify({ cleanup: "not_found", slug: CLEANUP_SLUG }));
      return;
    }
    const result = await deleteCatalogProduct(data.id);
    console.log(JSON.stringify({ cleanup: "deleted", slug: CLEANUP_SLUG, result }));
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  report.env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID: Boolean(process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID?.trim()),
  };

  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(JSON.stringify({ ...report, blocked: "missing_supabase_env" }, null, 2));
    process.exit(2);
  }

  const { insertCatalogProduct, updateCatalogProduct } = await import("../src/lib/admin/product-write");
  const { evaluateActivePublishReadiness } = await import("../src/lib/admin/product-write-active-readiness");
  const { shouldRunManualPostActiveSideEffects } = await import("../src/lib/admin/product-write-manual-post-active");
  const { clipboardUrlImportActiveStatusError } = await import("../src/lib/admin/clipboard-promote-guards");
  const { normalizeCommercePackaging } = await import("@commerce-packaging/labels");

  const supabase = getSupabaseAdmin() as any;

  const supplierEnv = process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID?.trim() || null;
  const { data: suppliers } = await supabase
    .schema("catalogos")
    .from("suppliers")
    .select("id, name, is_active")
    .order("name")
    .limit(20);

  let effectiveSupplierId = supplierEnv;
  if (!effectiveSupplierId && TEST_SUPPLIER_OFFER) {
    const pick = (suppliers ?? []).find((s: { is_active: boolean }) => s.is_active);
    if (pick) {
      effectiveSupplierId = pick.id;
      process.env.GLOVECUBS_MANUAL_PUBLISH_SUPPLIER_ID = pick.id;
      report.supplierValidation = {
        ...(report.supplierValidation as object),
        smokeOverrideSupplier: redactUuid(pick.id),
        smokeOverrideName: pick.name,
      };
    }
  }

  report.supplierValidation = {
    envConfigured: Boolean(supplierEnv),
    envRedacted: supplierEnv ? redactUuid(supplierEnv) : null,
    supplierCount: suppliers?.length ?? 0,
    envSupplierExists: effectiveSupplierId
      ? Boolean(suppliers?.some((s: { id: string }) => s.id === effectiveSupplierId))
      : null,
    sampleSuppliers: (suppliers ?? []).slice(0, 5).map((s: { id: string; name: string; is_active: boolean }) => ({
      id: redactUuid(s.id),
      name: s.name,
      is_active: s.is_active,
    })),
  };

  const { fetchCategoryAttributeDefinitions } = await import("../src/lib/admin/product-attribute-sync");
  const attrDefs = await fetchCategoryAttributeDefinitions(CATEGORY_ID);

  const attributes: Record<string, string | string[]> = {
    material: "nitrile",
    grade: "exam",
    powder: "powder_free",
    thickness_mil: "3",
    industries: ["healthcare"],
    uses: ["examination"],
  };
  for (const d of attrDefs) {
    if (attributes[d.attributeKey] !== undefined) continue;
    if (!d.isRequired) continue;
    if (d.allowedValues.length > 0) {
      attributes[d.attributeKey] =
        d.cardinality === "multi" ? [d.allowedValues[0]] : d.allowedValues[0];
    }
  }

  const commercePackaging = normalizeCommercePackaging(
    {
      units_per_case: 1000,
      case_price: 49.99,
      inner_unit_type: "box",
      units_per_inner: 100,
      inners_per_case: 10,
      unit_noun: "gloves",
    },
    "disposable_gloves"
  );

  const draftInput = {
    name: `Manual Smoke ${SMOKE_SKU}`,
    brandName: "Growl Gloves",
    categoryId: CATEGORY_ID,
    description: "Operator smoke — safe to delete",
    primaryImageUrl: "https://www.glovecubs.com/images/logos/growl-gloves.png",
    status: "draft" as const,
    quoteOnly: true,
    variants: [{ sizeCode: "M", variantSku: `${SMOKE_SKU}-M`, listPrice: "" }],
    attributes,
    commercePackaging,
    internalSku: SMOKE_SKU,
  };

  let productId: string | null = null;
  try {
    const created = await insertCatalogProduct(draftInput);
    if ("error" in created) {
      report.positiveSmoke = { step: "draft_insert", error: created.error };
    } else {
      productId = created.id;
      const { count: offerCountDraft } = await supabase
        .schema("catalogos")
        .from("supplier_offers")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);

      report.positiveSmoke = {
        step: "draft_insert",
        productId: redactUuid(productId),
        internalSku: SMOKE_SKU,
        draftNoSupplierOffers: (offerCountDraft ?? 0) === 0,
        postActiveHelperWouldRunOnDraft: shouldRunManualPostActiveSideEffects({}, "draft"),
      };

      const { data: variantRows } = await supabase
        .schema("catalog_v2")
        .from("catalog_variants")
        .select("id, variant_sku, size_code")
        .eq("catalog_product_id", productId);

      const variantsWithIds = draftInput.variants.map((v, i) => ({
        ...v,
        id: (variantRows?.[i] as { id?: string } | undefined)?.id,
      }));

      const readinessErr = await evaluateActivePublishReadiness(
        supabase,
        { ...draftInput, status: "active", variants: variantsWithIds },
        { metadata: { product_line_code: "ppe_gloves" }, productId }
      );

      const activeResult = await updateCatalogProduct(productId, {
        ...draftInput,
        status: "active",
        variants: variantsWithIds,
      });
      const { data: prodAfter } = await supabase
        .schema("catalog_v2")
        .from("catalog_products")
        .select("status, slug, metadata, internal_sku")
        .eq("id", productId)
        .single();

      const meta = (prodAfter?.metadata ?? {}) as Record<string, unknown>;
      const facetAttrs = meta.facet_attributes;

      const { count: offerCountActive } = await supabase
        .schema("catalogos")
        .from("supplier_offers")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId);

      const { data: bestOffer } = await supabase
        .schema("catalogos")
        .from("product_best_offer_price")
        .select("best_price, offer_count")
        .eq("product_id", productId)
        .maybeSingle();

      const { data: sellable } = await supabase
        .schema("gc_commerce")
        .from("sellable_products")
        .select("sku, list_price_minor, is_active")
        .eq("catalog_product_id", productId)
        .maybeSingle();

      report.positiveSmoke = {
        ...report.positiveSmoke,
        readinessError: readinessErr,
        activeUpdateError: "error" in activeResult ? activeResult.error : null,
        status: prodAfter?.status ?? null,
        slug: prodAfter?.slug ?? null,
        facetAttributesPresent:
          facetAttrs != null && typeof facetAttrs === "object" && !Array.isArray(facetAttrs),
        supplierOfferCount: offerCountActive ?? 0,
        supplierOfferExpected: Boolean(effectiveSupplierId),
        bestOfferPrice: bestOffer?.best_price ?? null,
        bestOfferCount: bestOffer?.offer_count ?? null,
        sellableSku: sellable?.sku ?? null,
        sellableListPriceMinor: sellable?.list_price_minor ?? null,
      };
    }
  } catch (e) {
    report.positiveSmoke = { ...report.positiveSmoke, exception: String(e) };
  }

  const { data: urlImportProduct } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, status, metadata")
    .or(
      "metadata->>import_staging_id.not.is.null,metadata->>catalogos_url_import_job_id.not.is.null"
    )
    .limit(1)
    .maybeSingle();

  if (urlImportProduct) {
    const meta = (urlImportProduct.metadata ?? {}) as Record<string, unknown>;
    const blockMsg = clipboardUrlImportActiveStatusError(meta, "active");
    const helperRuns = shouldRunManualPostActiveSideEffects(meta, "active");
    report.negativeSmoke = {
      productId: redactUuid(urlImportProduct.id),
      productName: urlImportProduct.name,
      statusBefore: urlImportProduct.status,
      blockedMessage: blockMsg,
      postActiveHelperRuns: helperRuns,
      blocked: Boolean(blockMsg),
    };
  } else {
    report.negativeSmoke = { found: false, note: "No URL-import catalog product in DB; unit tests cover block path" };
  }

  if (productId && prodSlug(report)) {
    const slug = prodSlug(report);
    const base = "http://localhost:3005";
    for (const path of [`/store`, `/store/p/${slug}`]) {
      try {
        const res = await fetch(`${base}${path}`, { redirect: "follow" });
        const html = path.startsWith("/store/p/") ? await res.text() : "";
        report.storefrontHttp = {
          ...(report.storefrontHttp as object),
          [path]: {
            status: res.status,
            ok: res.ok,
            ...(path.startsWith("/store/p/")
              ? {
                  showsCasePrice: /\$49\.99|49\.99/.test(html),
                  hasQuoteCta: /quote|request pricing|add to quote/i.test(html),
                  hasCheckout: /checkout|pay now|credit card|stripe/i.test(html),
                  hasStock: /in stock|inventory|qty available|units available/i.test(html),
                }
              : {}),
          },
        };
      } catch (e) {
        report.storefrontHttp = {
          ...(report.storefrontHttp as object),
          [path]: { error: "dev_server_unreachable" },
        };
      }
    }
  }

  if (productId && !KEEP) {
    await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);
    report.cleanup = "deleted_smoke_product";
  } else if (productId) {
    report.cleanup = "kept_smoke_product";
  }

  console.log(JSON.stringify(report, null, 2));
}

function prodSlug(report: SmokeReport): string | null {
  const ps = report.positiveSmoke as { slug?: string };
  return ps.slug ?? null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

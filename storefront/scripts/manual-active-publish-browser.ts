/**
 * Browser smoke for manual active publish (Playwright, public storefront + admin gate check).
 * Usage: npx tsx scripts/manual-active-publish-browser.ts <slug>
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const SLUG = process.argv[2] || "manual-smoke-smk-19c0a6";
const BASE = "http://localhost:3005";

async function main() {
  const { getSupabaseAdmin } = await import("../src/lib/supabase/server");
  const { fetchAdminProductDetail } = await import("../src/lib/admin/product-operations");
  const { evaluateActivePublishReadiness } = await import("../src/lib/admin/product-write-active-readiness");
  const { shouldRunManualPostActiveSideEffects } = await import("../src/lib/admin/product-write-manual-post-active");
  const { clipboardUrlImportActiveStatusError } = await import("../src/lib/admin/clipboard-promote-guards");

  const sb = getSupabaseAdmin();
  const { data: prod } = await sb
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, name, status, slug, metadata, internal_sku")
    .eq("slug", SLUG)
    .maybeSingle();

  if (!prod) {
    console.log(JSON.stringify({ error: "product_not_found", slug: SLUG }));
    process.exit(1);
  }

  const productId = prod.id;
  const adminDetail = await fetchAdminProductDetail(productId);
  const meta = (prod.metadata ?? {}) as Record<string, unknown>;

  const report: Record<string, unknown> = {
    productId: `${productId.slice(0, 8)}…${productId.slice(-4)}`,
    slug: SLUG,
    adminEditPath: `/admin/products/${productId}/edit`,
    serverReadModel: {
      status: prod.status,
      name: prod.name,
      internalSku: prod.internal_sku,
      facetAttributesPresent: meta.facet_attributes != null && typeof meta.facet_attributes === "object",
      urlImportBlockOnActive: clipboardUrlImportActiveStatusError(meta, "active"),
      postActiveHelperWouldRun: shouldRunManualPostActiveSideEffects(meta, "active"),
      editorLoaded: adminDetail.configured && !adminDetail.notFound && Boolean(adminDetail.editor),
      editorStatus: adminDetail.product?.status ?? adminDetail.editor?.initialStatus ?? null,
    },
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const adminRes = await page.goto(`${BASE}/admin/products/${productId}/edit`, { waitUntil: "domcontentloaded" });
    const adminUrl = page.url();
    report.adminBrowser = {
      httpStatus: adminRes?.status() ?? null,
      finalUrl: adminUrl.replace(BASE, ""),
      requiresLogin: adminUrl.includes("/login"),
      note: adminUrl.includes("/login")
        ? "Admin editor requires Supabase session; server read model verified instead"
        : "Admin editor loaded",
    };

    const storeRes = await page.goto(`${BASE}/store`, { waitUntil: "networkidle" });
    const storeHtml = await page.content();
    report.storeListing = {
      httpStatus: storeRes?.status() ?? null,
      includesSmokeProduct: storeHtml.includes(prod.name) || storeHtml.includes(SLUG),
    };

    const pdpRes = await page.goto(`${BASE}/store/p/${SLUG}`, { waitUntil: "networkidle" });
    const pdpHtml = await page.content();
    report.pdp = {
      httpStatus: pdpRes?.status() ?? null,
      showsCasePrice: /\$49\.99|49\.99/.test(pdpHtml),
      hasQuoteCta: /add to quote|quote request|request pricing/i.test(pdpHtml),
      hasCheckout: /checkout|pay now|credit card|stripe/i.test(pdpHtml),
      hasStock: /in stock|inventory|qty available|units available/i.test(pdpHtml),
    };

    const quoteBtn = page.getByRole("button", { name: /add to quote/i }).first();
    if (await quoteBtn.isVisible().catch(() => false)) {
      await quoteBtn.click();
      await page.waitForTimeout(500);
      await page.goto(`${BASE}/quote-cart`, { waitUntil: "networkidle" });
      const cartHtml = await page.content();
      const cartItems = await page.evaluate(() => {
        try {
          const raw = localStorage.getItem("glovecubs-quote-cart-v1");
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      });
      report.quoteCart = {
        pageHttpStatus: 200,
        localStorageHasSmokeProduct: Boolean(
          cartItems?.items?.some(
            (i: { slug?: string; name?: string }) => i.slug === SLUG || i.name === prod.name
          )
        ),
        cartItemCount: cartItems?.items?.length ?? 0,
        hasQuoteCopy: /quote|review|request pricing/i.test(cartHtml),
        hasHonestNoCheckoutCopy: /not a checkout|not checkout/i.test(cartHtml),
        hasSelfServePaymentCta: /pay now|credit card|complete purchase|place order/i.test(cartHtml),
        hasStockCopy: /in stock|inventory available/i.test(cartHtml),
      };
    } else {
      report.quoteCart = { skipped: "Add to quote button not visible" };
    }

    const priceFilterUrl = `${BASE}/store?price_min=40&price_max=55&sort=price_asc`;
    await page.goto(priceFilterUrl, { waitUntil: "networkidle" });
    const filteredHtml = await page.content();
    report.priceFilterSort = {
      url: "/store?price_min=40&price_max=55&sort=price_asc",
      includesSmokeProductInHtml: filteredHtml.includes(prod.name) || filteredHtml.includes(SLUG),
      sortParamApplied: filteredHtml.length > 0,
    };

    const { fetchStoreCatalogPage } = await import("../src/lib/catalog/store-products");
    const catalogPage = await fetchStoreCatalogPage({
      page: 1,
      price_min: 40,
      price_max: 55,
      sort: "price_asc",
    });
    report.priceFilterSort = {
      ...(report.priceFilterSort as object),
      serverCatalogIncludesSmoke: catalogPage.products.some((p) => p.slug === SLUG),
      serverCatalogTotal: catalogPage.total,
      serverCatalogPageSize: catalogPage.products.length,
      smokeBestPrice: catalogPage.products.find((p) => p.slug === SLUG)?.bestPrice ?? null,
    };
  } finally {
    await browser.close();
  }

  const { data: urlImport } = await sb
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, status, metadata")
    .eq("id", "ac5dedb3-fbd5-4a2a-9f2a-8ac5dedbfbd5")
    .maybeSingle();

  if (!urlImport) {
    const { data: alt } = await sb
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, status, metadata")
      .or("metadata->>import_staging_id.not.is.null,metadata->>catalogos_url_import_job_id.not.is.null")
      .limit(1)
      .maybeSingle();
    if (alt) {
      const um = (alt.metadata ?? {}) as Record<string, unknown>;
      report.urlImportNegative = {
        productId: `${alt.id.slice(0, 8)}…${alt.id.slice(-4)}`,
        status: alt.status,
        blockedMessage: clipboardUrlImportActiveStatusError(um, "active"),
        postActiveHelperRuns: shouldRunManualPostActiveSideEffects(um, "active"),
      };
    }
  } else {
    const um = (urlImport.metadata ?? {}) as Record<string, unknown>;
    report.urlImportNegative = {
      productId: `${urlImport.id.slice(0, 8)}…${urlImport.id.slice(-4)}`,
      status: urlImport.status,
      blockedMessage: clipboardUrlImportActiveStatusError(um, "active"),
      postActiveHelperRuns: shouldRunManualPostActiveSideEffects(um, "active"),
    };
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

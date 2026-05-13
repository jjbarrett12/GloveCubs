import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { fetchStoreCatalogPage } from "@/lib/catalog/store-products";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";
import { getAllCatalogFacetKeys } from "@/lib/catalog/catalog-facet-registry";
import { StoreGrid } from "@/components/quote/StoreGrid";
import { parseStoreCatalogParams } from "@/lib/catalog/store-url";
import { StorePageShell } from "@/components/store/StorePageShell";
import { StoreCatalogLayout } from "@/components/store/StoreCatalogLayout";
import { StoreSortBar } from "@/components/store/StoreSortBar";
import { StoreFilterChips } from "@/components/store/StoreFilterChips";
import { StorePagination } from "@/components/store/StorePagination";
import { AddVisiblePageToQuote } from "@/components/store/AddVisiblePageToQuote";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getRequestPricingHrefForIntent } from "@/lib/discovery/intent-routes";
import { getCanonicalStoreHrefIfNeeded } from "@/lib/catalog/store-legacy-url";
import { getAdminUser } from "@/lib/admin/get-admin-user";

/** Fresh catalog reads on each request (Supabase). */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Store | GloveCubs",
  description:
    "Industrial and disposable glove catalog for business buyers—filter by spec, brand, and industry. List pricing when published; case, pallet, and contract paths through quote review.",
};

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

/** Request-pricing tiles only (not live SKUs). */
const STORE_REQUEST_CATEGORY_TILES: { label: string; description: string; intentId: string }[] = [
  {
    label: "Nitrile exam gloves",
    description: "Case quantities · powder-free programs",
    intentId: "rfq.store.tile.nitrile_exam",
  },
  {
    label: "Food service",
    description: "Hospitality programs · case pricing",
    intentId: "rfq.store.tile.food_service",
  },
  {
    label: "Industrial gloves",
    description: "Cut, chemical, and general duty",
    intentId: "rfq.store.tile.industrial",
  },
  {
    label: "Janitorial",
    description: "High-turnover disposables",
    intentId: "rfq.store.tile.janitorial",
  },
  {
    label: "Medical / exam",
    description: "Exam-grade and clinical-use programs",
    intentId: "rfq.store.tile.healthcare",
  },
  {
    label: "Black nitrile",
    description: "Tattoo, automotive, retail-back-of-house",
    intentId: "rfq.store.tile.black_nitrile",
  },
  {
    label: "Latex-free options",
    description: "Standardize allergen-aware SKUs",
    intentId: "rfq.store.tile.latex_free",
  },
];

function storeUrlHasActiveFilters(s: StoreCatalogUrlState): boolean {
  if ((s.q ?? "").trim()) return true;
  if (s.brand?.length) return true;
  if (s.category) return true;
  if (s.price_min != null || s.price_max != null) return true;
  for (const k of getAllCatalogFacetKeys()) {
    const v = (s as Record<string, unknown>)[k];
    if (Array.isArray(v) && v.length) return true;
  }
  return false;
}

function StoreRequestCategoryTiles() {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {STORE_REQUEST_CATEGORY_TILES.map((t) => (
        <Link
          key={t.intentId}
          href={getRequestPricingHrefForIntent(t.intentId)}
          className="rounded-lg border border-white/10 bg-[#141414] p-3 shadow-sm transition hover:border-[#f06232]/35 hover:shadow-sm"
        >
          <div className="text-[12px] font-bold leading-tight text-white">{t.label}</div>
          <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/45">{t.description}</div>
          <div className="mt-1.5 text-[10px] font-semibold text-[#f06232]">RFQ →</div>
        </Link>
      ))}
    </div>
  );
}

export default async function StorePage({ searchParams }: PageProps) {
  const canonical = getCanonicalStoreHrefIfNeeded(searchParams);
  if (canonical) permanentRedirect(canonical);

  const urlState = parseStoreCatalogParams(searchParams);
  const { products, total, limit, brands, facetCounts, facetMeta, catalogUnavailable } = await fetchStoreCatalogPage(urlState);
  const hasFilters = storeUrlHasActiveFilters(urlState);
  const showGrid = !catalogUnavailable;
  const adminUser = await getAdminUser();
  const showAdminCatalogCta = Boolean(adminUser);

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-poppins">
      <SiteHeaderLoader />

      <main className="py-4 sm:py-6">
        <StorePageShell>
          <section
            className="mb-5 rounded-lg border border-white/10 bg-[#121212] px-4 py-4 sm:px-5 sm:py-4"
            aria-labelledby="store-hero-heading"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f06232]">Catalog</p>
                <h1 id="store-hero-heading" className="mt-0.5 text-xl font-black tracking-tight text-white sm:text-2xl">
                  Glove listings
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-white/65 sm:text-sm">
                  Filter by material, mil, certifications, industry, and brand. List pricing when published; quote review for pallet and
                  contract paths.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <a
                  href="#store-catalog"
                  className="inline-flex items-center justify-center rounded-md bg-[#f06232] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#e5582d] sm:text-sm"
                >
                  Browse grid
                </a>
                <Link
                  href="/request-pricing"
                  className="inline-flex items-center justify-center rounded-md border border-[#f06232]/50 bg-transparent px-3.5 py-2 text-xs font-semibold text-[#f06232] transition hover:border-[#f06232] hover:bg-[#f06232]/10 sm:text-sm"
                >
                  RFQ
                </Link>
                <Link
                  href="/invoice-savings"
                  className="inline-flex items-center justify-center rounded-md border border-white/12 px-3.5 py-2 text-xs font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/[0.04] sm:text-sm"
                >
                  Invoice
                </Link>
              </div>
            </div>
          </section>

          {catalogUnavailable ? (
            <div className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 sm:px-4">
              <p className="m-0 text-sm font-semibold text-white">Catalog pricing is temporarily unavailable</p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Tell us what you need and we will help source the right products from distributor programs and published listings.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href="/request-pricing" className="text-sm font-bold text-[#f06232] hover:underline">
                  Request pricing
                </Link>
                <span className="text-white/35">·</span>
                <Link href="/invoice-savings" className="text-sm font-bold text-[#f06232] hover:underline">
                  Upload invoice for review
                </Link>
                <span className="text-white/35">·</span>
                <Link href="/industries" className="text-sm font-semibold text-white/70 hover:text-[#f06232]">
                  Browse industries
                </Link>
              </div>
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">Program entry points</p>
                <StoreRequestCategoryTiles />
              </div>
            </div>
          ) : null}

          {!catalogUnavailable && products.length === 0 ? (
            <div className="mb-5 rounded-lg border border-white/10 bg-[#111]/80 px-4 py-3 sm:px-4">
              <p className="m-0 text-sm font-semibold text-white">
                {hasFilters ? "No products match these filters" : "Catalog publishing is in progress"}
              </p>
              <p className="mt-2 text-sm text-white/65">
                {hasFilters
                  ? "Try clearing a filter or broadening material, mil, or industry. You can also send specs and we will match from stock or inbound programs."
                  : "Published listings appear here as soon as operators finish review. Meanwhile you can request programs, upload invoices for matching, or talk to sales about sourcing options."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/request-pricing"
                  className="inline-flex items-center justify-center rounded-md bg-[#f06232] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#e5582d] sm:text-sm"
                >
                  Request pricing
                </Link>
                <Link
                  href="/invoice-savings"
                  className="inline-flex items-center justify-center rounded-md border border-[#f06232]/50 bg-transparent px-3.5 py-2 text-xs font-semibold text-[#f06232] transition hover:border-[#f06232] hover:bg-[#f06232]/10 sm:text-sm"
                >
                  Upload invoice
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-md border border-white/12 px-3.5 py-2 text-xs font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/[0.04] sm:text-sm"
                >
                  Contact sales
                </Link>
                {showAdminCatalogCta ? (
                  <Link
                    href="/admin/products/new"
                    className="inline-flex items-center justify-center rounded-md border border-emerald-500/45 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/18 sm:text-sm"
                  >
                    Add first product (admin)
                  </Link>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {hasFilters ? (
                  <Link href="/store" className="font-bold text-[#f06232] hover:underline">
                    Clear filters
                  </Link>
                ) : null}
                {hasFilters ? <span className="text-white/35">·</span> : null}
                <Link href="/industries" className="font-semibold text-white/70 hover:text-[#f06232]">
                  Industries
                </Link>
              </div>
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">Program entry points</p>
                <StoreRequestCategoryTiles />
              </div>
            </div>
          ) : null}

          <div id="store-catalog">
            <StoreCatalogLayout
              key={JSON.stringify(urlState)}
              urlState={urlState}
              brands={brands}
              facetCounts={facetCounts}
              facetMeta={facetMeta}
            >
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <StoreSortBar urlState={urlState} total={total} />
                  </div>
                  {showGrid && products.length > 0 ? <AddVisiblePageToQuote products={products} /> : null}
                </div>
                <StoreFilterChips urlState={urlState} brands={brands} facetMeta={facetMeta} />
                <StoreGrid products={products} />
                <StorePagination urlState={urlState} total={total} limit={limit} />
              </div>
            </StoreCatalogLayout>
          </div>
        </StorePageShell>
      </main>
    </div>
  );
}

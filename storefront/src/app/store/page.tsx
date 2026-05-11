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
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {STORE_REQUEST_CATEGORY_TILES.map((t) => (
        <Link
          key={t.intentId}
          href={getRequestPricingHrefForIntent(t.intentId)}
          className="rounded-xl border border-white/10 bg-[#141414] p-4 shadow-sm transition hover:border-[#f06232]/40 hover:shadow-md"
        >
          <div className="text-[13px] font-bold text-white">{t.label}</div>
          <div className="mt-1 text-[11px] leading-snug text-white/50">{t.description}</div>
          <div className="mt-2 text-[11px] font-semibold text-[#f06232]">Request program pricing →</div>
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-poppins">
      <SiteHeaderLoader />

      <main className="py-6 sm:py-8">
        <StorePageShell>
          <section
            className="mb-8 rounded-xl border border-white/10 bg-gradient-to-br from-[#141414] to-[#101010] px-5 py-5 sm:px-6 sm:py-6"
            aria-labelledby="store-hero-heading"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#f06232]">B2B glove catalog</p>
            <h1 id="store-hero-heading" className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Pick fast. Buy with case context.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/70">
              Filters map to how buyers actually shop—material, mil, certifications, industry, brand. Published list pricing shows
              when we have it; pallet programs and contract paths go through quote review so operators are not blocked on edge buys.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href="#store-catalog"
                className="inline-flex items-center justify-center rounded-lg bg-[#f06232] px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-[#f06232]"
              >
                Shop listings
              </a>
              <Link
                href="/request-pricing"
                className="inline-flex items-center justify-center rounded-lg border border-[#f06232]/60 bg-transparent px-4 py-2.5 text-sm font-semibold text-[#f06232] transition hover:border-[#f06232] hover:bg-[#f06232]/10"
              >
                Business pricing
              </Link>
              <Link
                href="/invoice-savings"
                className="inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:border-white/25 hover:bg-white/5"
              >
                Upload invoice for review
              </Link>
            </div>
            <p className="mt-3 text-[11px] text-white/40">
              Need pallet pricing, multi-site programs, or a sourcing review? Use request pricing or invoice upload—we respond on business
              days.
            </p>
          </section>

          {catalogUnavailable ? (
            <div className="mb-8 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-4 sm:px-5">
              <p className="m-0 text-sm font-semibold text-white">Catalog pricing is temporarily unavailable</p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Tell us what you need and we will help source the right products from available inventory and distributor programs.
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
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">Common program entry points</p>
                <StoreRequestCategoryTiles />
              </div>
            </div>
          ) : null}

          {!catalogUnavailable && products.length === 0 ? (
            <div className="mb-8 rounded-xl border border-white/10 bg-[#111]/80 px-4 py-4 sm:px-5">
              <p className="m-0 text-sm font-semibold text-white">
                {hasFilters ? "No products match these filters" : "No active listings match this view right now"}
              </p>
              <p className="mt-2 text-sm text-white/65">
                {hasFilters
                  ? "Try clearing a filter or broadening material, mil, or industry. You can also send specs and we will match from stock or inbound programs."
                  : "Send your use case or an invoice—we will match SKUs and case pricing from our catalog and distributor network."}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {hasFilters ? (
                  <Link href="/store" className="font-bold text-[#f06232] hover:underline">
                    Clear filters
                  </Link>
                ) : null}
                {hasFilters ? <span className="text-white/35">·</span> : null}
                <Link href="/request-pricing" className="font-bold text-[#f06232] hover:underline">
                  Request pricing
                </Link>
                <span className="text-white/35">·</span>
                <Link href="/invoice-savings" className="font-bold text-[#f06232] hover:underline">
                  Upload invoice
                </Link>
                <span className="text-white/35">·</span>
                <Link href="/industries" className="font-semibold text-white/70 hover:text-[#f06232]">
                  Industries
                </Link>
              </div>
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">Start from a common program</p>
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
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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

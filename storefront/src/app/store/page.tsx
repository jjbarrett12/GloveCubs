import Link from "next/link";
import { Suspense } from "react";
import { fetchStoreCatalogPage } from "@/lib/catalog/store-products";
import { parseStoreCatalogParams } from "@/lib/catalog/store-url";
import { StorePageShell } from "@/components/store/StorePageShell";
import { StoreCatalogClient } from "@/components/store/StoreCatalogClient";
import { StoreCatalogView } from "@/components/store/StoreCatalogView";

/**
 * Anonymous catalog listing — no admin/auth lookups, no request searchParams.
 *
 * Rendering: force-static + ISR (revalidate 300). Default catalog HTML is built/revalidated
 * once; URL filters/sort/page hydrate client-side via cacheable GET /api/store/catalog.
 * Quote cart / favorites remain client-local and do not dynamize this route.
 */
export const dynamic = "force-static";
export const revalidate = 300;

export const metadata = {
  title: "Store | GloveCubs",
  description:
    "Industrial and disposable glove catalog for business buyers—filter by spec, brand, and industry. List pricing when published; case, pallet, and contract paths through quote review.",
  alternates: { canonical: "/store" },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function StorePage() {
  const initialUrlState = parseStoreCatalogParams({});
  const page = await fetchStoreCatalogPage(initialUrlState);
  const initialData = {
    products: page.products,
    total: page.total,
    limit: page.limit,
    brands: page.brands,
    facetCounts: page.facetCounts,
    facetMeta: page.facetMeta,
    catalogUnavailable: Boolean(page.catalogUnavailable),
  };

  return (
    <div className="font-poppins">
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
                  Filter by material, mil, certifications, industry, and brand. List pricing when published; quote
                  review for pallet and contract paths.
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

          <Suspense
            fallback={<StoreCatalogView urlState={initialUrlState} data={initialData} />}
          >
            <StoreCatalogClient initialData={initialData} initialUrlState={initialUrlState} />
          </Suspense>
        </StorePageShell>
      </main>
    </div>
  );
}

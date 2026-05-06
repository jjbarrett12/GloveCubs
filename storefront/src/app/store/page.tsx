import Link from "next/link";
import { fetchStoreCatalogPage } from "@/lib/catalog/store-products";
import { StoreGrid } from "@/components/quote/StoreGrid";
import { QuoteCartNavLink } from "@/components/quote/QuoteCartNavLink";
import { parseStoreCatalogParams } from "@/lib/catalog/store-url";
import { StorePageShell } from "@/components/store/StorePageShell";
import { StoreCatalogLayout } from "@/components/store/StoreCatalogLayout";
import { StoreSortBar } from "@/components/store/StoreSortBar";
import { StoreFilterChips } from "@/components/store/StoreFilterChips";
import { StorePagination } from "@/components/store/StorePagination";
import { AddVisiblePageToQuote } from "@/components/store/AddVisiblePageToQuote";

/** Fresh catalog reads on each request (Supabase). */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Store | GloveCubs",
  description: "Browse products from the GloveCubs catalog.",
};

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function StorePage({ searchParams }: PageProps) {
  const urlState = parseStoreCatalogParams(searchParams);
  const { products, error, total, limit, brands, facetCounts, facetMeta } = await fetchStoreCatalogPage(urlState);

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-poppins">
      <header className="border-b border-white/10">
        <StorePageShell>
          <div className="flex items-center justify-between py-4">
            <Link href="/" className="text-xl font-semibold text-white">
              GloveCubs
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/" className="text-sm text-white/80 hover:text-white">
                Home
              </Link>
              <QuoteCartNavLink />
            </nav>
          </div>
        </StorePageShell>
      </header>

      <main className="py-8 sm:py-10">
        <StorePageShell>
          <div className="mb-6 border-b border-white/10 pb-5">
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Store</h1>
            <p className="mt-1 text-sm text-white/60">Case &amp; pallet B2B — add lines to your quote cart.</p>
          </div>

          {error && (
            <div className="mb-8 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
              <p className="m-0">{error}</p>
              <p className="m-0 text-white/70">
                You can still shop by industry guides or send an RFQ—we will match from catalog or inbound stock.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link href="/industries" className="font-semibold text-[#FF7A00] hover:underline">
                  Industries overview
                </Link>
                <span className="text-white/40">·</span>
                <Link href="/request-pricing" className="font-semibold text-[#FF7A00] hover:underline">
                  Request pricing
                </Link>
              </div>
            </div>
          )}

          {!error && products.length === 0 && (
            <div className="mb-8 space-y-3 text-sm text-white/60">
              <p className="m-0">No active products match your filters right now.</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/store" className="font-semibold text-[#FF7A00] hover:underline">
                  Clear filters
                </Link>
                <span className="text-white/40">·</span>
                <Link href="/industries" className="font-semibold text-[#FF7A00] hover:underline">
                  Browse industries
                </Link>
                <span className="text-white/40">·</span>
                <Link href="/request-pricing" className="font-semibold text-[#FF7A00] hover:underline">
                  Request pricing
                </Link>
              </div>
            </div>
          )}

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
                {!error && products.length > 0 ? <AddVisiblePageToQuote products={products} /> : null}
              </div>
              <StoreFilterChips urlState={urlState} brands={brands} facetMeta={facetMeta} />
              <StoreGrid products={products} />
              <StorePagination urlState={urlState} total={total} limit={limit} />
            </div>
          </StoreCatalogLayout>
        </StorePageShell>
      </main>
    </div>
  );
}

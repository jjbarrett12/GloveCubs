import Link from "next/link";
import { fetchStoreCatalogPage } from "@/lib/catalog/store-products";
import { parseStoreCatalogParams } from "@/lib/catalog/store-url";
import { StoreProductCard } from "@/components/store/StoreProductCard";

/**
 * Live catalog strip for the homepage—same rows as /store (no fabricated “top sellers”).
 */
export async function HomeFeaturedCatalogSection() {
  const urlState = parseStoreCatalogParams({});
  const { products, catalogUnavailable } = await fetchStoreCatalogPage({ ...urlState, limit: 8, page: 1 });

  if (catalogUnavailable || products.length === 0) {
    return (
      <section
        className="border-t border-white/10 bg-[#0a0a0a] px-4 py-12 sm:px-6 sm:py-14 lg:px-8"
        aria-labelledby="featured-catalog-heading"
      >
        <div className="mx-auto max-w-7xl text-center">
          <h2 id="featured-catalog-heading" className="text-xl font-extrabold text-white sm:text-2xl">
            Published catalog
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-white/65">
            Open the store to browse quote-ready listings as operators publish them—request pricing anytime for programs not yet on the grid.
          </p>
          <Link
            href="/store"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#f06232] px-6 py-2.5 text-sm font-bold text-white hover:opacity-95"
          >
            Browse store
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className="border-t border-white/10 bg-[#0a0a0a] px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
      aria-labelledby="featured-catalog-heading"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#f06232]">From the catalog</p>
            <h2 id="featured-catalog-heading" className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Current listings
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/65">
              A slice of the published catalog—sorted newest first. Open any listing for specs, variants, and add-to-quote.
            </p>
          </div>
          <Link
            href="/store"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[#f06232]/60 px-5 py-2.5 text-sm font-semibold text-[#f06232] transition hover:bg-[#f06232]/10"
          >
            Full catalog →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
          {products.map((p) => (
            <StoreProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

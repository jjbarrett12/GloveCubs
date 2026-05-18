import Link from "next/link";
import { fetchStoreCatalogPage } from "@/lib/catalog/store-products";
import { parseStoreCatalogParams } from "@/lib/catalog/store-url";
import { StoreProductCard } from "@/components/store/StoreProductCard";
import { HomeShopShortcutsSection } from "@/components/home/HomeShopShortcutsSection";
import { ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";

/**
 * Live catalog strip for the homepage—same rows as /store (no fabricated “top sellers”).
 */
export async function HomeFeaturedCatalogSection() {
  const urlState = parseStoreCatalogParams({});
  const { products, catalogUnavailable } = await fetchStoreCatalogPage({ ...urlState, limit: 8, page: 1 });

  if (catalogUnavailable || products.length === 0) {
    return (
      <ProcurementSectionShell tone="light-alt" headingId="featured-catalog-heading">
        <SectionEyebrow tone="light">Published catalog</SectionEyebrow>
        <h2 id="featured-catalog-heading" className="proc-h2-light text-center sm:text-left">
          Catalog listings
        </h2>
        <p className="proc-body-light mx-auto mt-2 max-w-lg text-center sm:mx-0 sm:text-left">
          Open the store to browse quote-ready listings as operators publish them—request pricing anytime for programs not yet
          on the grid.
        </p>
        <Link
          href="/store"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-hover"
        >
          Browse store
        </Link>
        <div className="mt-12 border-t border-[#e7e7e7] pt-10">
          <HomeShopShortcutsSection embedded />
        </div>
      </ProcurementSectionShell>
    );
  }

  return (
    <ProcurementSectionShell tone="light-alt" headingId="featured-catalog-heading">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <SectionEyebrow tone="light">From the catalog</SectionEyebrow>
          <h2 id="featured-catalog-heading" className="proc-h2-light mt-1">
            Current listings
          </h2>
          <p className="proc-body-light mt-2 max-w-xl">
            A slice of the published catalog—sorted newest first. Open any listing for specs, variants, and add-to-quote.
          </p>
        </div>
        <Link
          href="/store"
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border-light px-5 py-2.5 text-sm font-semibold text-brand transition hover:border-brand/50 hover:bg-[#fafafa]"
        >
          Full catalog →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
        {products.map((p) => (
          <StoreProductCard key={p.id} product={p} surface="light" />
        ))}
      </div>
      <div className="mt-12 border-t border-[#e7e7e7] pt-10">
        <HomeShopShortcutsSection embedded />
      </div>
    </ProcurementSectionShell>
  );
}

import Link from "next/link";
import { CompareWizardTable } from "@/components/compare-wizard/CompareWizardTable";
import { StorePageShell } from "@/components/store/StorePageShell";
import { fetchCompareWizardProducts } from "@/lib/catalog/compare-wizard-products";

export const dynamic = "force-dynamic";

export default async function CompareWizardPage() {
  const { rows, catalogUnavailable } = await fetchCompareWizardProducts();

  return (
    <main className="py-4 sm:py-6">
      <StorePageShell>
        <section
          className="mb-5 rounded-lg border border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5"
          aria-labelledby="compare-wizard-heading"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f06232]">Compare Wizard</p>
              <h1 id="compare-wizard-heading" className="mt-0.5 text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">
                Glove Sales Sheet
              </h1>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-neutral-600 sm:text-sm">
                Compare top glove deals, specs, and pricing. Click any GC- SKU to open the product page. Sort by column or filter
                by material, industry, grade, color, and size.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs font-semibold text-neutral-600 sm:text-sm">
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5">Fast shipping</span>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5">Quality guaranteed</span>
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5">Expert support</span>
            </div>
          </div>
        </section>

        {catalogUnavailable ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            <p className="font-semibold">Catalog is temporarily unavailable.</p>
            <p className="mt-2">
              Browse the{" "}
              <Link href="/store" className="font-medium text-[#f06232] hover:underline">
                product catalog
              </Link>{" "}
              or{" "}
              <Link href="/request-pricing" className="font-medium text-[#f06232] hover:underline">
                request pricing
              </Link>{" "}
              and our team will help you compare options.
            </p>
          </div>
        ) : (
          <CompareWizardTable rows={rows} />
        )}
      </StorePageShell>
    </main>
  );
}

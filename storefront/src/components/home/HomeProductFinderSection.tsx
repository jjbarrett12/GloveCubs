import Link from "next/link";
import { Hand, HardHat, Shield, FileText } from "lucide-react";
import { buildStoreCatalogHref } from "@/lib/catalog/store-url";

export function HomeProductFinderSection() {
  return (
    <section
      className="border-t border-neutral-200/90 bg-gradient-to-b from-[#fafafa] to-[#f0f0f0] py-24"
      aria-labelledby="finder-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center sm:text-left">
          <h2 id="finder-heading" className="mb-3 text-4xl font-extrabold tracking-tight text-neutral-900">
            Spec shopping—without retail noise
          </h2>
          <p className="max-w-3xl text-base leading-relaxed text-neutral-700 sm:text-[17px]">
            Every listing carries the attributes we have on file—mil, texture, use-case tags, and certs where published. Need a
            match from what you already run? Use invoice review or request pricing.
          </p>
        </div>
        <div className="mb-10 grid grid-cols-1 gap-7 md:grid-cols-2">
          <Link
            href="/store"
            className="block cursor-pointer rounded-xl border-2 border-[#f06232] bg-gradient-to-br from-white to-[#fff5f0] p-9 shadow-[0_4px_14px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="mb-6 flex items-center gap-5">
              <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f06232] to-[#f06232] text-3xl text-white shadow-md">
                <Hand className="h-9 w-9" strokeWidth={2} aria-hidden />
              </div>
              <div>
                <h3 className="mb-1 text-2xl font-bold text-neutral-900">Disposable Gloves</h3>
                <p className="text-sm font-medium text-neutral-700">Medical • Food Service • Industrial</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-5 border-t border-neutral-200/90 pt-6 text-sm leading-relaxed">
              <div>
                <strong className="text-xs uppercase text-neutral-900">Materials:</strong>
                <div className="mt-1 text-neutral-700">
                  • Nitrile (4-8 mil)
                  <br />
                  • Latex (Powder-free)
                  <br />• Vinyl (Economy)
                </div>
              </div>
              <div>
                <strong className="text-xs uppercase text-neutral-900">On each PDP:</strong>
                <div className="mt-1 text-neutral-700">
                  • Published attributes &amp; certs
                  <br />
                  • Pack / case context
                  <br />• Quote when list price is not published
                </div>
              </div>
            </div>
          </Link>
          <Link
            href="/store"
            className="block cursor-pointer rounded-xl border border-neutral-300/90 bg-white p-9 shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:border-[#f06232]/50 hover:shadow-md"
          >
            <div className="mb-6 flex items-center gap-5">
              <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#111111] to-[#1F2933] text-3xl text-[#f06232] shadow-md">
                <HardHat className="h-9 w-9" strokeWidth={2} aria-hidden />
              </div>
              <div>
                <h3 className="mb-1 text-2xl font-bold text-neutral-900">Reusable Work Gloves</h3>
                <p className="text-sm font-medium text-neutral-700">Cut-Resistant • Impact • Chemical</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-5 border-t border-neutral-200/90 pt-6 text-sm leading-relaxed">
              <div>
                <strong className="text-xs uppercase text-neutral-900">ANSI Levels:</strong>
                <div className="mt-1 text-neutral-700">
                  • A2-A5 Cut Resistant
                  <br />
                  • Impact Protection
                  <br />• Chemical Resistant
                </div>
              </div>
              <div>
                <strong className="text-xs uppercase text-neutral-900">Materials:</strong>
                <div className="mt-1 text-neutral-700">
                  • HPPE/Nitrile
                  <br />
                  • Leather
                  <br />• Coated Work
                </div>
              </div>
            </div>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4 lg:gap-4">
          <Link
            href={buildStoreCatalogHref({ q: "nitrile" })}
            className="rounded-xl bg-gradient-to-br from-[#f06232] to-[#f06232] p-7 text-center text-white shadow-[0_4px_14px_rgba(240, 98, 50,0.25)] transition hover:-translate-y-0.5"
          >
            <Shield className="mx-auto mb-3 h-10 w-10 text-white" strokeWidth={2} />
            <strong className="text-base font-bold">Nitrile</strong>
            <div className="mt-2 text-sm text-white/90">4-8 mil thickness</div>
          </Link>
          <Link
            href={buildStoreCatalogHref({ q: "latex powder-free" })}
            className="rounded-xl border border-neutral-300/90 bg-white p-7 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#f06232]/60 hover:shadow-md"
          >
            <Hand className="mx-auto mb-3 h-10 w-10 text-[#f06232]" strokeWidth={2} />
            <strong className="text-base font-bold text-neutral-900">Latex</strong>
            <div className="mt-2 text-sm text-neutral-600">Powder-free available</div>
          </Link>
          <Link
            href={buildStoreCatalogHref({ q: "vinyl" })}
            className="rounded-xl border border-neutral-300/90 bg-[#fafafa] p-7 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-[#f06232]/50 hover:shadow-md"
          >
            <Hand className="mx-auto mb-3 h-10 w-10 text-[#f06232]" strokeWidth={2} />
            <strong className="text-base font-bold text-neutral-900">Vinyl</strong>
            <div className="mt-2 text-sm text-neutral-600">Economy option</div>
          </Link>
          <Link
            href="/invoice-savings"
            className="rounded-xl border border-[#f06232]/80 bg-gradient-to-br from-[#fff8f3] to-white p-7 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <FileText className="mx-auto mb-3 h-10 w-10 text-[#f06232]" strokeWidth={2} />
            <strong className="text-base font-bold text-neutral-900">Compare from invoice</strong>
            <div className="mt-2 text-sm text-neutral-600">Upload what you buy today—we match to real options</div>
          </Link>
        </div>
        <div className="mt-12 flex flex-col items-center gap-4 border-t border-neutral-200/90 pt-10 text-center sm:flex-row sm:justify-center">
          <Link
            href="/store"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#f06232] to-[#f06232] px-8 py-3.5 text-base font-bold text-white shadow-[0_4px_14px_rgba(240, 98, 50,0.25)] transition hover:-translate-y-0.5"
          >
            Browse full store
          </Link>
          <Link
            href="/request-pricing"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-[#f06232] bg-white px-8 py-3.5 text-base font-bold text-[#f06232] transition hover:-translate-y-0.5 hover:bg-[#fff8f3]"
          >
            Request pricing
          </Link>
          <Link
            href="/#bulk-order"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 bg-neutral-50 px-8 py-3.5 text-base font-semibold text-neutral-900 transition hover:-translate-y-0.5 hover:border-[#f06232]/50"
          >
            Start bulk order
          </Link>
        </div>
      </div>
    </section>
  );
}

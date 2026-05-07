import Link from "next/link";
import { Star, Tag, Bot, Bolt, Headphones, FileText, Boxes, UserRound, LineChart } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";

export function HomeHeroExpress() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#111111] via-[#1a1a1a] to-[#0d1117] px-0 pb-20 pt-10 sm:pb-24 sm:pt-12 lg:pb-28 lg:pt-14"
      aria-label="Hero"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(240, 98, 50,0.09)_0%,transparent_72%)]" />
      <div className="pointer-events-none absolute -bottom-36 -left-36 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(240, 98, 50,0.05)_0%,transparent_72%)]" />

      <div className="relative z-[1] mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <div
              className="animate-hero-sku-alert-bob mb-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#f06232] to-[#f06232] px-5 py-2 text-sm font-bold tracking-wide text-white shadow-md shadow-[#f06232]/35 ring-1 ring-white/25"
              role="status"
              aria-live="polite"
            >
              <Star className="h-4 w-4 shrink-0 text-white" aria-hidden />
              <span>1,000+ SKUs Available</span>
            </div>
            <h1 className="mb-5 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-[56px] lg:leading-[1.08]">
              Built for Operators Who Buy by the Case
            </h1>
            <p className="mb-7 text-lg font-normal leading-relaxed text-white/90 sm:text-xl">
              Distributor-level pricing. No contracts. No games.
            </p>
            <div className="mb-6 flex flex-wrap gap-4">
              <Link
                href="/request-pricing"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#f06232] to-[#f06232] px-8 py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(240, 98, 50,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(240, 98, 50,0.42)]"
              >
                <Tag className="h-4 w-4" />
                Get Distributor Pricing
              </Link>
              <Link
                href="/glove-finder"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-[#f06232]/75 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-[#f06232] backdrop-blur-[2px] transition hover:-translate-y-0.5 hover:border-[#f06232] hover:bg-white/[0.07] hover:text-[#f06232] hover:shadow-md"
              >
                <Bot className="h-4 w-4 opacity-90" />
                Try AI Glove Finder
              </Link>
            </div>
            <div className="mb-8 flex flex-wrap gap-8 text-[15px]">
              <Link href="/request-pricing" className="flex items-center gap-2 font-semibold text-[#f06232] hover:translate-x-1">
                <Bolt className="h-3.5 w-3.5" />
                Request an RFQ in 60 seconds →
              </Link>
              <Link href="/contact" className="flex items-center gap-2 font-medium text-white/70 hover:text-[#f06232]">
                <Headphones className="h-3.5 w-3.5" />
                Talk to a glove specialist →
              </Link>
              <Link href="/#bulk-order" className="flex items-center gap-2 font-medium text-white/70 hover:text-[#f06232]">
                <Boxes className="h-3.5 w-3.5" />
                Start bulk order →
              </Link>
            </div>
            <div className="max-w-[500px] rounded-2xl border-2 border-[#f06232]/35 bg-white p-6 shadow-md">
              <div className="grid grid-cols-3 gap-5 text-center text-sm">
                <div className="rounded-lg p-3.5 transition hover:bg-[#f06232]/10">
                  <FileText className="mx-auto mb-2 h-6 w-6 text-[#f06232]" />
                  <div className="font-semibold text-neutral-900">Net Terms</div>
                  <div className="text-neutral-600">Approved accounts</div>
                </div>
                <div className="rounded-lg p-3.5 transition hover:bg-[#f06232]/10">
                  <Boxes className="mx-auto mb-2 h-6 w-6 text-[#f06232]" />
                  <div className="font-semibold text-neutral-900">Case &amp; Pallet</div>
                  <div className="text-neutral-600">Bulk ordering</div>
                </div>
                <div className="rounded-lg p-3.5 transition hover:bg-[#f06232]/10">
                  <UserRound className="mx-auto mb-2 h-6 w-6 text-[#f06232]" />
                  <div className="font-semibold text-neutral-900">Dedicated Rep</div>
                  <div className="text-neutral-600">Repeat ordering</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <QuickBulkBuilder />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#f06232] to-[#f06232] p-6 text-white shadow-md">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <LineChart className="h-5 w-5" aria-hidden />
                AI Spend Snapshot
              </h3>
              <div className="mb-3.5 space-y-2.5 rounded-lg bg-white/15 px-3 py-3 text-sm leading-relaxed backdrop-blur">
                <p>&quot;You may be overbuying thickness for this task.&quot;</p>
                <p>&quot;Switching from Brand A → Brand B could save ~12%.&quot;</p>
                <p>&quot;Standardize to 2 SKUs to reduce variance.&quot;</p>
              </div>
              <Link
                href="/invoice-savings"
                className="block w-full rounded-xl bg-white py-3 text-center text-sm font-semibold text-[#f06232]"
              >
                Upload Invoice for Savings Suggestions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

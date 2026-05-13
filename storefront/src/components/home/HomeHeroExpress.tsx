import Link from "next/link";
import { Package, Tag, Bot, Bolt, Headphones, FileText, Boxes, UserRound, LineChart } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";

export function HomeHeroExpress() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#111111] via-[#1a1a1a] to-[#0d1117] px-0 pb-16 pt-9 sm:pb-20 sm:pt-11 lg:pb-24 lg:pt-12"
      aria-label="Hero"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(240,98,50,0.06)_0%,transparent_72%)]" />
      <div className="pointer-events-none absolute -bottom-36 -left-36 h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(240,98,50,0.035)_0%,transparent_72%)]" />

      <div className="relative z-[1] mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <div>
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white/90 shadow-sm ring-1 ring-[#f06232]/20"
              role="status"
              aria-live="polite"
            >
              <Package className="h-3.5 w-3.5 shrink-0 text-[#f06232]" aria-hidden />
              <span>B2B programs · case &amp; pallet</span>
            </div>
            <h1 className="mb-4 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-[52px] lg:leading-[1.08]">
              Built for Operators Who Buy by the Case
            </h1>
            <p className="mb-6 text-base font-normal leading-relaxed text-white/88 sm:text-lg">
              Distributor-level pricing. No contracts. No games.
            </p>
            <div className="mb-5 flex flex-wrap gap-3">
              <Link
                href="/request-pricing"
                className="inline-flex items-center gap-2 rounded-xl bg-[#f06232] px-7 py-3.5 text-sm font-bold text-white shadow-[0_6px_20px_rgba(240,98,50,0.28)] transition hover:-translate-y-0.5 hover:bg-[#e5582d] hover:shadow-[0_8px_22px_rgba(240,98,50,0.32)]"
              >
                <Tag className="h-4 w-4" />
                Get Distributor Pricing
              </Link>
              <Link
                href="/glove-finder"
                className="inline-flex items-center gap-2 rounded-xl border border-[#f06232]/55 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-[#f06232] backdrop-blur-[2px] transition hover:-translate-y-0.5 hover:border-[#f06232] hover:bg-white/[0.07] hover:shadow-sm"
              >
                <Bot className="h-4 w-4 opacity-90" />
                Try AI Glove Finder
              </Link>
            </div>
            <div className="mb-7 flex flex-wrap gap-x-7 gap-y-2 text-[14px]">
              <Link href="/request-pricing" className="flex items-center gap-2 font-semibold text-[#f06232] hover:text-[#ff8a5c]">
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
            <div className="max-w-[500px] rounded-2xl border border-[#f06232]/25 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div className="rounded-lg p-3 transition hover:bg-[#f06232]/8">
                  <FileText className="mx-auto mb-1.5 h-5 w-5 text-[#f06232]" />
                  <div className="font-semibold text-neutral-900">Net Terms</div>
                  <div className="text-xs text-neutral-600">Approved accounts</div>
                </div>
                <div className="rounded-lg p-3 transition hover:bg-[#f06232]/8">
                  <Boxes className="mx-auto mb-1.5 h-5 w-5 text-[#f06232]" />
                  <div className="font-semibold text-neutral-900">Case &amp; Pallet</div>
                  <div className="text-xs text-neutral-600">Bulk ordering</div>
                </div>
                <div className="rounded-lg p-3 transition hover:bg-[#f06232]/8">
                  <UserRound className="mx-auto mb-1.5 h-5 w-5 text-[#f06232]" />
                  <div className="font-semibold text-neutral-900">Dedicated Rep</div>
                  <div className="text-xs text-neutral-600">Repeat ordering</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <QuickBulkBuilder />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#f06232] to-[#c94a28] p-5 text-white shadow-md">
              <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
                <LineChart className="h-5 w-5 shrink-0" aria-hidden />
                Invoice intelligence
              </h3>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-white/75">What we review</p>
              <ul className="mb-4 space-y-2 rounded-lg border border-white/15 bg-black/15 px-3 py-3 text-sm leading-snug backdrop-blur-sm">
                <li>Task fit vs. glove thickness and chemistry</li>
                <li>Spend patterns across suppliers and lines</li>
                <li>SKU consolidation where it reduces variance</li>
              </ul>
              <Link
                href="/invoice-savings"
                className="block w-full rounded-xl bg-white py-3 text-center text-sm font-semibold text-[#f06232] shadow-sm transition hover:bg-white/95"
              >
                Upload invoice for review
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

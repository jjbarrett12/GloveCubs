import Link from "next/link";
import { Headphones, Package, Truck } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";

export function HomeHeroExpress() {
  return (
    <section
      className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-[#111111] via-[#151515] to-[#0a0a0a] px-0 pb-16 pt-10 sm:pb-20 sm:pt-12 lg:pb-24 lg:pt-14"
      aria-label="Hero"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(240,98,50,0.07)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(240,98,50,0.04)_0%,transparent_72%)]" />

      <div className="relative z-[1] mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="pointer-events-none absolute right-4 top-0 z-[2] hidden max-w-[min(100%,280px)] sm:block lg:right-8"
          aria-hidden
        >
          <div className="float-right rounded-2xl border border-white/15 bg-gradient-to-br from-[#1a1a1a]/95 to-[#121212]/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_0_1px_rgba(240,98,50,0.12)] backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f06232]/95">Operator-grade catalog</p>
            <p className="mt-1 text-xs font-medium leading-snug text-white/85">
              Spec-grade attributes, governed alternates, and quote workflows—built for procurement teams.
            </p>
          </div>
        </div>

        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#f06232]">
              Industrial & disposable gloves · B2B distributor
            </p>
            <div className="mb-4 sm:hidden">
              <div className="inline-block rounded-xl border border-white/15 bg-gradient-to-br from-[#1a1a1a]/95 to-[#121212]/95 px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.4)]">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#f06232]/95">Operator-grade catalog</p>
                <p className="mt-0.5 text-[11px] font-medium leading-snug text-white/80">
                  Spec-grade attributes and quote workflows for procurement teams.
                </p>
              </div>
            </div>
            <h1 className="mb-4 text-4xl font-black leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[52px]">
              Disposable and work gloves for teams that buy by the case
            </h1>
            <p className="mb-8 max-w-xl text-base font-normal leading-relaxed text-white/75 sm:text-lg">
              Published list pricing when we have it; case and pallet programs through quote review when we don&apos;t. Same
              catalog your operators spec from—without retail checkout noise.
            </p>
            <div className="mb-6 flex flex-wrap gap-3">
              <Link
                href="/store"
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[#f06232] px-7 py-3 text-sm font-bold text-white shadow-[0_6px_20px_rgba(240,98,50,0.28)] transition hover:opacity-[0.97]"
              >
                Shop gloves
              </Link>
              <Link
                href="/request-pricing"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-[#f06232]/70 bg-transparent px-6 py-3 text-sm font-semibold text-[#f06232] transition hover:border-[#f06232] hover:bg-[#f06232]/[0.07]"
              >
                Business pricing
              </Link>
            </div>
            <div className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/55">
              <span className="inline-flex items-center gap-2">
                <Package className="h-4 w-4 text-[#f06232]/90" aria-hidden />
                Case &amp; pallet programs
              </span>
              <span className="inline-flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#f06232]/90" aria-hidden />
                Fulfillment you can plan around
              </span>
              <span className="inline-flex items-center gap-2">
                <Headphones className="h-4 w-4 text-[#f06232]/90" aria-hidden />
                Rep-led follow-up on quotes
              </span>
            </div>
            <div className="max-w-[520px] rounded-xl border border-white/12 bg-[#161616] p-5 sm:p-6">
              <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-white/45">Business buyers</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-center">
                  <div className="text-[12px] font-semibold text-white">Net terms</div>
                  <div className="mt-0.5 text-[11px] text-white/50">Approved accounts</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-center">
                  <div className="text-[12px] font-semibold text-white">Quote cart</div>
                  <div className="mt-0.5 text-[11px] text-white/50">Line-level RFQs</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-center">
                  <Link href="/login" className="text-[12px] font-semibold text-[#f06232] hover:underline">
                    Sign in
                  </Link>
                  <div className="mt-0.5 text-[11px] text-white/50">Account &amp; reorder tools</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:pt-2">
            <QuickBulkBuilder />
            <div className="rounded-xl border border-white/10 bg-[#141414] p-5 sm:p-6">
              <h3 className="text-base font-bold text-white">Already have an invoice?</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                We can line up what you buy today with in-catalog SKUs and governed alternates where they make operational sense—not
                generic substitutions.
              </p>
              <Link
                href="/invoice-savings"
                className="mt-4 inline-flex w-full min-h-11 items-center justify-center rounded-lg border border-[#f06232]/50 bg-[#f06232]/10 px-4 text-sm font-semibold text-[#f06232] transition hover:bg-[#f06232]/15"
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

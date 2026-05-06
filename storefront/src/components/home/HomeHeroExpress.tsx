import Link from "next/link";
import { Tag, FileText, Truck } from "lucide-react";
import { HomeSmartProcurementBuilder } from "@/components/home/HomeSmartProcurementBuilder";

const trustItems = [
  "Distributor pricing",
  "Net terms available",
  "Case & pallet orders",
  "Dedicated rep support",
  "Fast fulfillment",
] as const;

export function HomeHeroExpress() {
  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-[#111111] via-[#161616] to-[#0d0d0d] px-0 pb-14 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12"
      aria-label="Hero"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(255,122,0,0.08)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,122,0,0.04)_0%,transparent_72%)]" />

      <div className="relative z-[1] mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12 xl:gap-14">
          <div className="min-w-0">
            <p className="mb-3 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/75">
              <Truck className="h-3.5 w-3.5 text-[#FF7A00]" aria-hidden />
              Quote-first procurement
            </p>
            <h1 className="mb-3 text-3xl font-black leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.5rem] xl:text-[2.75rem]">
              Built for Teams That Buy Gloves by the Case
            </h1>
            <p className="mb-5 max-w-xl text-sm leading-relaxed text-white/75 sm:text-[15px] lg:max-w-none lg:text-base">
              Restaurants, janitorial companies, healthcare teams, hospitality groups and industrial operators use GloveCubs
              to simplify purchasing, source by the case and request quote-first pricing from real reps.
            </p>

            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/request-pricing"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#FF7A00] to-[#e86800] px-6 text-sm font-bold text-white shadow-[0_6px_20px_rgba(255,122,0,0.3)] transition hover:opacity-[0.97] sm:w-auto sm:min-w-[200px]"
              >
                <Tag className="h-4 w-4 shrink-0" aria-hidden />
                Request Bulk Pricing
              </Link>
              <Link
                href="/invoice-savings"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-white/20 bg-white/[0.04] px-6 text-sm font-semibold text-white transition hover:border-[#FF7A00]/50 hover:bg-white/[0.07] sm:w-auto sm:min-w-[200px]"
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                Upload Invoice
              </Link>
            </div>

            <p className="mb-6 border-l-2 border-[#FF7A00]/50 pl-3 text-[13px] font-medium leading-relaxed text-white/85">
              {trustItems.join(" · ")}
            </p>
            <p className="text-xs text-white/45">
              <Link href="/#procurement-builder" className="text-[#FF7A00] hover:underline">
                Start with the procurement builder
              </Link>
              {" · "}
              <Link href="/store" className="hover:text-white/70">
                Browse catalog
              </Link>
            </p>
          </div>

          <div className="min-w-0 lg:pt-1">
            <HomeSmartProcurementBuilder />
          </div>
        </div>
      </div>
    </section>
  );
}

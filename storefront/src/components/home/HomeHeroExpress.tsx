import Link from "next/link";
import { Package, Truck, Headphones, ShieldCheck, BadgePercent, Boxes, Bot, FileText } from "lucide-react";
import { QuickBulkBuilder } from "@/components/home/QuickBulkBuilder";

const TRUST_CHIPS: { label: string; icon: typeof Package }[] = [
  { label: "Net terms on approved accounts", icon: BadgePercent },
  { label: "Case & pallet quantities", icon: Boxes },
  { label: "Dedicated rep for repeat buys", icon: Headphones },
  { label: "Volume pricing & distributor-direct sourcing", icon: ShieldCheck },
  { label: "Fast fulfillment options", icon: Truck },
  { label: "Same-day ship on qualifying orders", icon: Package },
];

export function HomeHeroExpress() {
  return (
    <section
      className="relative z-0 overflow-hidden bg-gradient-to-b from-[#0c0c0c] via-[#12151c] to-[#0a0c10] px-0 pb-6 pt-10 sm:pb-8 sm:pt-12 lg:pb-10 lg:pt-14"
      aria-label="Hero"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,122,0,0.07)_0%,transparent_72%)]" />
      <div className="pointer-events-none absolute -bottom-36 -left-36 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(255,122,0,0.04)_0%,transparent_72%)]" />
      <div
        className="pointer-events-none absolute inset-y-0 left-[42%] hidden w-[55%] opacity-[0.14] lg:block"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -12deg,
            transparent,
            transparent 48px,
            rgba(255,255,255,0.04) 48px,
            rgba(255,255,255,0.04) 50px
          ),
          linear-gradient(105deg, transparent 0%, rgba(255,122,0,0.06) 45%, transparent 70%)`,
        }}
        aria-hidden
      />

      <div className="relative z-[1] mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-14 lg:items-center">
          <div className="relative">
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c45d00]/35 bg-[#2a1810]/90 px-4 py-1.5 text-xs font-semibold tracking-wide text-[#ffc48a] shadow-sm backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <span className="font-bold text-[#FF7A00]">1,000+</span>
              <span className="text-[#e8d5c8]/90">SKUs · procurement routing, not retail checkout</span>
            </div>
            <h1 className="mb-4 max-w-[22ch] text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[52px]">
              Distributor-level glove pricing without distributor games
            </h1>
            <p className="mb-2 max-w-xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl">
              Built for operators buying <span className="text-white">50–100+ cases per month</span>—restaurants,
              medical, janitorial, and industrial teams.
            </p>
            <p className="mb-8 max-w-xl text-base leading-relaxed text-white/60">
              We help you buy smarter at scale: scoped quotes, specs that match the job, and fulfillment sized to how
              you actually consume gloves.
            </p>

            <div className="mb-8 flex flex-wrap items-center gap-3">
              <Link
                href="#bulk-order"
                className="inline-flex items-center justify-center rounded-2xl bg-[#FF7A00] px-8 py-4 text-base font-bold text-white shadow-[0_14px_40px_rgba(255,122,0,0.38)] transition hover:bg-[#e56e00] hover:shadow-[0_16px_44px_rgba(255,122,0,0.42)]"
              >
                Get bulk pricing
              </Link>
              <Link
                href="/glove-finder"
                className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/[0.06] px-5 py-3.5 text-sm font-semibold text-white/85 backdrop-blur-sm transition hover:border-white/30 hover:bg-white/[0.1]"
              >
                <Bot className="mr-2 h-4 w-4 text-[#c9a06a]" />
                AI glove finder
              </Link>
            </div>

            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">Also available</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/store" className="text-white/55 underline-offset-4 transition hover:text-white/80 hover:underline">
                Browse catalog
              </Link>
              <Link
                href="/invoice-savings"
                className="inline-flex items-center gap-1.5 text-white/55 underline-offset-4 transition hover:text-white/80 hover:underline"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[#c9a06a]" />
                Invoice spend check
              </Link>
              <Link href="/contact" className="text-white/55 underline-offset-4 transition hover:text-white/80 hover:underline">
                Talk to a specialist
              </Link>
            </div>
          </div>

          <div className="relative flex flex-col gap-5 lg:pt-2">
            <QuickBulkBuilder />
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-white/80 shadow-inner shadow-black/20 backdrop-blur-sm">
              <h3 className="mb-2 text-sm font-semibold text-white/90">Have an invoice or SKU list?</h3>
              <p className="mb-3 text-sm leading-relaxed text-white/55">
                Upload for a spend snapshot—we flag thickness mismatches, consolidation wins, and realistic swap paths.
              </p>
              <Link
                href="/invoice-savings"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm font-semibold text-white/90 transition hover:border-[#FF7A00]/35 hover:bg-[#FF7A00]/10"
              >
                Upload invoice
              </Link>
            </div>
          </div>
        </div>

        <div
          className="mt-10 border-t border-white/[0.07] pt-8 lg:mt-14 lg:pt-10"
          aria-label="Trust and fulfillment signals"
        >
          <p className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-[#c9a06a]/90">
            Trusted by procurement-led teams in hospitality, healthcare, janitorial &amp; industrial
          </p>
          <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-2.5 px-0 sm:gap-3">
            {TRUST_CHIPS.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="inline-flex max-w-[min(100%,280px)] items-center gap-2 rounded-full border border-white/[0.08] bg-[#141820]/80 px-3.5 py-2 text-left text-[12px] font-medium leading-snug text-white/75 shadow-sm backdrop-blur-sm sm:max-w-none sm:text-[13px]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[#c9a06a]" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

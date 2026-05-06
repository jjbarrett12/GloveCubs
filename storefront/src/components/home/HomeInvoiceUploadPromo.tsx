import Link from "next/link";
import { FileUp, ShieldCheck, Building2, Headphones, RefreshCw } from "lucide-react";

const bullets = [
  { icon: ShieldCheck, text: "No commitment" },
  { icon: Building2, text: "Built for bulk buyers" },
  { icon: Headphones, text: "Rep-reviewed requests" },
  { icon: RefreshCw, text: "Useful for reorders and price checks" },
] as const;

export function HomeInvoiceUploadPromo() {
  return (
    <section
      className="relative border-y border-white/10 bg-[#080808] py-12 sm:py-14"
      aria-labelledby="invoice-promo-heading"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_80%_0%,rgba(255,122,0,0.08),transparent_50%)]" />
      <div className="relative z-[1] mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
              <FileUp className="h-3.5 w-3.5 text-[#FF7A00]" aria-hidden />
              Invoice review
            </div>
            <h2 id="invoice-promo-heading" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Upload Your Current Glove Invoice
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
              We&apos;ll review what you currently buy and help identify equivalent products, bulk options and quote
              opportunities.
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {bullets.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-sm text-white/80">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#FF7A00]" aria-hidden />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row sm:justify-end lg:w-auto lg:flex-col lg:items-stretch">
            <Link
              href="/invoice-savings"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#FF7A00] px-6 text-center text-sm font-semibold text-white transition hover:bg-[#e56e00] sm:max-w-xs lg:max-w-none"
            >
              Upload Invoice
            </Link>
            <Link
              href="/request-pricing"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] px-6 text-center text-sm font-semibold text-white transition hover:bg-white/[0.08] sm:max-w-xs lg:max-w-none"
            >
              Request Pricing Instead
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

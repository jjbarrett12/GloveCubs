import Link from "next/link";
import { Package, RefreshCw, FileText } from "lucide-react";

export function HomeBusinessBuyerSection() {
  return (
    <section className="border-t border-white/10 bg-[#0d0d0d] px-4 py-12 sm:px-6 sm:py-14 lg:px-8" aria-labelledby="b2b-value-heading">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,380px)] lg:items-center">
          <div>
            <h2 id="b2b-value-heading" className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Built for business buyers—not consumer checkout
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-[15px]">
              Case and pallet context on listings, quote paths when pricing is program-specific, and humans on the other side of
              requests. No toy dashboards—just commerce that respects how facilities and operators actually purchase.
            </p>
          </div>
          <ul className="space-y-4 rounded-xl border border-white/10 bg-[#141414] p-6">
            <li className="flex gap-3 text-sm text-white/85">
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-[#f06232]" aria-hidden />
              <span>
                <strong className="text-white">Pack-aware browsing</strong> — see materials, mil, and use-case signals before you add
                lines to your cart or quote.
              </span>
            </li>
            <li className="flex gap-3 text-sm text-white/85">
              <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-[#f06232]" aria-hidden />
              <span>
                <strong className="text-white">Reorder-friendly</strong> —{" "}
                <Link href="/login" className="font-semibold text-[#f06232] hover:underline">
                  sign in
                </Link>{" "}
                for account tools; build quotes from the store the same way you already buy.
              </span>
            </li>
            <li className="flex gap-3 text-sm text-white/85">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#f06232]" aria-hidden />
              <span>
                <strong className="text-white">Invoice match (optional)</strong> — upload what you run today; we line up catalog
                equivalents where they make operational sense.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

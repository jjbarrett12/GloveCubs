import Link from "next/link";
import { PublicSubpageShell } from "@/components/layout/PublicSubpageShell";
import { INDUSTRIES, INDUSTRY_KEYS, type IndustryKey } from "@/config/industries";
import { getRequestPricingHrefForIntent, getStoreHrefForIntent } from "@/lib/discovery/intent-routes";

export const metadata = {
  title: "Industries | GloveCubs",
  description: "Shop gloves by industry—janitorial, hospitality, healthcare, and industrial.",
};

export default function IndustriesOverviewPage() {
  return (
    <PublicSubpageShell
      title="Shop by industry"
      subtitle="Pick your environment—we will point you to the right specs, case pricing, and reorder paths."
      mainClassName="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {INDUSTRY_KEYS.map((key: IndustryKey) => {
          const cfg = INDUSTRIES[key];
          return (
            <Link
              key={key}
              href={`/industries/${key}`}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-6 transition hover:border-[#FF5500]/50 hover:bg-white/[0.07]"
            >
              <h2 className="text-xl font-semibold text-white">{cfg.name}</h2>
              <p className="mt-2 text-sm text-white/65">{cfg.tagline}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-[#FF5500]">View industry →</span>
            </Link>
          );
        })}
      </div>

      <section id="automotive" className="mt-12 scroll-mt-24 rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-white">Automotive &amp; fleet</h2>
        <p className="mt-2 text-sm text-white/65">
          We group automotive disposables and shop supplies with our industrial catalog. Browse the store and filter by
          task, or send an RFQ for a standardized shop program.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={getStoreHrefForIntent("store.search.automotive")}
            className="inline-flex rounded-lg bg-[#FF5500] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#FF5500]"
          >
            Browse automotive-related gloves
          </Link>
          <Link
            href={getRequestPricingHrefForIntent("rfq.industries.automotive")}
            className="inline-flex rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/90 hover:border-[#FF5500]/50"
          >
            Request pricing
          </Link>
        </div>
      </section>
    </PublicSubpageShell>
  );
}

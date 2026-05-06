import Link from "next/link";
import { PublicSubpageShell } from "@/components/layout/PublicSubpageShell";
import { SITE_PHONE_DISPLAY, SITE_PHONE_TEL_HREF, SITE_SALES_MAILTO_HREF, SITE_SALES_EMAIL } from "@/config/siteContact";

export const metadata = {
  title: "Contact | GloveCubs",
  description: "Call, email, or send a pricing request—GloveCubs supports B2B glove buyers nationwide.",
};

export default function ContactPage() {
  return (
    <PublicSubpageShell
      title="Contact GloveCubs"
      subtitle="Operators, procurement, and safety buyers—reach us directly or open a formal RFQ."
    >
      <div className="space-y-6 text-white/80">
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-white">Phone</h2>
          <p className="mt-2 text-sm">
            <a href={SITE_PHONE_TEL_HREF} className="font-medium text-[#FF5500] hover:underline">
              {SITE_PHONE_DISPLAY}
            </a>{" "}
            <span className="text-white/50">(tap to call)</span>
          </p>
        </section>
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-white">Email</h2>
          <p className="mt-2 text-sm">
            <a href={SITE_SALES_MAILTO_HREF} className="font-medium text-[#FF5500] hover:underline">
              {SITE_SALES_EMAIL}
            </a>
          </p>
        </section>
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-white">Pricing &amp; RFQ</h2>
          <p className="mt-2 text-sm text-white/70">
            For line cards, pallet quotes, or net terms, the fastest path is the structured form—we route by industry and
            volume automatically.
          </p>
          <Link
            href="/request-pricing"
            className="mt-4 inline-flex rounded-lg bg-[#FF5500] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#FF5500]"
          >
            Request pricing
          </Link>
        </section>
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-white">Specialist session</h2>
          <p className="mt-2 text-sm text-white/70">
            Prefer we review specs live? Start an RFQ with context, or email sales with your current SKU list—we will
            respond with options from the active catalog.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/glove-finder"
              className="inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-[#FF5500]/50"
            >
              AI Glove Finder
            </Link>
            <Link
              href="/invoice-savings"
              className="inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-[#FF5500]/50"
            >
              Invoice savings
            </Link>
          </div>
        </section>
      </div>
    </PublicSubpageShell>
  );
}

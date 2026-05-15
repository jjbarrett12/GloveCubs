import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";
import { b2bTierLabel, b2bTierSiteDiscountPercent } from "@/lib/pricing/b2b-tier-meta";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Business pricing | GloveCubs",
  description: "How your company tier relates to published list pricing.",
};

export default async function AccountPricingPage() {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect("/login?next=%2Faccount%2Fpricing");
  }
  if (gate.kind === "no_membership" || gate.kind === "active_company_required") {
    redirect("/account");
  }

  const { data: co, error: coErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("trade_name, b2b_pricing_tier_code")
    .eq("id", gate.session.companyId)
    .maybeSingle();

  const tierCode =
    !coErr && co && typeof co.b2b_pricing_tier_code === "string" ? co.b2b_pricing_tier_code : "cub";
  const tradeName = !coErr && co && typeof co.trade_name === "string" ? co.trade_name : "Your organization";
  const pct = b2bTierSiteDiscountPercent(tierCode);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-4 text-[11px] text-white/45">
          <Link href="/account" className="text-[#f06232]/90 hover:underline">
            Account
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-white/70">Pricing tier</span>
        </nav>

        <h1 className="text-2xl font-bold text-white">Business pricing tier</h1>
        <p className="mt-2 text-sm text-white/65">
          {tradeName} — tier reference from your GloveCubs company record. Final line pricing on quotes and future
          orders is always confirmed server-side; nothing here is a binding quote.
        </p>

        <section className="mt-8 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Your tier</h2>
          <p className="mt-2 text-xl font-bold text-white">{b2bTierLabel(tierCode)}</p>
          <p className="mt-2 text-sm text-white/75">
            {pct != null
              ? `Published site list pricing is reduced by ${pct}% for tier reference calculations (Cub 10%, Grizzly 20%, Kodiak 30%).`
              : "Tier discounts are defined on our servers from your company record."}
          </p>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-white/70">
          <p>
            <strong className="text-white/90">Cub, Grizzly, and Kodiak</strong> are volume program labels. They describe
            how list-based reference amounts are computed for signed-in buyers — not a substitute for a formal quote
            response from our team.
          </p>
          <p>
            We do <strong className="text-white/90">not</strong> calculate commercial totals in your browser. Any
            unit amounts you see in the store while signed in come from server-side resolution against catalog data and
            your company tier.
          </p>
        </section>

        <p className="mt-10 text-sm text-white/55">
          <Link className="font-semibold text-[#f06232] hover:underline" href="/account">
            ← Account home
          </Link>
        </p>
      </main>
    </div>
  );
}

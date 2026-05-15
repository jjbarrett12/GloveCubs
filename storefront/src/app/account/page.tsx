import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";
import { AccountSignOut } from "./AccountSignOut";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { b2bTierLabel, b2bTierSiteDiscountPercent } from "@/lib/pricing/b2b-tier-meta";
import { fetchBuyerAccountSnapshot } from "@/lib/account/buyer-account-snapshot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account | GloveCubs",
  description: "Your GloveCubs business account.",
};

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect("/login?next=%2Faccount");
  }

  const showWorkspace = gate.kind === "ready" || gate.kind === "active_company_required";
  const workspaceHref =
    gate.kind === "active_company_required" ? "/workspace/procurement/active-company" : "/workspace/procurement";
  const adminUser = await getAdminUser();

  let companySummary: { tradeName: string; tierCode: string; discountPct: number | null } | null = null;
  let buyerSnap: Awaited<ReturnType<typeof fetchBuyerAccountSnapshot>> | null = null;
  if (gate.kind === "ready") {
    const { data: co, error: coErr } = await supabase
      .schema("gc_commerce")
      .from("companies")
      .select("trade_name, b2b_pricing_tier_code")
      .eq("id", gate.session.companyId)
      .maybeSingle();
    if (!coErr && co && typeof co.trade_name === "string") {
      const tierCode = typeof co.b2b_pricing_tier_code === "string" ? co.b2b_pricing_tier_code : "cub";
      companySummary = {
        tradeName: co.trade_name,
        tierCode,
        discountPct: b2bTierSiteDiscountPercent(tierCode),
      };
    }
    buyerSnap = await fetchBuyerAccountSnapshot(supabase, gate.session.companyId);
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-white">Account home</h1>
        <p className="mt-2 text-sm text-white/65">
          Sign-in, quotes, and your buyer workspace—everything you need to keep restocks moving.
        </p>

        {adminUser ? (
          <div className="mt-6 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            You are signed in as an operator.{" "}
            <Link className="font-semibold text-[#f06232] underline" href="/admin">
              Open admin console
            </Link>
            .
          </div>
        ) : null}

        {gate.kind === "no_membership" ? (
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Your account is not linked to an organization yet.{" "}
            <Link className="font-semibold text-[#f06232] underline" href="/request-pricing">
              Request business pricing
            </Link>{" "}
            or{" "}
            <Link className="font-semibold text-[#f06232] underline" href="/contact">
              contact support
            </Link>
            .
          </div>
        ) : null}

        {gate.kind === "active_company_required" ? (
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Choose which organization you are buying for to unlock the full dashboard.{" "}
            <Link className="font-semibold text-[#f06232] underline" href="/workspace/procurement/active-company">
              Select active company
            </Link>
            .
          </div>
        ) : null}

        {companySummary && buyerSnap ? (
          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 sm:col-span-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Your organization</h2>
              <p className="mt-1 text-lg font-semibold text-white">{companySummary.tradeName}</p>
              <p className="mt-3 text-xs text-white/45">
                Tier: <span className="font-medium text-white/80">{b2bTierLabel(companySummary.tierCode)}</span>
                {companySummary.discountPct != null ? (
                  <span className="text-white/50"> · {companySummary.discountPct}% off published site list (reference)</span>
                ) : null}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-white/45">
                Unit amounts are resolved on our servers from catalog list pricing and your company tier—never trust
                browser-side math for commercial totals. Formal quote responses from our team remain the contract path.
              </p>
              <p className="mt-2">
                <Link className="text-xs font-semibold text-[#f06232] hover:underline" href="/account/pricing">
                  How pricing tiers work
                </Link>
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Quote requests (linked)</h2>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {buyerSnap.quoteLinkedCount == null ? "—" : buyerSnap.quoteLinkedCount}
              </p>
              <p className="mt-2 text-[10px] leading-snug text-white/40">Submitted while signed in with this company.</p>
            </div>
          </section>
        ) : null}

        {companySummary && buyerSnap && buyerSnap.trustedSpendObservationCount !== null ? (
          <section className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Verified invoice observations</h2>
            <p className="mt-1 text-sm text-white/80">
              <span className="font-semibold tabular-nums">{buyerSnap.trustedSpendObservationCount}</span> trusted line
              observations on file for your company (from reviewed intake — not a financial statement).
            </p>
            <p className="mt-2">
              <Link className="text-xs font-semibold text-[#f06232] hover:underline" href="/workspace/procurement/spend">
                View spend workspace
              </Link>
            </p>
          </section>
        ) : null}

        {buyerSnap && buyerSnap.recentQuotes.length > 0 ? (
          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Recent quote activity</h2>
              <Link href="/account/quotes" className="text-[11px] font-semibold text-[#f06232] hover:underline">
                View all
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-white/10 rounded-lg border border-white/10">
              {buyerSnap.recentQuotes.map((q) => {
                const when = q.submitted_at || q.created_at;
                return (
                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white/90">{q.company_name || "Quote request"}</p>
                      <p className="text-[11px] text-white/45">{when ? new Date(when).toLocaleString() : "—"}</p>
                    </div>
                    <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/75">
                      {q.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {companySummary && buyerSnap && buyerSnap.quoteLinkedCount === 0 ? (
          <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/70">
            <p className="font-medium text-white/85">No quote requests linked yet</p>
            <p className="mt-2 text-xs text-white/50">
              Start a quote request from the cart while signed in with this company, and it will appear here and in
              history.
            </p>
            <p className="mt-3">
              <Link className="font-semibold text-[#f06232] hover:underline" href="/quote-cart">
                Open quote request cart
              </Link>
            </p>
          </div>
        ) : null}

        <section className="mt-10 rounded-lg border border-white/10 bg-black/20 px-4 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Order records</h2>
          <p className="mt-2 text-sm text-white/65">
            Checkout and self-serve payment are not enabled for this account yet. You can open the order records page
            for read-only canonical headers when the feature flag is on; otherwise it explains what is coming next.
          </p>
          <p className="mt-3">
            <Link className="text-sm font-semibold text-[#f06232] hover:underline" href="/account/orders">
              View order records
            </Link>
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Buying & quotes</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/account/orders">
                Order records
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">
                Read-only canonical orders when enabled; otherwise an honest “not available yet” shell.
              </span>
            </li>
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/account/quicklist">
                Glove quicklist
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">
                Company-assigned variants for quote requests (no catalog-wide search).
              </span>
            </li>
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/account/quotes">
                Quote history
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Requests linked to your signed-in company.</span>
            </li>
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/account/pricing">
                Pricing tier explained
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Cub, Grizzly, Kodiak — reference only.</span>
            </li>
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/quote-cart">
                Quote request cart
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Build a line list; our team returns formal pricing.</span>
            </li>
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/store">
                Product catalog
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Browse published gloves and disposables.</span>
            </li>
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/request-pricing">
                Request business pricing
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Volume programs and contract conversations.</span>
            </li>
          </ul>
        </section>

        {showWorkspace ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Workspace</h2>
            <p className="mt-2 text-sm text-white/55">
              Savings, alternates, and reorder shortcuts for your company—available when your account is fully linked.
            </p>
            <p className="mt-3">
              <Link className="font-semibold text-[#f06232] hover:underline" href={workspaceHref}>
                Open buyer workspace
              </Link>
            </p>
          </section>
        ) : null}

        <div className="mt-10">
          <AccountSignOut />
        </div>
      </main>
    </div>
  );
}

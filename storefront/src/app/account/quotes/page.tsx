import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  assertCustomerCompanyAccess,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { fetchBuyerQuoteHistoryWithLines } from "@/lib/account/buyer-account-snapshot";
import { formatShipToLabel } from "@/lib/commerce/ship-to-address-format";
import { buyerQuoteStatusLabel } from "@/lib/procurement/buyer-lifecycle-copy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quote history | GloveCubs",
  description: "Quote requests linked to your GloveCubs company.",
};

export default async function AccountQuotesPage() {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect("/login?next=%2Faccount%2Fquotes");
  }
  if (gate.kind === "no_membership" || gate.kind === "active_company_required") {
    redirect("/account");
  }

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
  if (!allowed) {
    redirect("/account");
  }

  const { error, rows } = await fetchBuyerQuoteHistoryWithLines(supabase, companyId, 100);

  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-white">Quote history</h1>
          <p className="mt-4 text-sm text-red-300">{error}</p>
          <p className="mt-6 text-sm text-white/65">
            <Link className="font-semibold text-[#f06232] underline" href="/account">
              Back to account
            </Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-4 text-[11px] text-white/45">
          <Link href="/account" className="text-[#f06232]/90 hover:underline">
            Account
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-white/70">Quotes</span>
        </nav>

        <h1 className="text-2xl font-bold text-white">Quote history</h1>
        <p className="mt-2 text-sm text-white/65">
          Your organization&apos;s quote requests — formal pricing and fulfillment are confirmed by our team, not in this
          list.
        </p>

        {rows.length === 0 ? (
          <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/70">
            <p className="font-medium text-white/85">No linked quote requests yet</p>
            <p className="mt-2 text-xs text-white/50">
              Build a line list from the catalog or your quicklist, then submit a quote request while signed in with this
              company.
            </p>
            <ul className="mt-4 space-y-2 text-xs">
              <li>
                <Link className="font-semibold text-[#f06232] hover:underline" href="/quote-cart">
                  Open quote request cart
                </Link>
              </li>
              <li>
                <Link className="font-semibold text-[#f06232] hover:underline" href="/store">
                  Browse catalog
                </Link>
              </li>
              <li>
                <Link className="font-semibold text-[#f06232] hover:underline" href="/request-pricing">
                  Request pricing / RFQ
                </Link>
              </li>
            </ul>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.06] text-[11px] font-semibold uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2.5">Submitted</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Delivery</th>
                  <th className="px-3 py-2.5">Company / contact</th>
                  <th className="px-3 py-2.5 text-right">Lines</th>
                  <th className="px-3 py-2.5">Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => {
                  const when = q.submitted_at || q.created_at;
                  const delivery =
                    q.ship_to_snapshot != null
                      ? formatShipToLabel(q.ship_to_label, q.ship_to_snapshot)
                      : "No delivery location provided";
                  return (
                    <tr key={q.id} className="border-b border-white/[0.06] last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-white/70">
                        {when ? new Date(when).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-white/80">
                          {buyerQuoteStatusLabel(q.status)}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5 text-xs text-white/70">
                        <p className="line-clamp-3">{delivery}</p>
                      </td>
                      <td className="max-w-[280px] px-3 py-2.5">
                        <p className="truncate font-medium text-white/90">{q.company_name || "—"}</p>
                        <p className="truncate text-[11px] text-white/50">
                          {q.contact_name || "—"}
                          {q.email ? <span className="text-white/40"> · {q.email}</span> : null}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white/80">{q.line_count}</td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/account/quotes/${encodeURIComponent(q.id)}`}
                          className="font-mono text-[10px] text-[#f06232] hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-sm text-white/55">
          <Link className="font-semibold text-[#f06232] hover:underline" href="/quote-cart">
            Request another quote
          </Link>
          <span className="mx-2 text-white/30">·</span>
          <Link className="font-semibold text-[#f06232] hover:underline" href="/account">
            Back to account home
          </Link>
        </p>
      </main>
    </div>
  );
}

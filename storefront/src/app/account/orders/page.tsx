import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  assertCustomerCompanyAccess,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { fetchBuyerOrdersForCompany, isGcOrderHistoryEnabled } from "@/lib/account/buyer-orders-read-model";
import { formatMinorAmount } from "@/lib/admin/admin-orders-read-model";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order records | GloveCubs",
  description: "Canonical order history for your active company when enabled.",
};

function provenanceLabel(p: string): string {
  if (p === "migrated_legacy") return "Migrated history";
  if (p === "native_gc") return "Native record";
  return "Unknown";
}

export default async function AccountOrdersPage() {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect("/login?next=%2Faccount%2Forders");
  }
  if (gate.kind === "no_membership" || gate.kind === "active_company_required") {
    redirect("/account");
  }

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
  if (!allowed) {
    redirect("/account");
  }

  const flagOn = isGcOrderHistoryEnabled();

  if (!flagOn) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <nav className="mb-4 text-[11px] text-white/45">
            <Link href="/account" className="text-[#f06232]/90 hover:underline">
              Account
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/70">Order records</span>
          </nav>

          <h1 className="text-2xl font-bold text-white">Order history is not available yet</h1>
          <p className="mt-3 max-w-xl text-sm text-white/65">
            We are finishing account setup and checkout flows. The order records you see in admin tools may include
            migrated legacy data; buyer-facing order history stays off until it is trustworthy for every tenant.
          </p>
          <p className="mt-4 max-w-xl text-sm text-white/65">
            For now, use quote history for formal requests, build a line list in the quote request cart, and browse the
            store for published SKUs. Order tracking and self-serve checkout will follow once billing and fulfillment
            wiring is complete.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li>
              <Link className="font-semibold text-[#f06232] hover:underline" href="/account/quotes">
                Quote history
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Requests linked to your signed-in company.</span>
            </li>
            <li>
              <Link className="font-semibold text-[#f06232] hover:underline" href="/quote-cart">
                Quote request cart
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Build a line list for your team to price.</span>
            </li>
            <li>
              <Link className="font-semibold text-[#f06232] hover:underline" href="/store">
                Product catalog
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Browse published gloves and disposables.</span>
            </li>
          </ul>
          <p className="mt-10 text-sm text-white/55">
            <Link className="font-semibold text-[#f06232] hover:underline" href="/account">
              Back to account
            </Link>
          </p>
        </main>
      </div>
    );
  }

  const { error, rows } = await fetchBuyerOrdersForCompany(supabase, companyId, 50);

  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-white">Order records</h1>
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
          <span className="text-white/70">Order records</span>
        </nav>

        <h1 className="text-2xl font-bold text-white">Order records</h1>
        <p className="mt-2 text-sm text-white/65">
          Read-only canonical orders for your active company. May include migrated history—treat line snapshots as the
          historical product truth. Not a financial statement.
        </p>

        {rows.length === 0 ? (
          <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/70">
            <p>No order records linked to this company yet.</p>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-[10px] font-semibold uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2">Order #</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Placed</th>
                  <th className="px-3 py-2 text-right">Total (display)</th>
                  <th className="px-3 py-2 text-right">Lines</th>
                  <th className="px-3 py-2">Provenance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/account/orders/${r.id}`} className="font-medium text-[#f06232] hover:underline">
                        {r.order_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-white/80">{r.status}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-white/55">{new Date(r.placed_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs text-white/90">{formatMinorAmount(r.total_minor, r.currency_code)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-white/70">{r.line_count}</td>
                    <td className="px-3 py-2 text-xs text-white/60">{provenanceLabel(r.provenance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

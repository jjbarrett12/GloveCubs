import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  assertCustomerCompanyAccess,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import {
  fetchBuyerOrderDetailForCompany,
  isGcOrderHistoryEnabled,
  isGcReorderToQuoteEnabled,
  isGcReorderToQuoteFlagOnly,
} from "@/lib/account/buyer-orders-read-model";
import { formatMinorAmount } from "@/lib/admin/admin-orders-read-model";
import { AccountReorderToQuoteClient } from "./AccountReorderToQuoteClient";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function snapshotSummary(snap: Record<string, unknown>): string {
  const keys = ["product_name", "display_name", "name", "sku", "variant_sku", "catalog_v2_product_id", "catalog_product_id"];
  const parts: string[] = [];
  for (const k of keys) {
    const v = snap[k];
    if (v != null && String(v).trim()) parts.push(String(v));
  }
  return parts.length ? parts.join(" · ") : "—";
}

export async function generateMetadata({ params }: { params: { orderId: string } }): Promise<Metadata> {
  return {
    title: `Order ${params.orderId.slice(0, 8)}… | GloveCubs`,
    description: "Read-only order detail for your company.",
  };
}

export default async function AccountOrderDetailPage({ params }: { params: { orderId: string } }) {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }
  if (!UUID_RE.test(params.orderId)) {
    notFound();
  }

  if (!isGcOrderHistoryEnabled() && !isGcReorderToQuoteFlagOnly()) {
    redirect("/account/orders");
  }

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect(`/login?next=%2Faccount%2Forders%2F${encodeURIComponent(params.orderId)}`);
  }
  if (gate.kind === "no_membership" || gate.kind === "active_company_required") {
    redirect("/account");
  }

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
  if (!allowed) {
    redirect("/account");
  }

  const { header, lines, error } = await fetchBuyerOrderDetailForCompany(supabase, params.orderId, companyId);
  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-sm text-red-300">{error}</p>
          <p className="mt-6 text-sm text-white/65">
            <Link className="font-semibold text-[#f06232] underline" href="/account/orders">
              Back to order records
            </Link>
          </p>
        </main>
      </div>
    );
  }
  if (!header) {
    notFound();
  }

  const h = header;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-4 text-[11px] text-white/45">
          <Link href="/account" className="text-[#f06232]/90 hover:underline">
            Account
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/account/orders" className="text-[#f06232]/90 hover:underline">
            Order records
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-white/70">{h.order_number}</span>
        </nav>

        <h1 className="text-2xl font-bold text-white">Order {h.order_number}</h1>
        <p className="mt-2 text-sm text-white/65">
          Read-only record for your active company. Amounts are stored in minor units; this is not a tax invoice or
          finance-approved total.
        </p>

        <section className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/80">
          <dl className="grid gap-2 sm:grid-cols-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Status</dt>
            <dd>{h.status}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Placed</dt>
            <dd>{new Date(h.placed_at).toLocaleString()}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Created</dt>
            <dd>{new Date(h.created_at).toLocaleString()}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Currency</dt>
            <dd className="font-mono text-xs">{h.currency_code}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Total (minor)</dt>
            <dd className="font-mono text-xs">{h.total_minor}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Total (display)</dt>
            <dd>{formatMinorAmount(h.total_minor, h.currency_code)}</dd>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Provenance</dt>
            <dd className="text-xs text-white/70">
              {h.provenance === "migrated_legacy"
                ? "Migrated history"
                : h.provenance === "native_gc"
                  ? "Native record"
                  : "Unknown"}
            </dd>
          </dl>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Order lines</h2>
          <p className="mt-1 text-xs text-white/45">Product snapshot is the historical line truth at capture time.</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-[10px] font-semibold uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2 text-right">Unit (minor)</th>
                  <th className="px-3 py-2 text-right">Line subtotal</th>
                  <th className="px-3 py-2 text-right">Discount</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                  <th className="px-3 py-2 text-right">Line total</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((ln) => (
                  <tr key={ln.id} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-white/80">{ln.line_number}</td>
                    <td className="px-3 py-2 tabular-nums text-white/80">{ln.quantity}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-white/70">{ln.unit_price_minor}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-white/70">{ln.line_subtotal_minor}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-white/70">{ln.discount_minor}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-white/70">{ln.tax_minor}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-white/80">{ln.total_minor}</td>
                    <td className="max-w-[200px] px-3 py-2 font-mono text-[10px] text-white/50">{ln.sellable_product_id}</td>
                    <td className="max-w-[220px] px-3 py-2 text-xs text-white/75">{snapshotSummary(ln.product_snapshot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lines.length > 0 ? (
            <details className="mt-4 rounded border border-white/10 bg-white/[0.02] px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-[#f06232]/90">Line snapshot JSON</summary>
              <pre className="mt-2 max-h-64 overflow-auto text-[10px] text-white/60">{JSON.stringify(lines.map((l) => l.product_snapshot), null, 2)}</pre>
            </details>
          ) : null}
        </section>

        {isGcReorderToQuoteEnabled() && lines.length > 0 ? (
          <AccountReorderToQuoteClient
            orderId={h.id}
            orderNumber={h.order_number}
            currencyCode={h.currency_code}
            lines={lines.map((ln) => ({
              id: ln.id,
              lineNumber: ln.line_number,
              quantity: ln.quantity,
              unitPriceMinor: ln.unit_price_minor,
              label: snapshotSummary(ln.product_snapshot),
            }))}
          />
        ) : null}
      </main>
    </div>
  );
}

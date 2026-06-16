import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  assertCustomerCompanyAccess,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { fetchBuyerQuoteDetail, snapshotProductLabel } from "@/lib/account/buyer-account-snapshot";
import { formatShipToLabel } from "@/lib/commerce/ship-to-address-format";
import { buyerLifecycleStageLabel, buyerQuoteStatusLabel } from "@/lib/procurement/buyer-lifecycle-copy";

export const dynamic = "force-dynamic";

type PageProps = { params: { quoteId: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: "Quote request | GloveCubs",
    description: "Quote request detail for your organization.",
  };
}

function snapshotAttr(snapshot: Record<string, unknown>, key: string): string | null {
  const v = snapshot[key];
  if (v == null || v === "") return null;
  return String(v);
}

export default async function AccountQuoteDetailPage({ params }: PageProps) {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }

  const quoteId = params.quoteId?.trim();
  if (!quoteId) notFound();

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect(`/login?next=${encodeURIComponent(`/account/quotes/${quoteId}`)}`);
  }
  if (gate.kind === "no_membership" || gate.kind === "active_company_required") {
    redirect("/account");
  }

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
  if (!allowed) {
    redirect("/account");
  }

  const { error, notFound: missing, detail } = await fetchBuyerQuoteDetail(supabase, companyId, quoteId);

  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <nav className="mb-4 text-[11px] text-white/45">
            <Link href="/account" className="text-[#f06232]/90 hover:underline">
              Account
            </Link>
            <span className="mx-1.5">/</span>
            <Link href="/account/quotes" className="text-[#f06232]/90 hover:underline">
              Quote history
            </Link>
          </nav>
          <h1 className="text-2xl font-bold text-white">Quote request</h1>
          <p className="mt-4 text-sm text-red-300">{error}</p>
        </main>
      </div>
    );
  }

  if (missing || !detail) {
    notFound();
  }

  const { quote, lines, linkedOpportunity, timeline } = detail;
  const when = quote.submitted_at || quote.created_at;
  const delivery =
    quote.ship_to_snapshot != null
      ? formatShipToLabel(quote.ship_to_label, quote.ship_to_snapshot)
      : "No delivery location provided";

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-4 text-[11px] text-white/45">
          <Link href="/account" className="text-[#f06232]/90 hover:underline">
            Account
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/account/quotes" className="text-[#f06232]/90 hover:underline">
            Quote history
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-white/70">Request</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Quote request</h1>
            <p className="mt-2 text-sm text-white/65">
              Submitted {when ? new Date(when).toLocaleString() : "—"} · Formal pricing and fulfillment are confirmed by
              our team — this is not an order total.
            </p>
          </div>
          <span className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/85">
            {buyerQuoteStatusLabel(quote.status)}
          </span>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Contact</h2>
            <p className="mt-2 text-white/85">{quote.contact_name || "—"}</p>
            <p className="text-xs text-white/50">{quote.email || "—"}</p>
            {quote.phone ? <p className="text-xs text-white/50">{quote.phone}</p> : null}
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Delivery context</h2>
            <p className="mt-2 text-xs leading-relaxed text-white/70">{delivery}</p>
          </div>
        </section>

        {linkedOpportunity ? (
          <section className="mt-4 rounded-lg border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-100/70">Sourcing thread</h2>
            <p className="mt-2 text-white/80">
              Status:{" "}
              <span className="font-medium">{buyerLifecycleStageLabel(linkedOpportunity.lifecycle_stage)}</span>
            </p>
            <p className="mt-2">
              <Link
                href={`/workspace/procurement/opportunities/${linkedOpportunity.id}`}
                className="text-xs font-semibold text-sky-300 hover:underline"
              >
                Open sourcing thread in workspace
              </Link>
            </p>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Line items</h2>
          {lines.length === 0 ? (
            <p className="mt-3 text-sm text-white/55">No line items were saved with this request.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/10 rounded-lg border border-white/10">
              {lines.map((line) => {
                const snap = line.product_snapshot;
                const label = snapshotProductLabel(snap);
                const brand = snapshotAttr(snap, "brand");
                const sku = snapshotAttr(snap, "variant_sku");
                const size = snapshotAttr(snap, "size_code");
                const slug = snapshotAttr(snap, "slug");
                return (
                  <li key={line.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-white/90">{label}</p>
                      <p className="tabular-nums text-white/75">Qty {line.quantity}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-white/45">
                      {[brand, sku ? `SKU ${sku}` : null, size ? `Size ${size}` : null].filter(Boolean).join(" · ") ||
                        "Catalog-backed line"}
                    </p>
                    {line.notes ? <p className="mt-1 text-xs text-white/55">Note: {line.notes}</p> : null}
                    {slug ? (
                      <p className="mt-2">
                        <Link href={`/store/p/${encodeURIComponent(slug)}`} className="text-xs text-[#f06232] hover:underline">
                          View catalog listing
                        </Link>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {quote.notes ? (
          <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Your notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-white/70">{quote.notes}</p>
          </section>
        ) : null}

        {timeline.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Activity</h2>
            <ul className="mt-3 space-y-2">
              {timeline.map((ev) => (
                <li key={ev.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
                  <p className="font-medium text-white/85">{ev.headline}</p>
                  {ev.detail ? <p className="mt-1 text-white/50">{ev.detail}</p> : null}
                  <p className="mt-1 text-[10px] text-white/35">
                    {ev.occurred_at ? new Date(ev.occurred_at).toLocaleString() : "—"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-10 rounded-lg border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/70">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Need changes?</h2>
          <p className="mt-2 text-xs text-white/55">
            Submit a new quote request with updated lines, or contact your procurement team with reference{" "}
            <span className="font-mono text-white/70">{quote.id}</span>.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/quote-cart"
              className="inline-flex rounded-lg bg-[#f06232] px-4 py-2 text-xs font-semibold text-white hover:bg-[#f06232]/90"
            >
              Build a new quote request
            </Link>
            <Link href="/contact" className="inline-flex text-xs font-semibold text-[#f06232] underline">
              Contact support
            </Link>
          </div>
        </section>

        <p className="mt-8 font-mono text-[10px] text-white/35">Reference: {quote.id}</p>
      </main>
    </div>
  );
}

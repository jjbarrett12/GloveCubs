import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageSection } from "@/components/admin";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAdminOrderDetail, formatMinorAmount, type OrderProvenance } from "@/lib/admin/admin-orders-read-model";
import { buildReorderQuotePayload } from "@/lib/account/reorder-to-quote-read-model";

export const dynamic = "force-dynamic";

function provenanceLabel(p: OrderProvenance): string {
  if (p === "migrated_legacy") return "Migrated legacy";
  if (p === "native_gc") return "Native record";
  return "Unknown";
}

function snapshotSummary(snap: Record<string, unknown>): string {
  const keys = ["product_name", "display_name", "name", "sku", "variant_sku", "catalog_v2_product_id", "catalog_product_id"];
  const parts: string[] = [];
  for (const k of keys) {
    const v = snap[k];
    if (v != null && String(v).trim()) parts.push(`${String(v)}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

export async function generateMetadata({ params }: { params: { orderId: string } }) {
  return { title: `Order ${params.orderId.slice(0, 8)}… | GloveCubs admin`, robots: { index: false, follow: false } as const };
}

export default async function AdminOrderDetailPage({ params }: { params: { orderId: string } }) {
  if (!isSupabaseConfigured()) notFound();

  const supabase = getSupabaseAdmin() as any;
  const { header, lines, error } = await fetchAdminOrderDetail(supabase, params.orderId);
  if (error) {
    return (
      <div>
        <PageHeader title="Order record" description={error} />
        <Link href="/admin/orders" className="text-sm text-blue-700 hover:underline">
          ← Order records
        </Link>
      </div>
    );
  }
  if (!header) notFound();

  const h = header;
  const metaJson = JSON.stringify(h.metadata, null, 2);
  const shipJson = h.shipping_address != null ? JSON.stringify(h.shipping_address, null, 2) : null;

  const reorderDry = await buildReorderQuotePayload(supabase, h.company_id, params.orderId);

  return (
    <div>
      <nav className="mb-3 text-sm text-gray-500">
        <Link href="/admin/orders" className="font-medium text-blue-700 hover:underline">
          Order records
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-800">{h.order_number}</span>
      </nav>

      <PageHeader
        title={`Order ${h.order_number}`}
        description="Read-only canonical order header. Amounts are stored minor units; payment and fulfillment fields reflect recorded state only."
      />

      <PageSection title="Summary">
        <dl className="grid max-w-2xl gap-2 text-sm sm:grid-cols-2">
          <dt className="text-gray-500">Company</dt>
          <dd className="text-gray-900">
            {h.company_trade_name || "—"}{" "}
            <span className="block font-mono text-xs text-gray-400">{h.company_id}</span>
          </dd>
          <dt className="text-gray-500">Status</dt>
          <dd>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase text-gray-800">{h.status}</span>
          </dd>
          <dt className="text-gray-500">Provenance</dt>
          <dd className="text-gray-800">
            {provenanceLabel(h.provenance)}
            {h.legacy_order_id != null ? (
              <span className="ml-2 font-mono text-xs text-gray-500">legacy public.orders id: {h.legacy_order_id}</span>
            ) : null}
          </dd>
          <dt className="text-gray-500">Placed</dt>
          <dd className="text-gray-800">{new Date(h.placed_at).toLocaleString()}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd className="text-gray-800">{new Date(h.created_at).toLocaleString()}</dd>
          <dt className="text-gray-500">Updated</dt>
          <dd className="text-gray-800">{new Date(h.updated_at).toLocaleString()}</dd>
          <dt className="text-gray-500">Currency</dt>
          <dd className="font-mono">{h.currency_code}</dd>
          <dt className="text-gray-500">Subtotal (minor)</dt>
          <dd className="font-mono">{h.subtotal_minor}</dd>
          <dt className="text-gray-500">Discount (minor)</dt>
          <dd className="font-mono">{h.discount_minor}</dd>
          <dt className="text-gray-500">Shipping (minor)</dt>
          <dd className="font-mono">{h.shipping_minor}</dd>
          <dt className="text-gray-500">Tax (minor)</dt>
          <dd className="font-mono">{h.tax_minor}</dd>
          <dt className="text-gray-500">Total (minor)</dt>
          <dd className="font-mono">{h.total_minor}</dd>
          <dt className="text-gray-500">Total (formatted)</dt>
          <dd className="font-medium text-gray-900">{formatMinorAmount(h.total_minor, h.currency_code)}</dd>
        </dl>
      </PageSection>

      <PageSection title="Recorded payment state">
        <ul className="list-inside list-disc text-sm text-gray-700">
          <li>Stripe PaymentIntent: {h.stripe_payment_intent_id || "—"}</li>
          <li>Payment method: {h.payment_method || "—"}</li>
          <li>Payment confirmed at: {h.payment_confirmed_at ? new Date(h.payment_confirmed_at).toLocaleString() : "—"}</li>
          <li>Payment integrity hold: {h.payment_integrity_hold == null ? "—" : h.payment_integrity_hold ? "Yes" : "No"}</li>
        </ul>
      </PageSection>

      <PageSection title="Recorded fulfillment / inventory timestamps">
        <ul className="list-inside list-disc text-sm text-gray-700">
          <li>Reserved: {h.inventory_reserved_at ? new Date(h.inventory_reserved_at).toLocaleString() : "—"}</li>
          <li>Released: {h.inventory_released_at ? new Date(h.inventory_released_at).toLocaleString() : "—"}</li>
          <li>Deducted: {h.inventory_deducted_at ? new Date(h.inventory_deducted_at).toLocaleString() : "—"}</li>
        </ul>
      </PageSection>

      <PageSection title="Invoice fields (Net30 / AR when used)">
        <ul className="list-inside list-disc text-sm text-gray-700">
          <li>Invoice status: {h.invoice_status || "—"}</li>
          <li>Amount due: {h.invoice_amount_due ?? "—"}</li>
          <li>Amount paid: {h.invoice_amount_paid ?? "—"}</li>
          <li>Due at: {h.invoice_due_at ? new Date(h.invoice_due_at).toLocaleString() : "—"}</li>
        </ul>
      </PageSection>

      <PageSection title="Identifiers">
        <p className="font-mono text-xs text-gray-600">Order id: {h.id}</p>
        <p className="mt-1 font-mono text-xs text-gray-600">Created by user: {h.created_by_user_id || "—"}</p>
        <p className="mt-1 font-mono text-xs text-gray-600">Idempotency key: {h.idempotency_key || "—"}</p>
      </PageSection>

      <PageSection title="Operator metadata">
        <details className="rounded border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">metadata (JSON)</summary>
          <pre className="mt-2 max-h-64 overflow-auto text-xs text-gray-800">{metaJson}</pre>
        </details>
        {shipJson ? (
          <details className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-800">shipping_address (JSON)</summary>
            <pre className="mt-2 max-h-64 overflow-auto text-xs text-gray-800">{shipJson}</pre>
          </details>
        ) : null}
      </PageSection>

      {reorderDry.payload ? (
        <PageSection title="Reorder-to-quote mapping (read-only indicator)">
          <p className="text-sm text-gray-600">
            Dry run for buyer quote cart: how many lines would add as catalog-backed quote lines vs need review or are
            blocked. No writes.
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-gray-800">
            <li>Available: {reorderDry.payload.summary.available}</li>
            <li>Needs review: {reorderDry.payload.summary.needs_review}</li>
            <li>Unavailable: {reorderDry.payload.summary.unavailable}</li>
            <li>Snapshot-only: {reorderDry.payload.summary.snapshot_only}</li>
          </ul>
        </PageSection>
      ) : null}

      <PageSection title="Order lines">
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2 text-right">Unit (minor)</th>
                <th className="px-3 py-2 text-right">Line subtotal</th>
                <th className="px-3 py-2 text-right">Line total</th>
                <th className="px-3 py-2">Sellable product</th>
                <th className="px-3 py-2">Snapshot summary</th>
                <th className="px-3 py-2">Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => (
                <tr key={ln.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{ln.line_number}</td>
                  <td className="px-3 py-2 tabular-nums">{ln.quantity}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{ln.unit_price_minor}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{ln.line_subtotal_minor}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{ln.total_minor}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-gray-600">{ln.sellable_product_id}</td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-gray-800">{snapshotSummary(ln.product_snapshot)}</td>
                  <td className="px-3 py-2">
                    <details>
                      <summary className="cursor-pointer text-xs text-blue-700">JSON</summary>
                      <pre className="mt-1 max-h-40 max-w-xs overflow-auto text-[10px] text-gray-700">
                        {JSON.stringify(ln.product_snapshot, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>
    </div>
  );
}

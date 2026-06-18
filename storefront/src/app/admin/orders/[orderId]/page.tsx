import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PremiumSectionCard,
  StatusBadge,
  TableCard,
} from "@/components/admin";
import { DetailTableShell, adminTableRowHover } from "@/components/admin/DetailTableShell";
import {
  adminLink,
  adminMutedPanel,
  adminTableCell,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAdminOrderDetail, formatMinorAmount, type OrderProvenance } from "@/lib/admin/admin-orders-read-model";
import { buildReorderQuotePayload } from "@/lib/account/reorder-to-quote-read-model";
import { OrderOperatorActions } from "./OrderOperatorActions";

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

function SummaryField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-semibold uppercase tracking-wide text-admin-muted">{label}</dt>
      <dd className={cn(adminTableCell, "text-sm")}>{children}</dd>
    </>
  );
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
        <PageHeader
          title="Order record"
          breadcrumb={[{ label: "Order records", href: "/admin/orders" }]}
        />
        <ErrorState title="Could not load order" message={error} />
        <Link href="/admin/orders" className={cn("mt-4 inline-block text-sm", adminLink)}>
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
      <PageHeader
        title={`Order ${h.order_number}`}
        description="Canonical order record. Amounts are stored minor units; fulfillment actions use the transitional Express admin API."
        breadcrumb={[
          { label: "Order records", href: "/admin/orders" },
          { label: h.order_number },
        ]}
      />

      <div className="mb-8">
        <OrderOperatorActions
          orderId={h.id}
          currentStatus={h.status}
          paymentMethod={h.payment_method}
          paymentIntegrityHold={h.payment_integrity_hold}
          invoiceAmountDue={h.invoice_amount_due}
          invoiceAmountPaid={h.invoice_amount_paid}
          trackingNumber={typeof h.metadata.tracking_number === "string" ? h.metadata.tracking_number : ""}
          trackingUrl={typeof h.metadata.tracking_url === "string" ? h.metadata.tracking_url : ""}
        />
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <PremiumSectionCard title="Summary" dense>
          <dl className="grid gap-3 sm:grid-cols-2">
            <SummaryField label="Company">
              {h.company_trade_name || "—"}
              <span className="block font-mono text-xs text-admin-muted">{h.company_id}</span>
            </SummaryField>
            <SummaryField label="Status">
              <StatusBadge status={h.status} />
            </SummaryField>
            <SummaryField label="Provenance">
              {provenanceLabel(h.provenance)}
              {h.legacy_order_id != null ? (
                <span className="ml-2 font-mono text-xs text-admin-muted">
                  legacy public.orders id: {h.legacy_order_id}
                </span>
              ) : null}
            </SummaryField>
            <SummaryField label="Placed">{new Date(h.placed_at).toLocaleString()}</SummaryField>
            <SummaryField label="Created">{new Date(h.created_at).toLocaleString()}</SummaryField>
            <SummaryField label="Updated">{new Date(h.updated_at).toLocaleString()}</SummaryField>
            <SummaryField label="Currency">
              <span className="font-mono">{h.currency_code}</span>
            </SummaryField>
            <SummaryField label="Total (formatted)">
              <span className="font-medium">{formatMinorAmount(h.total_minor, h.currency_code)}</span>
            </SummaryField>
          </dl>
        </PremiumSectionCard>

        <PremiumSectionCard title="Amounts (minor units)" dense>
          <dl className="grid gap-3 sm:grid-cols-2">
            <SummaryField label="Subtotal">
              <span className="font-mono">{h.subtotal_minor}</span>
            </SummaryField>
            <SummaryField label="Discount">
              <span className="font-mono">{h.discount_minor}</span>
            </SummaryField>
            <SummaryField label="Shipping">
              <span className="font-mono">{h.shipping_minor}</span>
            </SummaryField>
            <SummaryField label="Tax">
              <span className="font-mono">{h.tax_minor}</span>
            </SummaryField>
            <SummaryField label="Total">
              <span className="font-mono">{h.total_minor}</span>
            </SummaryField>
          </dl>
        </PremiumSectionCard>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <PremiumSectionCard title="Recorded payment state" dense>
          <ul className="list-inside list-disc space-y-1 text-sm text-admin-secondary">
            <li>Stripe PaymentIntent: {h.stripe_payment_intent_id || "—"}</li>
            <li>Payment method: {h.payment_method || "—"}</li>
            <li>
              Payment confirmed at:{" "}
              {h.payment_confirmed_at ? new Date(h.payment_confirmed_at).toLocaleString() : "—"}
            </li>
            <li>
              Payment integrity hold:{" "}
              {h.payment_integrity_hold == null ? "—" : h.payment_integrity_hold ? "Yes" : "No"}
            </li>
          </ul>
        </PremiumSectionCard>

        <PremiumSectionCard title="Recorded fulfillment / inventory timestamps" dense>
          <ul className="list-inside list-disc space-y-1 text-sm text-admin-secondary">
            <li>Reserved: {h.inventory_reserved_at ? new Date(h.inventory_reserved_at).toLocaleString() : "—"}</li>
            <li>Released: {h.inventory_released_at ? new Date(h.inventory_released_at).toLocaleString() : "—"}</li>
            <li>Deducted: {h.inventory_deducted_at ? new Date(h.inventory_deducted_at).toLocaleString() : "—"}</li>
          </ul>
        </PremiumSectionCard>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <PremiumSectionCard title="Invoice fields (Net30 / AR when used)" dense>
          <ul className="list-inside list-disc space-y-1 text-sm text-admin-secondary">
            <li>Invoice status: {h.invoice_status || "—"}</li>
            <li>Amount due: {h.invoice_amount_due ?? "—"}</li>
            <li>Amount paid: {h.invoice_amount_paid ?? "—"}</li>
            <li>Due at: {h.invoice_due_at ? new Date(h.invoice_due_at).toLocaleString() : "—"}</li>
          </ul>
        </PremiumSectionCard>

        <PremiumSectionCard title="Identifiers" dense>
          <p className="font-mono text-xs text-admin-muted">Order id: {h.id}</p>
          <p className="mt-1 font-mono text-xs text-admin-muted">Created by user: {h.created_by_user_id || "—"}</p>
          <p className="mt-1 font-mono text-xs text-admin-muted">Idempotency key: {h.idempotency_key || "—"}</p>
        </PremiumSectionCard>
      </div>

      <PremiumSectionCard title="Operator metadata" className="mb-8">
        <details className={cn(adminMutedPanel, "p-3")}>
          <summary className="cursor-pointer text-sm font-medium text-admin-primary">metadata (JSON)</summary>
          <pre className="mt-2 max-h-64 overflow-auto text-xs text-admin-secondary">{metaJson}</pre>
        </details>
        {shipJson ? (
          <details className={cn(adminMutedPanel, "mt-3 p-3")}>
            <summary className="cursor-pointer text-sm font-medium text-admin-primary">shipping_address (JSON)</summary>
            <pre className="mt-2 max-h-64 overflow-auto text-xs text-admin-secondary">{shipJson}</pre>
          </details>
        ) : null}
      </PremiumSectionCard>

      {reorderDry.payload ? (
        <PremiumSectionCard
          title="Reorder-to-quote mapping (read-only indicator)"
          description="Dry run for buyer quote cart: how many lines would add as catalog-backed quote lines vs need review or are blocked. No writes."
          className="mb-8"
        >
          <ul className="list-inside list-disc text-sm text-admin-primary">
            <li>Available: {reorderDry.payload.summary.available}</li>
            <li>Needs review: {reorderDry.payload.summary.needs_review}</li>
            <li>Unavailable: {reorderDry.payload.summary.unavailable}</li>
            <li>Snapshot-only: {reorderDry.payload.summary.snapshot_only}</li>
          </ul>
        </PremiumSectionCard>
      ) : null}

      <PremiumSectionCard title="Order lines">
        <TableCard>
          {lines.length === 0 ? (
            <EmptyState title="No line items" description="This order has no recorded line items." />
          ) : (
            <DetailTableShell
              minWidth="min-w-[900px]"
              headers={[
                { label: "#" },
                { label: "Qty" },
                { label: "Unit (minor)", align: "right" },
                { label: "Line subtotal", align: "right" },
                { label: "Line total", align: "right" },
                { label: "Sellable product" },
                { label: "Snapshot summary" },
                { label: "Snapshot" },
              ]}
            >
              {lines.map((ln) => (
                <tr key={ln.id} className={adminTableRowHover}>
                  <td className={cn(adminTableCell, "px-3 py-2 font-mono text-xs")}>{ln.line_number}</td>
                  <td className={cn(adminTableCell, "px-3 py-2 tabular-nums")}>{ln.quantity}</td>
                  <td className={cn(adminTableCell, "px-3 py-2 text-right font-mono text-xs")}>{ln.unit_price_minor}</td>
                  <td className={cn(adminTableCell, "px-3 py-2 text-right font-mono text-xs")}>
                    {ln.line_subtotal_minor}
                  </td>
                  <td className={cn(adminTableCell, "px-3 py-2 text-right font-mono text-xs")}>{ln.total_minor}</td>
                  <td className={cn(adminTableCell, "px-3 py-2 font-mono text-[10px] text-admin-muted")}>
                    {ln.sellable_product_id}
                  </td>
                  <td className={cn(adminTableCell, "max-w-[220px] px-3 py-2 text-xs")}>
                    {snapshotSummary(ln.product_snapshot)}
                  </td>
                  <td className={cn(adminTableCell, "px-3 py-2")}>
                    <details>
                      <summary className={cn("cursor-pointer text-xs", adminLink)}>JSON</summary>
                      <pre className="mt-1 max-h-40 max-w-xs overflow-auto text-[10px] text-admin-secondary">
                        {JSON.stringify(ln.product_snapshot, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </DetailTableShell>
          )}
        </TableCard>
      </PremiumSectionCard>
    </div>
  );
}

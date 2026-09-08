import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState, PageHeader, PremiumSectionCard, StatusBadge, TableCard } from "@/components/admin";
import { DetailTableShell } from "@/components/admin/DetailTableShell";
import { adminLink, adminTableCell, adminTableHeadCell, adminTableRowHover } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { quoteStatusRequiresAction } from "@/lib/admin/launch-ops-status";
import { formatShipToLabel } from "@/lib/commerce/ship-to-address-format";
import { describeQuoteStatusForOperator } from "@/lib/procurement/operator-lifecycle-copy";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { QuoteStatusForm } from "./QuoteStatusForm";

export const dynamic = "force-dynamic";

type QuoteLine = {
  id: string;
  quantity: number;
  notes: string | null;
  product_snapshot: Record<string, unknown> | null;
};

function productName(snapshot: Record<string, unknown> | null): string {
  if (!snapshot) return "—";
  for (const k of ["name", "display_name", "product_name"]) {
    const v = snapshot[k];
    if (v != null && String(v).trim()) return String(v);
  }
  return "—";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-semibold uppercase tracking-wide text-admin-muted">{label}</dt>
      <dd className={cn(adminTableCell, "text-sm")}>{children}</dd>
    </>
  );
}

export default async function AdminLeadDetailPage({ params }: { params: { id: string } }) {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Quote request" description="Sign in as an admin operator." />
      </div>
    );
  }

  if (!isSupabaseConfigured()) notFound();

  const supabase = getSupabaseAdmin() as any;
  const { data: quote, error: quoteErr } = await supabase
    .schema("catalogos")
    .from("quote_requests")
    .select(
      "id, status, contact_name, email, company_name, phone, notes, created_at, updated_at, ship_to_address_id, ship_to_label, ship_to_snapshot",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (quoteErr) {
    return (
      <div>
        <PageHeader title="Quote request" breadcrumb={[{ label: "Quote requests", href: "/admin/leads" }]} />
        <ErrorState title="Could not load quote request" message={quoteErr.message} />
      </div>
    );
  }
  if (!quote) notFound();

  const { data: lines } = await supabase
    .schema("catalogos")
    .from("quote_line_items")
    .select("id, quantity, notes, product_snapshot")
    .eq("quote_request_id", params.id)
    .order("created_at");

  const lineRows = (lines ?? []) as QuoteLine[];
  const statusCopy = describeQuoteStatusForOperator(quote.status);

  return (
    <div>
      <PageHeader
        title={quote.company_name || "Quote request"}
        description={`Request ${quote.id.slice(0, 8)}…`}
        breadcrumb={[
          { label: "Quote requests", href: "/admin/leads" },
          { label: quote.company_name || quote.id.slice(0, 8) + "…" },
        ]}
      />

      <PremiumSectionCard title="Contact & delivery">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={quote.status} />
              {quoteStatusRequiresAction(quote.status) ? (
                <span className="text-xs font-medium text-admin-warning">Needs action</span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-admin-muted">{statusCopy.actionHint}</p>
          </Field>
          <Field label="Buyer sees">{statusCopy.buyerSees}</Field>
          <Field label="Contact">{quote.contact_name}</Field>
          <Field label="Email">
            <a href={`mailto:${quote.email}`} className={adminLink}>
              {quote.email}
            </a>
          </Field>
          <Field label="Phone">{quote.phone ?? "—"}</Field>
          <Field label="Created">{new Date(quote.created_at).toLocaleString()}</Field>
          <Field label="Ship to">
            {quote.ship_to_snapshot != null
              ? formatShipToLabel(quote.ship_to_label, quote.ship_to_snapshot)
              : "—"}
          </Field>
        </dl>
        {quote.notes ? (
          <div className="mt-4 border-t border-admin-border-subtle pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-admin-secondary">{quote.notes}</p>
          </div>
        ) : null}
        <QuoteStatusForm quoteId={quote.id} currentStatus={quote.status} />
      </PremiumSectionCard>

      <PremiumSectionCard title="Line items" className="mt-6">
        {lineRows.length === 0 ? (
          <EmptyState title="No line items" description="This quote request has no catalog line items." />
        ) : (
          <TableCard>
            <DetailTableShell
              headers={[
                { label: "Product" },
                { label: "Qty" },
                { label: "Notes" },
              ]}
            >
              {lineRows.map((line) => (
                <tr key={line.id} className={adminTableRowHover}>
                  <td className={adminTableCell}>{productName(line.product_snapshot)}</td>
                  <td className={adminTableCell}>{line.quantity}</td>
                  <td className={adminTableCell}>{line.notes ?? "—"}</td>
                </tr>
              ))}
            </DetailTableShell>
          </TableCard>
        )}
      </PremiumSectionCard>

      <Link href="/admin/leads" className={cn("mt-4 inline-block text-sm", adminLink)}>
        ← Quote requests
      </Link>
    </div>
  );
}

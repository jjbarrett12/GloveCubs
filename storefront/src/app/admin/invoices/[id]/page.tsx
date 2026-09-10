import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState, PageHeader, PremiumSectionCard, StatusBadge, TableCard } from "@/components/admin";
import { DetailTableShell } from "@/components/admin/DetailTableShell";
import { adminAlertSurface, adminLink, adminTableCell, adminTableHeadCell, adminTableRowHover } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { invoiceOpsRequiresAction } from "@/lib/admin/launch-ops-status";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { InvoiceOpsStatusForm } from "./InvoiceOpsStatusForm";
import { InvoiceLineReviewPanel, type InvoiceLineReviewRow } from "./InvoiceLineReviewPanel";

export const dynamic = "force-dynamic";

type ExtractLine = {
  description?: string;
  quantity?: number;
  unit_price?: number | null;
  total?: number | null;
  sku_or_code?: string | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-semibold uppercase tracking-wide text-admin-muted">{label}</dt>
      <dd className={cn(adminTableCell, "text-sm")}>{children}</dd>
    </>
  );
}

export default async function AdminInvoiceDetailPage({ params }: { params: { id: string } }) {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Invoice intake" description="Sign in as an admin operator." />
      </div>
    );
  }

  if (!isSupabaseConfigured()) notFound();

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("uploaded_invoices")
    .select(
      "id, original_filename, company_id, created_by_user_id, intake_status, staff_ops_status, aggregate_review_status, extraction_error, procurement_opportunity_id, payload, created_at, updated_at",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return (
      <div>
        <PageHeader title="Invoice intake" breadcrumb={[{ label: "Invoice intakes", href: "/admin/invoices" }]} />
        <ErrorState title="Could not load invoice" message={error.message} />
      </div>
    );
  }
  if (!data) notFound();

  const payload = (data.payload ?? {}) as Record<string, unknown>;
  const extract = (payload.last_extract ?? null) as Record<string, unknown> | null;
  const lines = (Array.isArray(extract?.lines) ? extract.lines : []) as ExtractLine[];
  const extractError =
    data.extraction_error ??
    (typeof extract?.error === "string" ? extract.error : null) ??
    (typeof payload.phase2_error === "string" ? payload.phase2_error : null);

  const { data: lineRows } = await supabase
    .schema("gc_commerce")
    .from("invoice_lines")
    .select(
      "id, line_index, raw_description, quantity, unit_price, line_total, supplier_sku, manufacturer_sku, quantity_uom, gloves_per_box, boxes_per_case, gloves_per_case, review_status, match_reason, match_trust_status, comparison_block_reason, competitor_product_id, catalog_product_id, comparison_snapshot",
    )
    .eq("uploaded_invoice_id", params.id)
    .order("line_index", { ascending: true });
  const persistedLines = (lineRows ?? []) as InvoiceLineReviewRow[];
  const intakeFailed = data.intake_status === "extracted_failed" || data.intake_status === "intake_failed";

  return (
    <div>
      <PageHeader
        title={data.original_filename ?? "Invoice intake"}
        description={`Intake ${data.id.slice(0, 8)}…`}
        breadcrumb={[
          { label: "Invoice intakes", href: "/admin/invoices" },
          { label: data.original_filename ?? data.id.slice(0, 8) + "…" },
        ]}
      />

      {intakeFailed || extractError ? (
        <div className={cn(adminAlertSurface("critical"), "mb-4")}>
          <p className="font-medium">Extraction failed</p>
          {extractError ? <p className="mt-1 text-sm opacity-90">{extractError}</p> : null}
        </div>
      ) : null}

      <PremiumSectionCard title="Intake summary">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Intake status">
            <StatusBadge status={data.intake_status} />
          </Field>
          <Field label="Staff ops">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={data.staff_ops_status} />
              {invoiceOpsRequiresAction(data.staff_ops_status) ? (
                <span className="text-xs font-medium text-admin-warning">Needs action</span>
              ) : null}
            </div>
          </Field>
          <Field label="Aggregate review">
            {data.aggregate_review_status ? <StatusBadge status={data.aggregate_review_status} /> : "—"}
          </Field>
          <Field label="Filename">{data.original_filename ?? "—"}</Field>
          <Field label="Company ID">
            {data.company_id ? (
              <span className="font-mono text-xs">{data.company_id}</span>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Uploaded by">
            {data.created_by_user_id ? (
              <span className="font-mono text-xs">{data.created_by_user_id}</span>
            ) : (
              "Anonymous"
            )}
          </Field>
          <Field label="Opportunity ID">
            {data.procurement_opportunity_id ? (
              <span className="font-mono text-xs">{data.procurement_opportunity_id}</span>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Created">{new Date(data.created_at).toLocaleString()}</Field>
        </dl>

        {extract ? (
          <div className="mt-4 border-t border-admin-border-subtle pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Extract summary</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
              <div>
                <dt className="text-xs text-admin-muted">Vendor</dt>
                <dd>{String(extract.vendor_name ?? "—")}</dd>
              </div>
              <div>
                <dt className="text-xs text-admin-muted">Invoice #</dt>
                <dd>{String(extract.invoice_number ?? "—")}</dd>
              </div>
              <div>
                <dt className="text-xs text-admin-muted">Total</dt>
                <dd>{extract.total_amount != null ? String(extract.total_amount) : "—"}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <InvoiceOpsStatusForm invoiceId={data.id} currentStatus={data.staff_ops_status} />
      </PremiumSectionCard>

      {persistedLines.length > 0 ? (
        <PremiumSectionCard title="Governed line comparison" className="mt-6">
          <InvoiceLineReviewPanel lines={persistedLines} />
        </PremiumSectionCard>
      ) : null}

      {lines.length > 0 ? (
        <PremiumSectionCard title="Extracted lines" className="mt-6">
          <TableCard>
            <DetailTableShell
              headers={[
                { label: "Description" },
                { label: "Qty" },
                { label: "Unit" },
                { label: "Total" },
              ]}
            >
              {lines.map((line, i) => (
                <tr key={i} className={adminTableRowHover}>
                  <td className={adminTableCell}>{line.description ?? "—"}</td>
                  <td className={adminTableCell}>{line.quantity ?? "—"}</td>
                  <td className={adminTableCell}>{line.unit_price ?? "—"}</td>
                  <td className={adminTableCell}>{line.total ?? "—"}</td>
                </tr>
              ))}
            </DetailTableShell>
          </TableCard>
        </PremiumSectionCard>
      ) : null}

      <Link href="/admin/invoices" className={cn("mt-4 inline-block text-sm", adminLink)}>
        ← Invoice intakes
      </Link>
      {" · "}
      <Link href="/admin/procurement/crosswalk" className={cn("mt-4 inline-block text-sm", adminLink)}>
        Competitor crosswalk
      </Link>
    </div>
  );
}

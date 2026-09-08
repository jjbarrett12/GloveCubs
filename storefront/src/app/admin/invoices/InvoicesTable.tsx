"use client";

import Link from "next/link";
import { DataTable, StatusBadge, TableCard } from "@/components/admin";
import { adminLink } from "@/components/admin/admin-theme-utils";
import { invoiceOpsRequiresAction } from "@/lib/admin/launch-ops-status";

export type InvoiceIntakeRow = {
  id: string;
  original_filename: string | null;
  company_id: string | null;
  intake_status: string;
  staff_ops_status: string;
  created_at: string;
  aggregate_review_status: string | null;
  extraction_error: string | null;
  payload: Record<string, unknown> | null;
};

function vendorFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "—";
  const extract = payload.last_extract as Record<string, unknown> | undefined;
  const vendor = extract?.vendor_name ?? payload.vendor;
  if (vendor != null && String(vendor).trim()) return String(vendor);
  return "—";
}

function intakeFailed(status: string): boolean {
  return status === "extracted_failed" || status === "intake_failed";
}

export function InvoicesTable({ rows }: { rows: InvoiceIntakeRow[] }) {
  return (
    <TableCard>
      <DataTable<InvoiceIntakeRow & Record<string, unknown>>
        columns={[
          {
            key: "created_at",
            header: "Created",
            width: "140px",
            mono: true,
            render: (row) => new Date(row.created_at).toLocaleString(),
          },
          {
            key: "intake_status",
            header: "Extraction",
            render: (row) => (
              <div>
                <StatusBadge status={row.intake_status} />
                {intakeFailed(row.intake_status) ? (
                  <p className="mt-0.5 max-w-[160px] text-[10px] font-medium text-admin-danger">Extraction failed</p>
                ) : null}
              </div>
            ),
          },
          {
            key: "staff_ops_status",
            header: "Staff ops",
            render: (row) => (
              <div>
                <StatusBadge status={row.staff_ops_status} />
                {invoiceOpsRequiresAction(row.staff_ops_status) ? (
                  <p className="mt-0.5 text-[10px] font-medium text-admin-warning">Needs action</p>
                ) : null}
              </div>
            ),
          },
          {
            key: "original_filename",
            header: "Filename",
            render: (row) => (
              <Link href={`/admin/invoices/${row.id}`} className={adminLink}>
                {row.original_filename ?? row.id.slice(0, 8) + "…"}
              </Link>
            ),
          },
          { key: "vendor", header: "Vendor", render: (row) => vendorFromPayload(row.payload) },
          {
            key: "aggregate_review_status",
            header: "Review",
            render: (row) =>
              row.aggregate_review_status ? <StatusBadge status={row.aggregate_review_status} /> : "—",
          },
          {
            key: "company_id",
            header: "Company",
            mono: true,
            render: (row) => (row.company_id ? `${row.company_id.slice(0, 8)}…` : "—"),
          },
        ]}
        data={rows}
        keyField="id"
        emptyMessage="No invoice intakes yet."
        stickyHeader
      />
    </TableCard>
  );
}

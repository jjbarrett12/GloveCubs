"use client";

import Link from "next/link";
import { DataTable, StatusBadge, TableCard } from "@/components/admin";
import { adminStatusBadgeClasses } from "@/components/admin/admin-theme-utils";
import type { AdminRecentQuoteRow } from "@/lib/admin/admin-home-snapshot";
import { describeQuoteStatusForOperator } from "@/lib/procurement/operator-lifecycle-copy";

type Props = {
  quotes: AdminRecentQuoteRow[];
};

export function AdminRecentQuotesTable({ quotes }: Props) {
  return (
    <TableCard>
      <DataTable<AdminRecentQuoteRow & Record<string, unknown>>
        columns={[
          {
            key: "created_at",
            header: "Created",
            width: "140px",
            mono: true,
            render: (row) =>
              row.created_at ? new Date(row.created_at).toLocaleString() : "—",
          },
          {
            key: "status",
            header: "Operator review",
            render: (row) => {
              const copy = describeQuoteStatusForOperator(row.status);
              return (
                <div>
                  <StatusBadge status={row.status} />
                  <p className="mt-0.5 text-[10px] text-admin-muted">{copy.internalLabel}</p>
                </div>
              );
            },
          },
          {
            key: "buyer_status",
            header: "Buyer sees",
            render: (row) => describeQuoteStatusForOperator(row.status).buyerSees,
          },
          {
            key: "company_name",
            header: "Company",
            truncate: true,
            render: (row) => (
              <span className="inline-flex max-w-[200px] items-center gap-1.5 truncate">
                {row.company_name || "—"}
                {row.likelyTestDemo ? (
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${adminStatusBadgeClasses("warning")}`}
                    title={row.exclusionReason ?? "Likely test/demo data"}
                  >
                    Test/demo
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            key: "contact_name",
            header: "Contact",
            truncate: true,
            render: (row) => row.contact_name || "—",
          },
          {
            key: "gc_company_id",
            header: "Linked co.",
            mono: true,
            render: (row) => (row.gc_company_id ? `${row.gc_company_id.slice(0, 8)}…` : "—"),
          },
          {
            key: "id",
            header: "",
            width: "72px",
            align: "right",
            render: () => (
              <Link href="/admin/leads" className="text-xs font-medium text-admin-accent hover:underline">
                Review
              </Link>
            ),
          },
        ]}
        data={quotes}
        keyField="id"
        emptyMessage="No quote requests in the queue yet."
        stickyHeader
      />
    </TableCard>
  );
}

"use client";

import { DataTable, StatusBadge, TableCard } from "@/components/admin";
import { formatShipToLabel } from "@/lib/commerce/ship-to-address-format";
import { describeQuoteStatusForOperator } from "@/lib/procurement/operator-lifecycle-copy";

export type LeadQuoteRow = {
  id: string;
  status: string;
  contact_name: string;
  email: string;
  company_name: string;
  phone: string | null;
  created_at: string;
  gc_company_id: string | null;
  ship_to_address_id: string | null;
  ship_to_label: string | null;
  ship_to_snapshot: unknown | null;
};

export function LeadsTable({ rows }: { rows: LeadQuoteRow[] }) {
  return (
    <TableCard>
      <DataTable<LeadQuoteRow & Record<string, unknown>>
        columns={[
          {
            key: "created_at",
            header: "Created",
            width: "140px",
            mono: true,
            render: (row) => new Date(row.created_at).toLocaleString(),
          },
          {
            key: "status",
            header: "Operator review",
            render: (row) => {
              const copy = describeQuoteStatusForOperator(row.status);
              return (
                <div>
                  <StatusBadge status={row.status} />
                  <p className="mt-0.5 max-w-[160px] text-[10px] text-admin-muted">{copy.actionHint}</p>
                </div>
              );
            },
          },
          {
            key: "buyer_status",
            header: "Buyer sees",
            render: (row) => describeQuoteStatusForOperator(row.status).buyerSees,
          },
          { key: "contact_name", header: "Name" },
          { key: "email", header: "Email" },
          { key: "company_name", header: "Company" },
          {
            key: "gc_company_id",
            header: "Linked co.",
            mono: true,
            render: (row) => (row.gc_company_id ? `${row.gc_company_id.slice(0, 8)}…` : "—"),
          },
          {
            key: "delivery",
            header: "Delivery context",
            render: (row) => {
              const hasSnap = row.ship_to_snapshot != null;
              const warnIdNoSnap = Boolean(row.ship_to_address_id) && !hasSnap;
              const deliveryText = hasSnap
                ? formatShipToLabel(row.ship_to_label, row.ship_to_snapshot)
                : "—";
              return (
                <div className="max-w-[240px] align-top">
                  <p className="font-mono text-[10px] text-admin-muted">{row.id.slice(0, 8)}…</p>
                  <p className="text-sm">{deliveryText}</p>
                  {warnIdNoSnap ? (
                    <p className="mt-1 text-xs font-medium text-admin-warning">
                      ship_to_address_id without quote-time snapshot
                    </p>
                  ) : null}
                </div>
              );
            },
          },
        ]}
        data={rows}
        keyField="id"
        emptyMessage="No quote requests in the queue yet."
        stickyHeader
      />
    </TableCard>
  );
}

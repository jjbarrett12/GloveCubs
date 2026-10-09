"use client";

import Link from "next/link";
import { DataTable, StatusBadge, TableCard } from "@/components/admin";
import { adminLink } from "@/components/admin/admin-theme-utils";
import { prospectStatusRequiresAction } from "@/lib/admin/launch-ops-status";

export type ProspectRow = {
  id: number;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
};

export function ProspectsTable({ rows }: { rows: ProspectRow[] }) {
  return (
    <TableCard>
      <DataTable<ProspectRow & Record<string, unknown>>
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
            header: "Status",
            render: (row) => (
              <div>
                <StatusBadge status={row.status} />
                {prospectStatusRequiresAction(row.status) ? (
                  <p className="mt-0.5 text-[10px] font-medium text-admin-warning">Needs action</p>
                ) : null}
              </div>
            ),
          },
          {
            key: "company_name",
            header: "Company",
            render: (row) => (
              <Link href={`/admin/prospects/${row.id}`} className={adminLink}>
                {row.company_name}
              </Link>
            ),
          },
          { key: "contact_name", header: "Contact", render: (row) => row.contact_name ?? "—" },
          {
            key: "email",
            header: "Email",
            render: (row) =>
              row.email ? (
                <Link href={`/admin/prospects/${row.id}`} className={adminLink}>
                  {row.email}
                </Link>
              ) : (
                "—"
              ),
          },
          { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
          { key: "source", header: "Source", render: (row) => row.source ?? "—" },
          {
            key: "notes",
            header: "Notes",
            truncate: true,
            render: (row) => row.notes ?? "—",
          },
          {
            key: "last_contacted_at",
            header: "Last contact",
            mono: true,
            render: (row) => (row.last_contacted_at ? new Date(row.last_contacted_at).toLocaleString() : "—"),
          },
          {
            key: "updated_at",
            header: "Updated",
            mono: true,
            render: (row) => new Date(row.updated_at).toLocaleString(),
          },
        ]}
        data={rows}
        keyField="id"
        emptyMessage="No pricing leads in the queue yet."
        stickyHeader
      />
    </TableCard>
  );
}

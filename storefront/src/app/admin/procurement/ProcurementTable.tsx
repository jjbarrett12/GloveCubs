"use client";

import Link from "next/link";
import { DataTable, TableCard } from "@/components/admin";
import { adminLink } from "@/components/admin/admin-theme-utils";

export type ProcurementCompanyRow = {
  company_id: string;
  company_name: string | null;
  open_count: number;
  blocked_count: number;
};

export function ProcurementTable({ rows }: { rows: ProcurementCompanyRow[] }) {
  return (
    <TableCard>
      <DataTable<ProcurementCompanyRow & Record<string, unknown>>
        columns={[
          {
            key: "company_name",
            header: "Company",
            render: (row) => row.company_name ?? row.company_id,
          },
          {
            key: "open_count",
            header: "Open review",
            align: "right",
            mono: true,
            render: (row) => row.open_count,
          },
          {
            key: "blocked_count",
            header: "Blocked",
            align: "right",
            mono: true,
            render: (row) => row.blocked_count,
          },
          {
            key: "workspace",
            header: "Workspace",
            render: (row) => (
              <Link className={`text-sm ${adminLink}`} href={`/admin/procurement/company/${row.company_id}`}>
                Open →
              </Link>
            ),
          },
        ]}
        data={rows}
        keyField="company_id"
        stickyHeader
      />
    </TableCard>
  );
}

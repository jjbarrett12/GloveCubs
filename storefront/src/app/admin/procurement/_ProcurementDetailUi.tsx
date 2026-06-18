"use client";

import Link from "next/link";
import { DataTable, TableCard } from "@/components/admin";
import { adminLink } from "@/components/admin/admin-theme-utils";

export function ProcurementEventsTable({ events }: { events: Record<string, unknown>[] }) {
  return (
    <TableCard>
      <DataTable<Record<string, unknown>>
        columns={[
          {
            key: "created_at",
            header: "Time",
            width: "160px",
            mono: true,
            render: (row) => String(row.created_at ?? ""),
          },
          {
            key: "event_type",
            header: "Event",
            render: (row) => String(row.event_type ?? ""),
          },
        ]}
        data={events}
        keyField="id"
        emptyMessage="No procurement events recorded for this sourcing thread."
        stickyHeader
      />
    </TableCard>
  );
}

export function ProcurementBackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={adminLink}>
      {children}
    </Link>
  );
}

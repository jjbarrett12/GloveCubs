"use client";

import Link from "next/link";
import { DataTable, StatusBadge, TableCard } from "@/components/admin";
import { adminLink } from "@/components/admin/admin-theme-utils";
import type { ExpressPurchaseOrderRow } from "@/lib/admin/admin-purchase-orders-express";
import { PoRowActions } from "./PoRowActions";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toFixed(2)}`;
}

export function PurchaseOrdersTable({ rows }: { rows: ExpressPurchaseOrderRow[] }) {
  return (
    <TableCard>
      <DataTable<ExpressPurchaseOrderRow & Record<string, unknown>>
        columns={[
          {
            key: "po_number",
            header: "PO #",
            render: (po) => po.po_number || `#${po.id}`,
          },
          {
            key: "manufacturer_name",
            header: "Vendor",
            render: (po) => po.manufacturer_name || `Mfr ${po.manufacturer_id}`,
          },
          {
            key: "status",
            header: "Status",
            render: (po) => <StatusBadge status={po.status || "draft"} />,
          },
          {
            key: "order_number",
            header: "Customer order",
            render: (po) => po.order_number || "—",
          },
          {
            key: "created_at",
            header: "Created",
            mono: true,
            render: (po) => (po.created_at ? new Date(po.created_at).toLocaleString() : "—"),
          },
          {
            key: "subtotal",
            header: "Subtotal",
            align: "right",
            render: (po) => fmtMoney(po.subtotal),
          },
          {
            key: "lines",
            header: "Lines",
            align: "right",
            mono: true,
            render: (po) => (Array.isArray(po.lines) ? po.lines.length : 0),
          },
          {
            key: "actions",
            header: "Actions",
            render: (po) => {
              const lineCount = Array.isArray(po.lines) ? po.lines.length : 0;
              const canReceive = lineCount > 0 && po.status !== "received";
              return <PoRowActions poId={po.id} status={po.status || "draft"} canReceive={canReceive} />;
            },
          },
        ]}
        data={rows}
        keyField="id"
        stickyHeader
      />
    </TableCard>
  );
}

export function PurchaseOrdersEmptyAction() {
  return (
    <Link href="/admin/orders" className={adminLink}>
      Open order records →
    </Link>
  );
}

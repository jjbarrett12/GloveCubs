"use client";

import * as React from "react";
import Link from "next/link";
import { adminLink, adminPrimaryButton, adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { AdminVariantInventoryRow } from "@/lib/admin/admin-variant-inventory";
import { InventoryAdjustModal } from "./InventoryAdjustModal";

export type InventoryTab = "warehouse" | "incoming" | "dropship" | "history";

const TABS: { id: InventoryTab; label: string }[] = [
  { id: "warehouse", label: "Warehouse stock" },
  { id: "incoming", label: "Incoming POs" },
  { id: "dropship", label: "Dropship catalog" },
  { id: "history", label: "Inventory history" },
];

type Props = {
  activeTab: InventoryTab;
  warehouseRows: AdminVariantInventoryRow[];
  incomingRows: {
    id: number;
    po_number: string;
    manufacturer_name: string;
    status: string;
    created_at: string;
    line_count: number;
    pending_lines: number;
  }[];
  dropshipRows: {
    catalog_variant_id: string;
    variant_sku: string;
    size_code: string | null;
    product_name: string;
    brand: string;
  }[];
  historyRows: {
    id: number;
    variant_sku: string;
    delta: number;
    type: string;
    notes: string | null;
    balance_after: number | null;
    created_at: string;
  }[];
};

export function InventoryModuleClient({
  activeTab,
  warehouseRows,
  incomingRows,
  dropshipRows,
  historyRows,
}: Props) {
  const [adjustRow, setAdjustRow] = React.useState<AdminVariantInventoryRow | null>(null);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/admin/purchase-orders" className={adminPrimaryButton}>
          Receive warehouse shipment
        </Link>
        <button
          type="button"
          className={adminSecondaryButton}
          onClick={() => warehouseRows[0] && setAdjustRow(warehouseRows[0])}
          disabled={warehouseRows.length === 0}
        >
          Adjust inventory (cases)
        </button>
        <Link href="/admin/purchase-orders" className={adminSecondaryButton}>
          Create inbound PO
        </Link>
        <Link href="/admin/orders" className={adminSecondaryButton}>
          Create dropship fulfillment order
        </Link>
      </div>

      <nav className="mb-4 flex flex-wrap gap-1 border-b border-admin-border-subtle pb-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/inventory?tab=${t.id}`}
            className={cn(
              "rounded px-3 py-1.5 text-sm",
              activeTab === t.id
                ? "bg-admin-surface-raised font-medium text-admin-primary"
                : "text-admin-muted hover:text-admin-primary",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {activeTab === "warehouse" ? (
        <WarehouseTable rows={warehouseRows} onAdjust={setAdjustRow} />
      ) : null}
      {activeTab === "incoming" ? <IncomingTable rows={incomingRows} /> : null}
      {activeTab === "dropship" ? <DropshipTable rows={dropshipRows} /> : null}
      {activeTab === "history" ? <HistoryTable rows={historyRows} /> : null}

      <InventoryAdjustModal row={adjustRow} open={adjustRow != null} onClose={() => setAdjustRow(null)} />
    </>
  );
}

function WarehouseTable({
  rows,
  onAdjust,
}: {
  rows: AdminVariantInventoryRow[];
  onAdjust: (r: AdminVariantInventoryRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-admin-muted">
        No tracked warehouse SKUs yet. Mark GloveCubs-manufactured variants as <strong>stocked</strong> in the product editor.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-admin-border-subtle">
      <table className="min-w-[1000px] w-full text-sm">
        <thead className="bg-admin-surface-raised text-left text-xs text-admin-muted">
          <tr>
            {["SKU", "Size", "Product", "On hand", "Reserved", "Available", "Incoming", "Reorder", "Bin", ""].map(
              (h) => (
                <th key={h || "actions"} className={cn("px-3 py-2 font-medium", h && Number.isNaN(Number(h)) && h.match(/hand|Reserved|Available|Incoming|Reorder/) && "text-right")}>
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((r) => (
            <tr key={r.catalog_variant_id} className="border-t border-admin-border-subtle hover:bg-admin-surface-raised/50">
              <td className="px-3 py-2 font-mono text-xs">{r.variant_sku}</td>
              <td className="px-3 py-2">{r.size_code || "—"}</td>
              <td className="px-3 py-2">
                {r.product_name}
                {r.brand ? <span className="block text-xs text-admin-muted">{r.brand}</span> : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.quantity_on_hand}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.quantity_reserved}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.available_stock}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.incoming_quantity}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.reorder_point}</td>
              <td className="px-3 py-2 text-xs">{r.bin_location || "—"}</td>
              <td className="px-3 py-2">
                <button type="button" className={adminLink} onClick={() => onAdjust(r)}>
                  Adjust
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncomingTable({ rows }: { rows: Props["incomingRows"] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-admin-muted">No open purchase orders awaiting receipt.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-admin-border-subtle">
      <table className="w-full text-sm">
        <thead className="bg-admin-surface-raised text-left text-xs text-admin-muted">
          <tr>
            {["PO #", "Vendor", "Status", "Created", "Lines", "Pending units", ""].map((h) => (
              <th key={h || "act"} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-admin-border-subtle">
              <td className="px-3 py-2 font-mono text-xs">{r.po_number}</td>
              <td className="px-3 py-2">{r.manufacturer_name || "—"}</td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2 text-xs">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.line_count}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.pending_lines}</td>
              <td className="px-3 py-2">
                <Link href={`/admin/purchase-orders/${r.id}/receive`} className={adminLink}>
                  Receive
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DropshipTable({ rows }: { rows: Props["dropshipRows"] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-admin-muted">No active dropship variants in catalog.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-admin-border-subtle">
      <table className="w-full text-sm">
        <thead className="bg-admin-surface-raised text-left text-xs text-admin-muted">
          <tr>
            {["SKU", "Size", "Product", "Brand"].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((r) => (
            <tr key={r.catalog_variant_id} className="border-t border-admin-border-subtle">
              <td className="px-3 py-2 font-mono text-xs">{r.variant_sku}</td>
              <td className="px-3 py-2">{r.size_code || "—"}</td>
              <td className="px-3 py-2">{r.product_name}</td>
              <td className="px-3 py-2 text-xs text-admin-muted">{r.brand || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTable({ rows }: { rows: Props["historyRows"] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-admin-muted">No variant stock history yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-admin-border-subtle">
      <table className="w-full text-sm">
        <thead className="bg-admin-surface-raised text-left text-xs text-admin-muted">
          <tr>
            {["When", "SKU", "Type", "Delta", "Balance", "Notes"].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-admin-border-subtle">
              <td className="whitespace-nowrap px-3 py-2 text-xs">
                {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.variant_sku}</td>
              <td className="px-3 py-2 text-xs">{r.type}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.balance_after ?? "—"}</td>
              <td className="max-w-[240px] truncate px-3 py-2 text-xs text-admin-muted">{r.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

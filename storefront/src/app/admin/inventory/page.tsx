import { PageHeader, PageSection, EmptyState, ErrorState, TableCard } from "@/components/admin";
import { ModuleUnavailableState } from "@/components/admin/ModuleUnavailableState";
import {
  adminCardSurface,
  adminTableBody,
  adminTableCell,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
  adminTableShell,
} from "@/components/admin/admin-theme-utils";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { getAdminModuleAvailability, resolveAdminHealth } from "@/lib/admin/admin-health";
import { fetchAdminInventory, type AdminInventoryRow } from "@/lib/admin/admin-inventory";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { InventoryAdjustPanel } from "./InventoryAdjustPanel";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory | GloveCubs admin",
  robots: { index: false, follow: false },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function AdminInventoryPage() {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Inventory" description="Sign in as an admin operator." />
      </div>
    );
  }

  const health = resolveAdminHealth();
  const availability = getAdminModuleAvailability(health, "inventory");

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock positions from Supabase. Manual adjustments write stock history with operator attribution."
      />

      {!availability.available ? (
        <ModuleUnavailableState moduleId="inventory" reason={availability.reason} />
      ) : (
        <InventoryContent />
      )}
    </div>
  );
}

async function InventoryContent() {
  if (!isSupabaseConfigured()) {
    return (
      <ErrorState
        title="Could not load inventory"
        message="Database credentials are not configured. Review Admin Health for configuration status."
      />
    );
  }

  const supabase = getSupabaseAdmin();
  const { rows, error, status } = await fetchAdminInventory(supabase);

  if (error) {
    return (
      <ErrorState
        title="Could not load inventory"
        message={status >= 500 ? "This module could not be loaded. Try again in a moment." : error}
      />
    );
  }

  return (
    <>
      <PageSection title={`Stock (${rows.length} products)`}>
        {rows.length === 0 ? (
          <EmptyState
            title="No inventory rows yet"
            description="Stock positions will appear here once active catalog products have sellable listings."
          />
        ) : (
          <TableCard>
            <div className="overflow-x-auto">
              <table className={cn(adminTableShell, "min-w-[900px]")}>
                <thead className={adminTableHead}>
                  <tr>
                    {["SKU", "Name", "On hand", "Reserved", "Available", "Reorder at", "Bin", "Last count"].map(
                      (h, i) => (
                        <th
                          key={h}
                          className={cn(adminTableHeadCell, "px-3 py-2", i >= 2 && i <= 5 && "text-right")}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className={adminTableBody}>
                  {(rows as AdminInventoryRow[]).slice(0, 200).map((r) => (
                    <tr key={r.product_id} className={adminTableRowHover}>
                      <td className={cn(adminTableCell, "px-3 py-2 font-mono text-xs")}>{r.sku || "—"}</td>
                      <td className={cn(adminTableCell, "max-w-[200px] px-3 py-2")}>
                        {r.name || "—"}
                        {r.brand ? <span className="block text-xs text-admin-muted">{r.brand}</span> : null}
                      </td>
                      <td className={cn(adminTableCell, "px-3 py-2 text-right tabular-nums")}>{r.quantity_on_hand ?? 0}</td>
                      <td className={cn(adminTableCell, "px-3 py-2 text-right tabular-nums")}>{r.quantity_reserved ?? 0}</td>
                      <td className={cn(adminTableCell, "px-3 py-2 text-right tabular-nums")}>{r.available_stock ?? 0}</td>
                      <td className={cn(adminTableCell, "px-3 py-2 text-right tabular-nums")}>{r.reorder_point ?? 0}</td>
                      <td className={cn(adminTableCell, "px-3 py-2 text-xs")}>{r.bin_location || "—"}</td>
                      <td className={cn(adminTableCell, "whitespace-nowrap px-3 py-2 text-xs")}>{fmtTime(r.last_count_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 ? (
                <p className="border-t border-admin-border-subtle px-3 py-2 text-xs text-admin-muted">
                  Showing first 200 of {rows.length}.
                </p>
              ) : null}
            </div>
          </TableCard>
        )}
      </PageSection>

      {rows.length > 0 ? (
        <PageSection title="Adjust stock">
          <p className="mb-3 text-xs text-admin-secondary">
            Enter a listing product UUID (product_id from the table source) and integer delta. Uses POST
            /admin/api/inventory/adjust.
          </p>
          <div className={cn(adminCardSurface, "p-3")}>
            <AdjustByProductIdPicker rows={rows} />
          </div>
        </PageSection>
      ) : null}
    </>
  );
}

function AdjustByProductIdPicker({ rows }: { rows: AdminInventoryRow[] }) {
  const first = rows[0];
  if (!first) return null;
  return (
    <div className="mt-2 space-y-4">
      {rows.slice(0, 15).map((r) => (
        <InventoryAdjustPanel
          key={r.product_id}
          productId={r.product_id}
          sku={r.sku}
          name={r.name}
          onHand={r.quantity_on_hand ?? 0}
        />
      ))}
      {rows.length > 15 ? (
        <p className="text-xs text-admin-muted">Quick adjust shown for first 15 rows; use product UUID for others.</p>
      ) : null}
    </div>
  );
}

import { PageHeader, PageSection } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminInventoryFromExpress, type ExpressInventoryRow } from "@/lib/admin/admin-inventory-express";
import { InventoryAdjustPanel } from "./InventoryAdjustPanel";

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

  const { rows, error, status } = await fetchAdminInventoryFromExpress(operator);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock positions from the transitional Express admin API. Adjustments use the same rules as legacy admin."
      />

      {error ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
          {status === 503 ? " — check JWT_SECRET and NEXT_PUBLIC_GLOVECUBS_API on the storefront server." : null}
        </p>
      ) : null}

      <PageSection title={`Stock (${rows.length} products)`}>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No inventory rows returned.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">On hand</th>
                  <th className="px-3 py-2 text-right">Reserved</th>
                  <th className="px-3 py-2 text-right">Available</th>
                  <th className="px-3 py-2 text-right">Reorder at</th>
                  <th className="px-3 py-2">Bin</th>
                  <th className="px-3 py-2">Last count</th>
                </tr>
              </thead>
              <tbody>
                {(rows as ExpressInventoryRow[]).slice(0, 200).map((r) => (
                  <tr key={r.product_id} className="border-b border-gray-50 align-top last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{r.sku || "—"}</td>
                    <td className="max-w-[200px] px-3 py-2 text-gray-900">
                      {r.name || "—"}
                      {r.brand ? <span className="block text-xs text-gray-500">{r.brand}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.quantity_on_hand ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.quantity_reserved ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.available_stock ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.reorder_point ?? 0}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{r.bin_location || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">{fmtTime(r.last_count_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 ? (
              <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">Showing first 200 of {rows.length}.</p>
            ) : null}
          </div>
        )}
      </PageSection>

      {rows.length > 0 ? (
        <PageSection title="Adjust stock">
          <p className="mb-3 text-xs text-gray-600">
            Enter a listing product UUID (product_id from the table source) and integer delta. Uses POST /api/admin/inventory/adjust.
          </p>
          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <label className="block text-xs font-semibold text-gray-600">Product listing UUID</label>
            <AdjustByProductIdPicker rows={rows} />
          </div>
        </PageSection>
      ) : null}
    </div>
  );
}

function AdjustByProductIdPicker({ rows }: { rows: ExpressInventoryRow[] }) {
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
        <p className="text-xs text-gray-500">Quick adjust shown for first 15 rows; use product UUID for others.</p>
      ) : null}
    </div>
  );
}

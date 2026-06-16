import Link from "next/link";
import { PageHeader, PageSection } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminPurchaseOrdersFromExpress, type ExpressPurchaseOrderRow } from "@/lib/admin/admin-purchase-orders-express";
import { PoRowActions } from "./PoRowActions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Purchase orders | GloveCubs admin",
  robots: { index: false, follow: false },
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toFixed(2)}`;
}

export default async function AdminPurchaseOrdersPage() {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Purchase orders" description="Sign in as an admin operator." />
      </div>
    );
  }

  const { rows, error, status } = await fetchAdminPurchaseOrdersFromExpress(operator);

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Drop-ship POs from the transitional Express admin API. Send emails vendors; receive posts stock using PO line quantities."
      />

      {error ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
          {status === 503 ? " — check JWT_SECRET and NEXT_PUBLIC_GLOVECUBS_API on the storefront server." : null}
        </p>
      ) : null}

      <PageSection title={`POs (${rows.length})`}>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            No purchase orders yet. Create from{" "}
            <Link href="/admin/orders" className="font-medium text-blue-700 hover:underline">
              order records
            </Link>{" "}
            (Create PO).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">PO #</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Customer order</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2">Lines</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rows as ExpressPurchaseOrderRow[]).map((po) => {
                  const lineCount = Array.isArray(po.lines) ? po.lines.length : 0;
                  const canReceive = lineCount > 0 && po.status !== "received";
                  return (
                    <tr key={po.id} className="border-b border-gray-50 align-top last:border-0">
                      <td className="px-3 py-2 font-medium text-gray-900">{po.po_number || `#${po.id}`}</td>
                      <td className="px-3 py-2 text-gray-800">{po.manufacturer_name || `Mfr ${po.manufacturer_id}`}</td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-700">
                          {po.status || "draft"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{po.order_number || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                        {po.created_at ? new Date(po.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-sm">{fmtMoney(po.subtotal)}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{lineCount}</td>
                      <td className="px-3 py-2">
                        <PoRowActions poId={po.id} status={po.status || "draft"} canReceive={canReceive} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </div>
  );
}

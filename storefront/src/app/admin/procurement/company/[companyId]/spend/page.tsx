import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchTrustedSpendHistory } from "@/lib/procurement/procurement-workspace-read-models";

export const dynamic = "force-dynamic";

export default async function ProcurementSpendPage({ params }: { params: { companyId: string } }) {
  const admin = await getAdminUser();
  if (!admin) notFound();
  const { companyId } = params;
  if (!isSupabaseConfigured()) notFound();
  const supabase = getSupabaseAdmin() as any;
  const rows = await fetchTrustedSpendHistory(supabase, companyId);

  return (
    <div>
      <h2 className="text-base font-medium">Trusted spend history</h2>
      <p className="mb-2 text-xs text-white/50">
        <Link href={`/admin/procurement/company/${companyId}`} className="text-sky-300 hover:underline">
          ← Company hub
        </Link>
      </p>
      <table className="w-full max-w-6xl border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/20 text-white/70">
            <th className="py-2 pr-2">Observed</th>
            <th className="py-2 pr-2">Product</th>
            <th className="py-2 pr-2">Supplier</th>
            <th className="py-2 pr-2 text-right">Unit price</th>
            <th className="py-2 pr-2 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {(rows as Record<string, unknown>[]).length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-white/50">
                No trusted observations.
              </td>
            </tr>
          ) : (
            (rows as Record<string, unknown>[]).map((r) => (
              <tr key={String(r.id)} className="border-b border-white/10">
                <td className="py-2 pr-2 text-xs">{String(r.observed_at ?? "")}</td>
                <td className="py-2 pr-2 font-mono text-xs">{String(r.catalog_product_id).slice(0, 8)}…</td>
                <td className="py-2 pr-2 font-mono text-xs">{String(r.catalogos_supplier_id).slice(0, 8)}…</td>
                <td className="py-2 pr-2 text-right tabular-nums">{String(r.unit_price ?? "")}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{String(r.quantity ?? "")}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

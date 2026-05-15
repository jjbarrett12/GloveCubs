import Link from "next/link";
import { PageHeader, PageSection } from "@/components/admin";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAdminOrderList, formatMinorAmount, type OrderProvenance } from "@/lib/admin/admin-orders-read-model";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Order records | GloveCubs admin",
  robots: { index: false, follow: false },
};

const STATUSES = [
  "",
  "draft",
  "pending",
  "pending_payment",
  "payment_failed",
  "processing",
  "confirmed",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded",
  "shipped",
  "expired",
  "abandoned",
];

function sp(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.trim() : Array.isArray(v) ? (v[0] ?? "").trim() : "";
}

function provenanceLabel(p: OrderProvenance): string {
  if (p === "migrated_legacy") return "Migrated legacy";
  if (p === "native_gc") return "Native record";
  return "Unknown";
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Order records" description="Supabase is not configured." />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: companies } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id, trade_name")
    .order("trade_name", { ascending: true })
    .limit(400);

  const companyList = (companies ?? []) as { id: string; trade_name: string }[];

  const q = sp(searchParams.q);
  const companyId = sp(searchParams.company_id);
  const status = sp(searchParams.status);
  const dateFrom = sp(searchParams.date_from);
  const dateTo = sp(searchParams.date_to);
  const provenance = sp(searchParams.provenance) as "all" | "migrated" | "unknown" | "";
  const page = Math.max(1, parseInt(sp(searchParams.page) || "1", 10) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const { rows, error, totalApprox, provenanceNote } = await fetchAdminOrderList(supabase, {
    q: q || undefined,
    companyId: companyId || undefined,
    status: status || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    provenance: provenance === "migrated" || provenance === "unknown" ? provenance : "all",
    limit,
    offset,
  });

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (companyId) qs.set("company_id", companyId);
  if (status) qs.set("status", status);
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  if (provenance && provenance !== "all") qs.set("provenance", provenance);
  if (page > 1) qs.set("page", String(page));

  return (
    <div>
      <PageHeader
        title="Order records"
        description="Canonical gc_commerce order headers and line counts for validation. May include migrated legacy history. These are database records—not finance-approved totals or margin reporting."
      />

      <PageSection title="Filters">
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-gray-600">Order number</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search…"
              className="mt-1 w-44 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600">Company</label>
            <select name="company_id" defaultValue={companyId} className="mt-1 max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">All</option>
              {companyList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.trade_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600">Status</label>
            <select name="status" defaultValue={status} className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm">
              {STATUSES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Any"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600">Placed from</label>
            <input name="date_from" type="date" defaultValue={dateFrom} className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600">Placed to</label>
            <input name="date_to" type="date" defaultValue={dateTo} className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600">Provenance</label>
            <select name="provenance" defaultValue={provenance || "all"} className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="all">All</option>
              <option value="migrated">Migrated legacy (legacy_order_map)</option>
              <option value="unknown">Unknown (this page only)</option>
            </select>
          </div>
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Apply
          </button>
        </form>
        {provenanceNote ? <p className="mt-2 text-xs text-amber-800">{provenanceNote}</p> : null}
      </PageSection>

      {error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : (
        <PageSection title={`Results (${totalApprox >= 0 ? totalApprox : rows.length} matched)`}>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Order #</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Placed</th>
                  <th className="px-3 py-2 text-right">Total (minor)</th>
                  <th className="px-3 py-2 text-right">Total (display)</th>
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2 text-right">Lines</th>
                  <th className="px-3 py-2">Provenance</th>
                  <th className="px-3 py-2">Recorded payment</th>
                  <th className="px-3 py-2">Recorded fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-gray-500">
                      No order records matched.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/admin/orders/${r.id}`} className="font-medium text-blue-700 hover:underline">
                          {r.order_number}
                        </Link>
                      </td>
                      <td className="max-w-[200px] px-3 py-2">
                        <span className="block truncate text-gray-900">{r.company_trade_name || "—"}</span>
                        <span className="font-mono text-[10px] text-gray-400">{r.company_id}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-700">{r.status}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">{new Date(r.placed_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-800">{r.total_minor}</td>
                      <td className="px-3 py-2 text-right text-sm text-gray-900">{formatMinorAmount(r.total_minor, r.currency_code)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.currency_code}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.line_count}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{provenanceLabel(r.provenance)}</td>
                      <td className="px-3 py-2 text-xs">{r.has_payment_record ? "Yes" : "—"}</td>
                      <td className="px-3 py-2 text-xs">{r.has_fulfillment_record ? "Yes" : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            {page > 1 ? (
              <Link
                className="font-medium text-blue-700 hover:underline"
                href={`/admin/orders?${(() => {
                  const p = new URLSearchParams(qs);
                  p.set("page", String(page - 1));
                  return p.toString();
                })()}`}
              >
                Previous
              </Link>
            ) : null}
            {rows.length === limit ? (
              <Link
                className="font-medium text-blue-700 hover:underline"
                href={`/admin/orders?${(() => {
                  const p = new URLSearchParams(qs);
                  p.set("page", String(page + 1));
                  return p.toString();
                })()}`}
              >
                Next
              </Link>
            ) : null}
          </div>
        </PageSection>
      )}
    </div>
  );
}

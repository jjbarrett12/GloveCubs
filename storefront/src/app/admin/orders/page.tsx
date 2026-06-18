import Link from "next/link";
import { EmptyState, ErrorState, PageHeader, PageSection, StatusBadge, TableCard } from "@/components/admin";
import {
  adminAlertSurface,
  adminCardSurface,
  adminFormInput,
  adminFormLabel,
  adminLink,
  adminPrimaryButton,
  adminTableBody,
  adminTableCell,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
  adminTableShell,
} from "@/components/admin/admin-theme-utils";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAdminOrderList, formatMinorAmount, type OrderProvenance } from "@/lib/admin/admin-orders-read-model";
import { cn } from "@/lib/utils";

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
        <PageHeader title="Order records" description="Fulfillment review — canonical gc_commerce order headers." />
        <ErrorState
          title="Database not configured"
          message="Order records cannot be loaded in this environment. Review Admin Health for configuration status."
        />
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
  const payHold = sp(searchParams.payment_integrity_hold) === "1";
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
    paymentIntegrityHold: payHold || undefined,
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
  if (payHold) qs.set("payment_integrity_hold", "1");
  if (page > 1) qs.set("page", String(page));

  return (
    <div>
      <PageHeader
        title="Order records"
        description="Fulfillment review — canonical gc_commerce order headers. Database records for validation, not finance-approved totals or checkout KPIs."
      />

      <PageSection title="Filters">
        <form method="get" className={cn(adminCardSurface, "flex flex-wrap items-end gap-3 p-4")}>
          <div>
            <label className={adminFormLabel}>Order number</label>
            <input name="q" defaultValue={q} placeholder="Search…" className={cn(adminFormInput, "w-44")} />
          </div>
          <div>
            <label className={adminFormLabel}>Company</label>
            <select name="company_id" defaultValue={companyId} className={cn(adminFormInput, "max-w-xs")}>
              <option value="">All</option>
              {companyList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.trade_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminFormLabel}>Status</label>
            <select name="status" defaultValue={status} className={adminFormInput}>
              {STATUSES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Any"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={adminFormLabel}>Placed from</label>
            <input name="date_from" type="date" defaultValue={dateFrom} className={adminFormInput} />
          </div>
          <div>
            <label className={adminFormLabel}>Placed to</label>
            <input name="date_to" type="date" defaultValue={dateTo} className={adminFormInput} />
          </div>
          <div>
            <label className={adminFormLabel}>Provenance</label>
            <select name="provenance" defaultValue={provenance || "all"} className={adminFormInput}>
              <option value="all">All</option>
              <option value="migrated">Migrated legacy (legacy_order_map)</option>
              <option value="unknown">Unknown (this page only)</option>
            </select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-admin-secondary">
              <input
                type="checkbox"
                name="payment_integrity_hold"
                value="1"
                defaultChecked={payHold}
                className="rounded border-admin-border"
              />
              Payment integrity hold only
            </label>
          </div>
          <button type="submit" className={adminPrimaryButton}>
            Apply
          </button>
        </form>
        {provenanceNote ? <p className={cn("mt-2 text-xs", adminAlertSurface("warning"))}>{provenanceNote}</p> : null}
      </PageSection>

      {error ? (
        <ErrorState title="Could not load order records" message={error} />
      ) : (
        <PageSection title={`Results (${totalApprox >= 0 ? totalApprox : rows.length} matched)`}>
          {rows.length === 0 ? (
            <EmptyState title="No order records matched" description="Try adjusting filters or check back when new orders are placed." />
          ) : (
            <TableCard>
              <div className="overflow-x-auto">
                <table className={cn(adminTableShell, "min-w-[960px]")}>
                  <thead className={adminTableHead}>
                    <tr>
                      {[
                        "Order #",
                        "Company",
                        "Fulfillment status",
                        "Placed",
                        "Total (minor)",
                        "Total (display)",
                        "Currency",
                        "Lines",
                        "Provenance",
                        "Pay hold",
                        "Recorded payment",
                        "Recorded fulfillment",
                      ].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            adminTableHeadCell,
                            "px-3 py-2",
                            (i === 4 || i === 5 || i === 7) && "text-right",
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={adminTableBody}>
                    {rows.map((r) => (
                      <tr key={r.id} className={adminTableRowHover}>
                        <td className={cn(adminTableCell, "px-3 py-2")}>
                          <Link href={`/admin/orders/${r.id}`} className={adminLink}>
                            {r.order_number}
                          </Link>
                        </td>
                        <td className={cn(adminTableCell, "max-w-[200px] px-3 py-2")}>
                          <span className="block truncate">{r.company_trade_name || "—"}</span>
                          <span className="font-mono text-[10px] text-admin-muted">{r.company_id}</span>
                        </td>
                        <td className={cn(adminTableCell, "px-3 py-2")}>
                          <StatusBadge status={r.status} />
                          <p className="mt-0.5 font-mono text-[9px] text-admin-muted">{r.status}</p>
                        </td>
                        <td className={cn(adminTableCell, "whitespace-nowrap px-3 py-2 text-xs")}>
                          {new Date(r.placed_at).toLocaleString()}
                        </td>
                        <td className={cn(adminTableCell, "px-3 py-2 text-right font-mono text-xs")}>{r.total_minor}</td>
                        <td className={cn(adminTableCell, "px-3 py-2 text-right text-sm")}>
                          {formatMinorAmount(r.total_minor, r.currency_code)}
                        </td>
                        <td className={cn(adminTableCell, "px-3 py-2 font-mono text-xs")}>{r.currency_code}</td>
                        <td className={cn(adminTableCell, "px-3 py-2 text-right tabular-nums")}>{r.line_count}</td>
                        <td className={cn(adminTableCell, "px-3 py-2 text-xs")}>{provenanceLabel(r.provenance)}</td>
                        <td className={cn(adminTableCell, "px-3 py-2 text-xs")}>
                          {r.payment_integrity_hold ? <StatusBadge status="warning" /> : "—"}
                        </td>
                        <td className={cn(adminTableCell, "px-3 py-2 text-xs")}>{r.has_payment_record ? "Yes" : "—"}</td>
                        <td className={cn(adminTableCell, "px-3 py-2 text-xs")}>{r.has_fulfillment_record ? "Yes" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableCard>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            {page > 1 ? (
              <Link
                className={adminLink}
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
                className={adminLink}
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

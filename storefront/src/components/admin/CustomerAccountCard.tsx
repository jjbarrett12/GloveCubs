import Link from "next/link";
import { MetricChip } from "./MetricChip";
import type { AdminCompanyDirectoryRow } from "@/lib/admin/admin-companies-read-model";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";
import { cn } from "@/lib/utils";

function initialsFromTradeName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tierBadgeClass(code: string): string {
  switch (code) {
    case "kodiak":
      return "bg-amber-100 text-amber-900 ring-amber-700/15";
    case "grizzly":
      return "bg-slate-200 text-slate-800 ring-slate-600/15";
    default:
      return "bg-sky-100 text-sky-900 ring-sky-700/15";
  }
}

function AccountStatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const ring =
    s === "active"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
      : s === "suspended"
        ? "bg-amber-50 text-amber-900 ring-amber-600/20"
        : "bg-slate-100 text-slate-700 ring-slate-500/15";
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset", ring)}>
      {status}
    </span>
  );
}

type Props = {
  row: AdminCompanyDirectoryRow;
};

export function CustomerAccountCard({ row: c }: Props) {
  const base = `/admin/companies/${c.id}`;
  const last = c.last_activity_at ? new Date(c.last_activity_at).toLocaleString() : "—";

  const linkCls = "font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-[#f06232] hover:decoration-[#f06232]";

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex min-w-0 gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-slate-100 text-sm font-bold text-slate-600 shadow-inner"
          aria-hidden
        >
          {initialsFromTradeName(c.trade_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={base} className="truncate text-base font-semibold text-slate-900 hover:text-[#f06232]">
              {c.trade_name}
            </Link>
            <AccountStatusPill status={c.status} />
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                tierBadgeClass(c.b2b_pricing_tier_code),
              )}
            >
              {b2bTierLabel(c.b2b_pricing_tier_code)}
            </span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{c.slug}</p>
          <p className="mt-1 truncate text-xs text-slate-600" title={c.derived_contact_email ?? undefined}>
            {c.derived_contact_email ? (
              <>
                <span className="font-medium text-slate-500">Quote contact</span> {c.derived_contact_email}
              </>
            ) : (
              <span className="text-slate-400">No quote contact on file</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <MetricChip label="Team members" value={c.member_count} />
        <MetricChip label="Quote requests" value={c.quote_count} />
        <MetricChip label="Order records" value={c.order_count} />
        <MetricChip label="Preferred products" value={c.quicklist_count} />
        <div className="flex min-w-[8rem] flex-1 basis-[10rem] flex-col justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-2 shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last activity</span>
          <span className="mt-0.5 truncate text-xs font-semibold text-slate-800" title={last === "—" ? undefined : last}>
            {last}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs">
        <Link href={base} className={linkCls}>
          View account
        </Link>
        <Link href={`${base}?tab=delivery`} scroll={false} className={linkCls}>
          Delivery locations
        </Link>
        <Link href={`${base}?tab=products`} scroll={false} className={linkCls}>
          Preferred products
        </Link>
        <Link href={`/admin/orders?company_id=${encodeURIComponent(c.id)}`} className={linkCls}>
          Orders
        </Link>
        <Link href={`/admin/procurement/company/${c.id}`} className={linkCls}>
          Sourcing
        </Link>
      </div>
    </article>
  );
}

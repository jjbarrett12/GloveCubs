import Link from "next/link";
import { MetricChip } from "./MetricChip";
import type { AdminCompanyDirectoryRow } from "@/lib/admin/admin-companies-read-model";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";
import {
  adminCardSurface,
  adminLink,
  adminStatusBadgeClasses,
} from "@/components/admin/admin-theme-utils";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

function initialsFromTradeName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tierTone(code: string): "accent" | "warning" | "neutral" {
  if (code === "kodiak") return "warning";
  if (code === "grizzly") return "neutral";
  return "accent";
}

type Props = {
  row: AdminCompanyDirectoryRow;
};

export function CustomerAccountCard({ row: c }: Props) {
  const base = `/admin/companies/${c.id}`;
  const last = c.last_activity_at ? new Date(c.last_activity_at).toLocaleString() : "—";

  return (
    <article className={cn(adminCardSurface, "flex flex-col p-4 transition-shadow hover:shadow-md sm:p-5")}>
      <div className="flex min-w-0 gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-admin-border bg-admin-surface-muted text-sm font-bold text-admin-secondary shadow-inner"
          aria-hidden
        >
          {initialsFromTradeName(c.trade_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={base} className="truncate text-base font-semibold text-admin-primary hover:text-admin-accent">
              {c.trade_name}
            </Link>
            <StatusBadge status={c.status} />
            <span
              className={cn(
                "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
                adminStatusBadgeClasses(tierTone(c.b2b_pricing_tier_code)),
              )}
            >
              {b2bTierLabel(c.b2b_pricing_tier_code)}
            </span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-admin-muted">{c.slug}</p>
          <p className="mt-1 truncate text-xs text-admin-secondary" title={c.derived_contact_email ?? undefined}>
            {c.derived_contact_email ? (
              <>
                <span className="font-medium text-admin-muted">Quote contact</span> {c.derived_contact_email}
              </>
            ) : (
              <span className="text-admin-muted">No quote contact on file</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <MetricChip label="Team members" value={c.member_count} />
        <MetricChip label="Quote requests" value={c.quote_count} />
        <MetricChip label="Order records" value={c.order_count} />
        <MetricChip label="Preferred products" value={c.quicklist_count} />
        <div
          className={cn(
            adminCardSurface,
            "flex min-w-[8rem] flex-1 basis-[10rem] flex-col justify-center bg-admin-surface-muted px-3 py-2",
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">Last activity</span>
          <span className="mt-0.5 truncate text-xs font-semibold text-admin-primary" title={last === "—" ? undefined : last}>
            {last}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 border-t border-admin-border-subtle pt-3 text-xs">
        <Link href={base} className={adminLink}>
          View account
        </Link>
        <Link href={`${base}?tab=delivery`} scroll={false} className={adminLink}>
          Delivery locations
        </Link>
        <Link href={`${base}?tab=products`} scroll={false} className={adminLink}>
          Preferred products
        </Link>
        <Link href={`/admin/orders?company_id=${encodeURIComponent(c.id)}`} className={adminLink}>
          Orders
        </Link>
        <Link href={`/admin/procurement/company/${c.id}`} className={adminLink}>
          Sourcing
        </Link>
      </div>
    </article>
  );
}

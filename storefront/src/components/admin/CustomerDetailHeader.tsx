import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/components/admin";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";
import {
  adminCardSurface,
  adminPrimaryButton,
  adminSecondaryButton,
  adminStatusBadgeClasses,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

function initialsFromTradeName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  companyId: string;
  tradeName: string;
  slug: string;
  status: string;
  tierCode: string;
};

export function CustomerDetailHeader({ companyId, tradeName, slug, status, tierCode }: Props) {
  const tierLabel = b2bTierLabel(tierCode);
  const base = `/admin/companies/${companyId}`;

  return (
    <header className={cn(adminCardSurface, "mb-6 p-4 sm:p-5")}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-admin-border bg-admin-surface-muted text-sm font-bold text-admin-secondary shadow-inner"
            aria-hidden
          >
            {initialsFromTradeName(tradeName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-admin-primary sm:text-2xl">{tradeName}</h1>
              <span className="hidden sm:inline-flex" aria-label="GloveCubs">
                <Image
                  src="/images/glovecubs-header-logo.png"
                  alt=""
                  width={747}
                  height={99}
                  className="h-3.5 w-auto opacity-40"
                  unoptimized
                />
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-admin-muted sm:text-xs">{slug}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset",
                  adminStatusBadgeClasses("accent"),
                )}
              >
                {tierLabel}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-admin-muted">Customer account</span>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:max-w-md lg:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href={`/admin/procurement/company/${companyId}`} className={adminSecondaryButton}>
              Sourcing
            </Link>
            <Link href="/admin/companies" className={adminSecondaryButton}>
              All customers
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href={`${base}?tab=delivery`} scroll={false} className={adminPrimaryButton}>
              Delivery locations
            </Link>
            <Link href={`${base}?tab=products`} scroll={false} className={cn(adminSecondaryButton, "text-center")}>
              Preferred products
            </Link>
            <Link href={`${base}?tab=activity`} scroll={false} className={cn(adminSecondaryButton, "text-center")}>
              Quotes
            </Link>
            <Link
              href={`/admin/orders?company_id=${encodeURIComponent(companyId)}`}
              className={cn(adminSecondaryButton, "text-center")}
            >
              Orders
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

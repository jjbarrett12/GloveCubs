import Image from "next/image";
import Link from "next/link";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";
import { cn } from "@/lib/utils";

function initialsFromTradeName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset", ring)}>
      {status}
    </span>
  );
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

  const secondaryActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href={`/admin/procurement/company/${companyId}`}
        className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:text-sm"
      >
        Sourcing
      </Link>
      <Link
        href="/admin/companies"
        className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:text-sm"
      >
        All customers
      </Link>
    </div>
  );

  return (
    <header className="mb-6 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-slate-100 text-sm font-bold text-slate-600 shadow-inner"
            aria-hidden
          >
            {initialsFromTradeName(tradeName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{tradeName}</h1>
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
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 sm:text-xs">{slug}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AccountStatusPill status={status} />
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                  "bg-[#fff7f2] text-slate-900 ring-[#f06232]/25",
                )}
              >
                {tierLabel}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Customer account</span>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 lg:max-w-md lg:items-end">
          {secondaryActions}
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link
              href={`${base}?tab=delivery`}
              scroll={false}
              className="rounded-lg bg-[#f06232] px-3 py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-[#d8552a] sm:text-sm"
            >
              Delivery locations
            </Link>
            <Link
              href={`${base}?tab=products`}
              scroll={false}
              className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:text-sm"
            >
              Preferred products
            </Link>
            <Link
              href={`${base}?tab=activity`}
              scroll={false}
              className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:text-sm"
            >
              Quotes
            </Link>
            <Link
              href={`/admin/orders?company_id=${encodeURIComponent(companyId)}`}
              className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:text-sm"
            >
              Orders
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

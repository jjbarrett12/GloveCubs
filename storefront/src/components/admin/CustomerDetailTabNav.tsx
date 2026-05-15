"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CustomerDetailTabId } from "@/lib/admin/admin-customer-detail-tabs";
import { CUSTOMER_DETAIL_TAB_IDS } from "@/lib/admin/admin-customer-detail-tabs";

const TAB_LABELS: Record<CustomerDetailTabId, string> = {
  overview: "Overview",
  delivery: "Delivery locations",
  products: "Preferred products",
  activity: "Activity",
  team: "Team access",
  billing: "Billing & payment",
};

type Props = {
  companyId: string;
  current: CustomerDetailTabId;
};

function hrefForTab(companyId: string, id: CustomerDetailTabId): string {
  const base = `/admin/companies/${companyId}`;
  if (id === "overview") return base;
  return `${base}?tab=${id}`;
}

export function CustomerDetailTabNav({ companyId, current }: Props) {
  const router = useRouter();

  return (
    <div className="mb-6">
      <label htmlFor="customer-detail-tab-select" className="sr-only">
        Customer workspace section
      </label>
      <select
        id="customer-detail-tab-select"
        value={current}
        onChange={(e) => {
          const v = e.target.value as CustomerDetailTabId;
          router.push(hrefForTab(companyId, v));
        }}
        className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-sm md:hidden"
      >
        {CUSTOMER_DETAIL_TAB_IDS.map((id) => (
          <option key={id} value={id}>
            {TAB_LABELS[id]}
          </option>
        ))}
      </select>

      <nav
        className="hidden overflow-x-auto border-b border-slate-200/90 md:flex md:gap-0.5 md:pb-px"
        aria-label="Customer workspace"
      >
        {CUSTOMER_DETAIL_TAB_IDS.map((id) => {
          const active = current === id;
          return (
            <Link
              key={id}
              href={hrefForTab(companyId, id)}
              scroll={false}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-t-lg border border-b-0 px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-slate-200/90 bg-white text-slate-900 shadow-[0_-1px_0_0_white]"
                  : "border-transparent bg-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
              )}
            >
              {TAB_LABELS[id]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

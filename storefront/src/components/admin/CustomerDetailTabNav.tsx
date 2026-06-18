"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFocusRing, adminFormInput } from "@/components/admin/admin-theme-utils";
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
        className={cn(adminFormInput, "mb-3 w-full font-medium md:hidden")}
      >
        {CUSTOMER_DETAIL_TAB_IDS.map((id) => (
          <option key={id} value={id}>
            {TAB_LABELS[id]}
          </option>
        ))}
      </select>

      <nav
        className="hidden overflow-x-auto border-b border-admin-border md:flex md:gap-0.5 md:pb-px"
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
                adminFocusRing(),
                active
                  ? "border-admin-border bg-admin-surface text-admin-primary"
                  : "border-transparent bg-transparent text-admin-secondary hover:bg-admin-surface-muted hover:text-admin-primary",
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

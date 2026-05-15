/** Deep-link tab ids for `/admin/companies/[companyId]?tab=` — user-facing workspace only. */

export const CUSTOMER_DETAIL_TAB_IDS = [
  "overview",
  "delivery",
  "products",
  "activity",
  "team",
  "billing",
] as const;

export type CustomerDetailTabId = (typeof CUSTOMER_DETAIL_TAB_IDS)[number];

export function isCustomerDetailTabId(s: string): s is CustomerDetailTabId {
  return (CUSTOMER_DETAIL_TAB_IDS as readonly string[]).includes(s);
}

export function parseCustomerDetailTab(tab: string | undefined): CustomerDetailTabId {
  const t = tab?.trim().toLowerCase() ?? "";
  if (t && isCustomerDetailTabId(t)) return t;
  return "overview";
}

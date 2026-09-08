/**
 * Storefront admin quote status updates (catalogos.quote_requests).
 * Does not require CatalogOS UI — uses service-role via getSupabaseAdmin.
 */

export const STOREFRONT_ADMIN_QUOTE_STATUSES = [
  "new",
  "reviewing",
  "quoted",
  "won",
  "lost",
] as const;

export type StorefrontAdminQuoteStatus = (typeof STOREFRONT_ADMIN_QUOTE_STATUSES)[number];

export function isStorefrontAdminQuoteStatus(value: string): value is StorefrontAdminQuoteStatus {
  return (STOREFRONT_ADMIN_QUOTE_STATUSES as readonly string[]).includes(value);
}

export const STOREFRONT_ADMIN_PROSPECT_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "closed",
] as const;

export type StorefrontAdminProspectStatus = (typeof STOREFRONT_ADMIN_PROSPECT_STATUSES)[number];

export function isStorefrontAdminProspectStatus(value: string): value is StorefrontAdminProspectStatus {
  return (STOREFRONT_ADMIN_PROSPECT_STATUSES as readonly string[]).includes(value);
}

export const STOREFRONT_ADMIN_INVOICE_OPS_STATUSES = ["new", "reviewing", "handled"] as const;

export type StorefrontAdminInvoiceOpsStatus = (typeof STOREFRONT_ADMIN_INVOICE_OPS_STATUSES)[number];

export function isStorefrontAdminInvoiceOpsStatus(
  value: string,
): value is StorefrontAdminInvoiceOpsStatus {
  return (STOREFRONT_ADMIN_INVOICE_OPS_STATUSES as readonly string[]).includes(value);
}

export function quoteStatusRequiresAction(status: string): boolean {
  return status === "new" || status === "reviewing" || status === "contacted";
}

export function prospectStatusRequiresAction(status: string): boolean {
  return status === "new" || status === "contacted" || status === "qualified";
}

export function invoiceOpsRequiresAction(status: string): boolean {
  return status === "new" || status === "reviewing";
}

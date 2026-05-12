/**
 * Active-state rules for Products module subnav (testable without React).
 */

const MODULE_PREFIXES = ["/admin/products/import", "/admin/products/review", "/admin/products/catalog-health"];

export function isProductsSubnavAllProductsActive(pathname: string): boolean {
  if (pathname === "/admin/products") return true;
  if (!pathname.startsWith("/admin/products/")) return false;
  if (MODULE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return true;
}

export function isProductsSubnavHrefActive(pathname: string, href: string): boolean {
  if (href === "/admin/products") return isProductsSubnavAllProductsActive(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

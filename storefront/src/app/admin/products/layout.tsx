import { ProductsSubnav } from "./_components/ProductsSubnav";

/**
 * Production launch scope (storefront): catalog_v2 CRUD, URL clipboard staging + review queue,
 * quote/RFQ paths, CSV export. Excludes CSV import mapper and CatalogOS batch review grid until wired upstream.
 */
export default function AdminProductsModuleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ProductsSubnav />
      {children}
    </div>
  );
}

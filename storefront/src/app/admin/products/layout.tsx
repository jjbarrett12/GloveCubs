import { ProductsSubnav } from "./_components/ProductsSubnav";

/**
 * Production launch scope (storefront): catalog_v2 CRUD, URL clipboard staging + review,
 * quote/RFQ paths, CSV export. CSV bulk mapper and remote batch review grid remain future work.
 */
export default function AdminProductsModuleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ProductsSubnav />
      {children}
    </div>
  );
}

import { ProductsSubnav } from "./_components/ProductsSubnav";

export default function AdminProductsModuleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ProductsSubnav />
      {children}
    </div>
  );
}

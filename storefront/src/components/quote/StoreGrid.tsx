"use client";

import type { StoreProductRow } from "@/lib/catalog/store-products";
import { StoreProductCard } from "@/components/store/StoreProductCard";

export function StoreGrid({ products }: { products: StoreProductRow[] }) {
  return (
    <ul className="grid min-w-0 list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4 xl:gap-5">
      {products.map((p) => (
        <li key={p.id} className="min-w-0">
          <StoreProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}

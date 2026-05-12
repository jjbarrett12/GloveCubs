"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isProductsSubnavHrefActive } from "./products-subnav-active";

const ITEMS: { href: string; label: string }[] = [
  { href: "/admin/products", label: "All products" },
  { href: "/admin/products/import", label: "Import" },
  { href: "/admin/products/review", label: "Review queue" },
  { href: "/admin/products/catalog-health", label: "Catalog health" },
];

export function ProductsSubnav() {
  const pathname = usePathname() || "";

  return (
    <nav
      aria-label="Products module"
      className="-mt-2 mb-6 flex flex-wrap items-center gap-1 border-b border-gray-200 pb-3"
    >
      {ITEMS.map((item) => {
        const active = isProductsSubnavHrefActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
                : "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

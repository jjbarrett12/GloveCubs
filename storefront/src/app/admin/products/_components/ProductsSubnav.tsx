"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isProductsSubnavHrefActive } from "./products-subnav-active";

const ITEMS: { href: string; label: string }[] = [
  { href: "/admin/products", label: "All products" },
  { href: "/admin/products/import", label: "Import" },
  { href: "/admin/products/review", label: "Review & staging" },
  { href: "/admin/products/catalog-health", label: "Catalog quality" },
];

export function ProductsSubnav() {
  const pathname = usePathname() || "";

  return (
    <nav
      aria-label="Products module"
      className="-mt-1 mb-6 flex flex-wrap items-center gap-1.5 border-b border-slate-200/90 pb-4"
    >
      {ITEMS.map((item) => {
        const active = isProductsSubnavHrefActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "inline-flex items-center rounded-lg bg-[#f06232] px-3.5 py-2 text-sm font-semibold text-white shadow-sm"
                : "inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

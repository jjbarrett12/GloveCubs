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
      className="-mt-2 mb-6 flex flex-wrap items-center gap-1 border-b border-white/10 pb-3"
    >
      {ITEMS.map((item) => {
        const active = isProductsSubnavHrefActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "inline-flex items-center rounded-md bg-[#f06232] px-3 py-1.5 text-sm font-medium text-white shadow-sm"
                : "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminFocusRing, adminPrimaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
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
      className="-mt-1 mb-6 flex flex-wrap items-center gap-1.5 border-b border-admin-border pb-4"
    >
      {ITEMS.map((item) => {
        const active = isProductsSubnavHrefActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              adminFocusRing(),
              active
                ? adminPrimaryButton
                : "text-admin-muted hover:bg-admin-surface-muted hover:text-admin-primary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

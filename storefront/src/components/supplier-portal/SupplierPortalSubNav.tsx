"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/supplier-portal/dashboard", label: "Dashboard" },
  { href: "/supplier-portal/offers", label: "Offers" },
  { href: "/supplier-portal/competitiveness", label: "Competitiveness" },
  { href: "/supplier-portal/feed-health", label: "Feed Health" },
  { href: "/supplier-portal/upload", label: "Upload" },
] as const;

export function SupplierPortalSubNav() {
  const pathname = usePathname();
  return (
    <nav
      className="mx-auto max-w-7xl overflow-x-auto overflow-y-visible overscroll-x-contain border-t border-gray-100 px-4 [-webkit-overflow-scrolling:touch]"
      aria-label="Supplier portal sections"
    >
      <div className="flex w-max min-h-11 items-stretch gap-2 py-1 md:gap-6 md:py-0">
        {ITEMS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "inline-flex shrink-0 items-center border-b-2 px-2 text-sm font-medium md:px-1",
                "min-h-11 min-w-[44px] justify-center sm:min-w-0 sm:justify-start",
                active
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

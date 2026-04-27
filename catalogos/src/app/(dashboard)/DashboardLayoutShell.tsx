"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinkClass =
  "flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted text-foreground";

export default function DashboardLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background">
      <div className="sticky top-0 z-20 flex h-14 min-h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border hover:bg-muted"
          aria-expanded={sidebarOpen}
          aria-controls="catalogos-dashboard-sidebar"
          aria-label={sidebarOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setSidebarOpen((o) => !o)}
        >
          {sidebarOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
        <Link href="/dashboard" className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          CatalogOS
        </Link>
      </div>

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed bottom-0 left-0 right-0 top-14 z-30 bg-black/50 md:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          id="catalogos-dashboard-sidebar"
          className={cn(
            "fixed bottom-0 left-0 top-14 z-40 flex w-56 max-h-[calc(100dvh-3.5rem)] flex-col border-r border-border bg-muted/30 transition-transform duration-200 ease-out md:top-0 md:max-h-none md:min-h-screen md:relative md:z-0 md:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          <div className="flex items-center justify-between border-b border-border p-3 md:hidden">
            <span className="text-sm font-semibold">Navigation</span>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border hover:bg-muted"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            <Link href="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground min-h-11 inline-flex items-center">
              ← CatalogOS
            </Link>
            <nav className="mt-2 flex flex-col gap-1">
              <Link href="/dashboard" className={navLinkClass}>
                Dashboard
              </Link>
              <Link href="/dashboard/suppliers" className={navLinkClass}>
                Suppliers
              </Link>
              <Link href="/dashboard/feeds" className={navLinkClass}>
                Feeds
              </Link>
              <Link href="/dashboard/ingestion" className={cn(navLinkClass, "font-medium")}>
                Ingestion
              </Link>
              <Link href="/dashboard/csv-import" className={navLinkClass}>
                AI CSV import
              </Link>
              <Link href="/dashboard/batches" className={navLinkClass}>
                Batches
              </Link>
              <Link href="/dashboard/imports" className={navLinkClass}>
                Import monitoring
              </Link>
              <Link href="/dashboard/staging" className={navLinkClass}>
                Staging
              </Link>
              <Link href="/dashboard/review" className={navLinkClass}>
                Review queue
              </Link>
              <Link href="/dashboard/products/quick-add" className={navLinkClass}>
                Quick add product
              </Link>
              <Link href="/dashboard/products/bulk-add" className={navLinkClass}>
                CSV bulk add
              </Link>
              <Link href="/dashboard/publish" className={navLinkClass}>
                Publish-ready
              </Link>
              <Link href="/dashboard/master-products" className={navLinkClass}>
                Master products
              </Link>
              <Link href="/dashboard/discovery/runs" className={navLinkClass}>
                Discovery
              </Link>
              <Link href="/dashboard/quotes" className={navLinkClass}>
                Quotes / RFQ
              </Link>
              <Link href="/dashboard/rfq" className={cn(navLinkClass, "font-medium")}>
                RFQ queue
              </Link>
              <Link href="/dashboard/onboarding" className={navLinkClass}>
                Onboarding
              </Link>
              <Link href="/dashboard/catalog-expansion" className={navLinkClass}>
                Catalog expansion
              </Link>
              <Link href="/dashboard/product-matching" className={navLinkClass}>
                Product matching
              </Link>
              <Link href="/dashboard/operations" className={cn(navLinkClass, "font-medium")}>
                Operations
              </Link>
              <Link href="/admin/distributors" className={navLinkClass}>
                Distributors
              </Link>
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

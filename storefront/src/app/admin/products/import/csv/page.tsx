import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/admin";

export const metadata = {
  title: "CSV import roadmap | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default function AdminProductsImportCsvPage() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-4 pb-8 shadow-md ring-1 ring-black/30 sm:p-5">
      <PageHeader
        variant="dark"
        title="CSV import (roadmap)"
        description="Spreadsheet ingestion is not wired in the storefront yet. Export the current catalog grid as CSV from the command center; feed mapping stays a CatalogOS roadmap item."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "Import", href: "/admin/products/import" },
          { label: "CSV" },
        ]}
      />

      <div className="mb-4 text-sm">
        <Link href="/admin/products/import/url" className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
          Import from URL
        </Link>
        <span className="mx-2 text-neutral-600">|</span>
        <Link href="/admin/products/import/jobs" className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
          View import jobs
        </Link>
      </div>

      <div className="rounded-lg border border-dashed border-white/15 bg-[#141414]">
        <EmptyState
          variant="dark"
          title="CSV import not wired here yet"
          description="Use URL clipboard staging or CatalogOS ingestion for now. Export the current grid as CSV from the product command center when you need a baseline file."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/admin/products"
                className="inline-flex rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d]"
              >
                Command center
              </Link>
              <a
                href="/admin/api/products/export"
                className="inline-flex rounded-md border border-white/15 bg-white/[0.06] px-4 py-2 text-sm text-neutral-200 shadow-sm hover:border-[#f06232]/35 hover:text-white"
              >
                Export CSV
              </a>
            </div>
          }
        />
      </div>
    </div>
  );
}

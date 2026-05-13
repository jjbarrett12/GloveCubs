import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/admin";

export const metadata = {
  title: "CSV import (coming soon) | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default function AdminProductsImportCsvPage() {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title="CSV import (coming soon)"
        description="Spreadsheet uploads will land here in a future release. Until then, export your catalog from Products or use URL import."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "Import", href: "/admin/products/import" },
          { label: "CSV" },
        ]}
      />

      <div className="mb-6 text-sm">
        <Link href="/admin/products/import/url" className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline">
          Import from URL
        </Link>
        <span className="mx-2 text-slate-300">|</span>
        <Link href="/admin/products/import/jobs" className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline">
          Import activity
        </Link>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80">
        <EmptyState
          title="CSV import is not available in this console yet"
          description="Use URL import and Review & staging for now. Export the current grid as CSV from Products when you need a baseline file."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/admin/products"
                className="inline-flex rounded-lg bg-[#f06232] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d]"
              >
                Back to products
              </Link>
              <a
                href="/admin/api/products/export"
                className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50"
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

import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/admin";
import { adminLink, adminMutedPanel, adminPrimaryButton, adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "CSV import (coming soon) | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default function AdminProductsImportCsvPage() {
  return (
    <div>
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
        <Link href="/admin/products/import/url" className={adminLink}>
          Import from URL
        </Link>
        <span className="mx-2 text-admin-border">|</span>
        <Link href="/admin/products/import/jobs" className={adminLink}>
          Import activity
        </Link>
      </div>

      <div className={cn(adminMutedPanel, "border-solid")}>
        <EmptyState
          title="CSV import is not available in this console yet"
          description="Use URL import and Review & staging for now. Export the current grid as CSV from Products when you need a baseline file."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/admin/products" className={cn(adminPrimaryButton, "inline-flex px-4 py-2.5")}>
                Back to products
              </Link>
              <a
                href="/admin/api/products/export"
                className={cn(adminSecondaryButton, "inline-flex px-4 py-2.5")}
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

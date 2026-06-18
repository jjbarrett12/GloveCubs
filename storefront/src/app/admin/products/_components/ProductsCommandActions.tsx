import Link from "next/link";
import { adminPrimaryButton, adminSecondaryButton } from "@/components/admin/admin-theme-utils";

export function ProductsCommandActions() {
  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/products/new" className={adminPrimaryButton}>
          Add product
        </Link>
        <Link href="/admin/products/import/url" className={adminSecondaryButton}>
          Import from URL
        </Link>
        <Link href="/admin/products/review" className={adminSecondaryButton}>
          Review & staging
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-admin-border pt-3 sm:border-t-0 sm:pt-0">
        <a href="/admin/api/products/export" className={adminSecondaryButton}>
          Export CSV
        </a>
        <Link href="/admin/products/import/jobs" className={adminSecondaryButton}>
          Import activity
        </Link>
        <Link href="/admin/products/import/csv" className={adminSecondaryButton}>
          CSV (coming soon)
        </Link>
      </div>
    </div>
  );
}

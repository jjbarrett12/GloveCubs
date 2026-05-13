import Link from "next/link";

const primary =
  "inline-flex items-center justify-center rounded-md bg-[#f06232] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d] hover:shadow-md";
const secondary =
  "inline-flex items-center justify-center rounded-md border border-white/12 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-neutral-200 shadow-sm transition hover:border-[#f06232]/35 hover:bg-white/[0.07] hover:text-white";

export function ProductsCommandActions() {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/products/new" className={primary}>
          + Add product
        </Link>
        <Link href="/admin/products/import/url" className={secondary}>
          Import from URL
        </Link>
        <Link href="/admin/products/review" className={secondary}>
          Review queue
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-white/10 pt-2 sm:border-t-0 sm:pt-0">
        <a href="/admin/api/products/export" className={secondary}>
          Export CSV
        </a>
        <Link href="/admin/products/import/jobs" className={secondary}>
          Import jobs
        </Link>
        <Link href="/admin/products/import/csv" className={secondary}>
          CSV import (roadmap)
        </Link>
      </div>
    </div>
  );
}

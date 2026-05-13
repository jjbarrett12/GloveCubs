import Link from "next/link";

const primary =
  "inline-flex items-center justify-center rounded-lg bg-[#f06232] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d]";
const secondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50";

export function ProductsCommandActions() {
  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/products/new" className={primary}>
          Add product
        </Link>
        <Link href="/admin/products/import/url" className={secondary}>
          Import from URL
        </Link>
        <Link href="/admin/products/review" className={secondary}>
          Review & staging
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-200/90 pt-3 sm:border-t-0 sm:pt-0">
        <a href="/admin/api/products/export" className={secondary}>
          Export CSV
        </a>
        <Link href="/admin/products/import/jobs" className={secondary}>
          Import activity
        </Link>
        <Link href="/admin/products/import/csv" className={secondary}>
          CSV (coming soon)
        </Link>
      </div>
    </div>
  );
}

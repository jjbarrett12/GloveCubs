"use client";

import Link from "next/link";
import { mergeStoreCatalogHref } from "@/lib/catalog/store-url";
import type { StoreCatalogUrlState } from "@/lib/catalog/store-url";

export function StorePagination({
  urlState,
  total,
  limit,
}: {
  urlState: StoreCatalogUrlState;
  total: number;
  limit: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  const cur = Math.min(urlState.page ?? 1, totalPages);
  const prev = cur > 1 ? mergeStoreCatalogHref(urlState, { page: cur - 1 }) : null;
  const next = cur < totalPages ? mergeStoreCatalogHref(urlState, { page: cur + 1 }) : null;

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-6" aria-label="Pagination">
      {prev ? (
        <Link
          href={prev}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-white/80 hover:border-[#f06232]/50 hover:text-[#f06232]"
        >
          Previous
        </Link>
      ) : (
        <span className="rounded-md border border-transparent px-3 py-1.5 text-sm text-white/30">Previous</span>
      )}
      <span className="px-2 text-sm text-white/55">
        Page {cur} of {totalPages}
      </span>
      {next ? (
        <Link
          href={next}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium text-white/80 hover:border-[#f06232]/50 hover:text-[#f06232]"
        >
          Next
        </Link>
      ) : (
        <span className="rounded-md border border-transparent px-3 py-1.5 text-sm text-white/30">Next</span>
      )}
    </nav>
  );
}

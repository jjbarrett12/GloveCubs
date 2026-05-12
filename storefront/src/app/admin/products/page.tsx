import Link from "next/link";
import { ProductImage } from "@/components/store/ProductImage";
import {
  fetchAdminProductsPage,
  parseAdminProductListQuery,
  type AdminProductListRow,
} from "@/lib/admin/product-operations";
import {
  PageHeader,
  StatCard,
  StatGrid,
  TableCard,
  TableToolbar,
  EmptyState,
  StatusBadge,
} from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Products | GloveCubs admin",
  robots: { index: false, follow: false },
};

function buildQuery(base: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const merged = { ...base, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "") continue;
    sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function healthLabel(row: AdminProductListRow): string {
  if (row.imageHealth === "missing") return "Missing";
  if (row.imageHealth === "placeholder_only") return "Placeholder";
  return "OK";
}

function pdpLabel(row: AdminProductListRow): string {
  if (row.pdpHealth === "n_a") return "—";
  if (row.pdpHealth === "thin") return "Thin";
  return "OK";
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = parseAdminProductListQuery(searchParams);
  const result = await fetchAdminProductsPage(qs);

  const baseQs: Record<string, string | undefined> = {
    q: qs.q || undefined,
    status: qs.status === "all" ? undefined : qs.status,
    sort: qs.sort === "newest" ? undefined : qs.sort,
    category: qs.categoryId ?? undefined,
    brand: qs.brand || undefined,
    limit: String(qs.limit),
    missing_images: qs.filters.missing_images ? "1" : undefined,
    placeholder_only_images: qs.filters.placeholder_only_images ? "1" : undefined,
    thin_pdp: qs.filters.thin_pdp ? "1" : undefined,
    missing_glove_attributes: qs.filters.missing_glove_attributes ? "1" : undefined,
    orphan_category: qs.filters.orphan_category ? "1" : undefined,
    variant_issues: qs.filters.variant_issues ? "1" : undefined,
    duplicate_warnings: qs.filters.duplicate_warnings ? "1" : undefined,
    pending_match_reviews: qs.filters.pending_match_reviews ? "1" : undefined,
  };

  const totalPages = Math.max(1, Math.ceil(result.total / qs.limit) || 1);
  const catalogosBase = process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/$/, "") ?? "";

  const missingImages = result.rows.filter((r) => r.imageHealth === "missing").length;
  const placeholderImages = result.rows.filter((r) => r.imageHealth === "placeholder_only").length;
  const thinPdp = result.rows.filter((r) => r.pdpHealth === "thin").length;
  const withWarnings = result.rows.filter((r) => r.warnings.length > 0).length;

  return (
    <div>
      <PageHeader
        title="Products"
        description="Read-only operational view of catalog_v2 and catalogos. Ingestion and edits stay in CatalogOS."
        actions={
          catalogosBase ? (
            <a
              href={`${catalogosBase}/dashboard/url-import`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Open CatalogOS
            </a>
          ) : null
        }
      />

      {!result.configured ? (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase is not configured. Set credentials to load the product grid.
        </div>
      ) : null}

      {result.error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {result.error}
        </div>
      ) : null}

      {result.scanLimited ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50/70 px-4 py-2 text-xs text-amber-800">
          Governance or search scan capped at 5,000 products by recency. Refine filters or search to narrow results.
        </div>
      ) : null}

      <StatGrid columns={4} className="mb-6">
        <StatCard label="Matching" value={result.total} color="blue" accentBorder />
        <StatCard label="Missing images" value={missingImages} color={missingImages > 0 ? "red" : "default"} accentBorder />
        <StatCard label="Placeholder only" value={placeholderImages} color={placeholderImages > 0 ? "amber" : "default"} accentBorder />
        <StatCard label="Thin PDP" value={thinPdp} color={thinPdp > 0 ? "amber" : "default"} accentBorder />
      </StatGrid>

      <TableCard className="mb-6">
        <form method="get" className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-12 md:items-end">
            <div className="md:col-span-4">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Search</label>
              <input
                name="q"
                type="search"
                defaultValue={qs.q}
                placeholder="Name, slug, SKU, GTIN, brand, category…"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Status</label>
              <select
                name="status"
                defaultValue={qs.status}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Sort</label>
              <select
                name="sort"
                defaultValue={qs.sort}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="newest">Newest updated</option>
                <option value="oldest">Oldest updated</option>
                <option value="most_variants">Most variants</option>
                <option value="least_variants">Least variants</option>
                <option value="warnings_desc">Warnings (most)</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Category ID</label>
              <input
                name="category"
                defaultValue={qs.categoryId ?? ""}
                placeholder="UUID"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Brand contains</label>
              <input
                name="brand"
                defaultValue={qs.brand}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Governance filters</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-700">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="missing_images" value="1" defaultChecked={qs.filters.missing_images} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Missing images
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="placeholder_only_images" value="1" defaultChecked={qs.filters.placeholder_only_images} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Placeholder-only
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="thin_pdp" value="1" defaultChecked={qs.filters.thin_pdp} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Thin PDP
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="missing_glove_attributes" value="1" defaultChecked={qs.filters.missing_glove_attributes} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Missing glove attrs
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="orphan_category" value="1" defaultChecked={qs.filters.orphan_category} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Orphan category
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="variant_issues" value="1" defaultChecked={qs.filters.variant_issues} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Variant issues
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="duplicate_warnings" value="1" defaultChecked={qs.filters.duplicate_warnings} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Duplicate warnings
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" name="pending_match_reviews" value="1" defaultChecked={qs.filters.pending_match_reviews} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Pending match reviews
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <input type="hidden" name="limit" value={String(qs.limit)} />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Apply
            </button>
            <Link href="/admin/products" className="text-xs text-gray-500 hover:text-gray-800">
              Reset
            </Link>
            <span className="text-xs text-gray-500">
              {result.configured ? (
                <>
                  <span className="font-mono text-gray-800">{result.total}</span> matching
                </>
              ) : null}
            </span>
          </div>
        </form>

        <TableToolbar className="bg-gray-50 text-xs text-gray-500">
          <span>
            Page <span className="font-mono text-gray-800">{qs.page}</span> of{" "}
            <span className="font-mono text-gray-800">{totalPages}</span>
          </span>
          <span className="ml-auto inline-flex gap-2">
            {qs.page > 1 ? (
              <Link
                className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
                href={`/admin/products${buildQuery(baseQs, { page: String(qs.page - 1) })}`}
              >
                Previous
              </Link>
            ) : null}
            {qs.page < totalPages ? (
              <Link
                className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-50"
                href={`/admin/products${buildQuery(baseQs, { page: String(qs.page + 1) })}`}
              >
                Next
              </Link>
            ) : null}
          </span>
        </TableToolbar>

        {result.rows.length === 0 ? (
          <EmptyState
            title="No products in this view"
            description="Adjust filters or search to broaden the result."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Image</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Visible</th>
                  <th className="px-3 py-2">Variants</th>
                  <th className="px-3 py-2">Images</th>
                  <th className="px-3 py-2">PDP</th>
                  <th className="px-3 py-2">Quote</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-gray-900">
                {result.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-2 align-middle">
                      <Link href={`/admin/products/${row.id}`} className="block w-14 shrink-0">
                        <ProductImage
                          src={row.primaryImageUrl}
                          alt={row.name}
                          containerClassName="!rounded-md !border-gray-200"
                          loading="lazy"
                        />
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Link href={`/admin/products/${row.id}`} className="font-medium text-blue-700 hover:underline">
                        {row.name}
                      </Link>
                      <div className="mt-0.5 font-mono text-[10px] text-gray-400">{row.id}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">{row.brandName ?? "—"}</td>
                    <td className="px-3 py-2 align-top text-gray-700">{row.categoryName ?? "—"}</td>
                    <td className="px-3 py-2 align-top">
                      <StatusBadge status={row.status === "active" ? "enabled" : row.status === "archived" ? "disabled" : "pending"} />
                    </td>
                    <td className="px-3 py-2 align-top">{row.storefrontVisible ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 align-top font-mono text-gray-700">{row.activeVariantCount}</td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {healthLabel(row)}
                      <span className="text-gray-400"> ({row.imageCount})</span>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">{pdpLabel(row)}</td>
                    <td className="px-3 py-2 align-top">{row.quoteEnabled ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 align-top font-mono text-[10px] text-gray-500">
                      {row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="font-mono text-gray-800">{row.warnings.length}</span>
                      {row.warnings.length > 0 ? (
                        <ul className="mt-1 max-w-[200px] list-inside list-disc text-[10px] text-amber-700">
                          {row.warnings.slice(0, 3).map((w) => (
                            <li key={w.code}>{w.label}</li>
                          ))}
                          {row.warnings.length > 3 ? <li>…</li> : null}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.total > 0 && (withWarnings > 0) ? (
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
            <span className="font-mono text-amber-700">{withWarnings}</span> of {result.rows.length} rows on this page have governance warnings.
          </div>
        ) : null}
      </TableCard>
    </div>
  );
}

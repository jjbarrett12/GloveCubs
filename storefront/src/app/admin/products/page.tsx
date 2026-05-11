import Link from "next/link";
import { ProductImage } from "@/components/store/ProductImage";
import {
  fetchAdminProductsPage,
  parseAdminProductListQuery,
  type AdminProductListRow,
} from "@/lib/admin/product-operations";

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

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Products</h1>
          <p className="mt-1 max-w-3xl text-sm text-white/60">
            Read-only operational view of <code className="text-white/70">catalog_v2</code> and{" "}
            <code className="text-white/70">catalogos</code>. Ingestion and edits stay in CatalogOS.
          </p>
        </div>
        {catalogosBase ? (
          <a
            href={`${catalogosBase}/dashboard/url-import`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white hover:bg-white/[0.1]"
          >
            Open CatalogOS
          </a>
        ) : null}
      </div>

      {!result.configured ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-100">
          Supabase is not configured. Set credentials to load the product grid.
        </p>
      ) : null}

      {result.error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-100">
          {result.error}
        </p>
      ) : null}

      {result.scanLimited ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2 text-[11px] text-amber-100/90">
          Governance or search scan capped at 5,000 products by recency. Refine filters or search to narrow results.
        </p>
      ) : null}

      <form method="get" className="space-y-4 rounded-xl border border-white/10 bg-[#121212] p-4">
        <div className="grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-4">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/45">Search</label>
            <input
              name="q"
              type="search"
              defaultValue={qs.q}
              placeholder="Name, slug, SKU, GTIN, brand, category…"
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/45">Status</label>
            <select
              name="status"
              defaultValue={qs.status}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/45">Sort</label>
            <select
              name="sort"
              defaultValue={qs.sort}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
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
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/45">Category ID</label>
            <input
              name="category"
              defaultValue={qs.categoryId ?? ""}
              placeholder="UUID"
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white placeholder:text-white/35"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-white/45">Brand contains</label>
            <input
              name="brand"
              defaultValue={qs.brand}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/35"
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Governance filters</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-white/75">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="missing_images" value="1" defaultChecked={qs.filters.missing_images} />
              Missing images
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                name="placeholder_only_images"
                value="1"
                defaultChecked={qs.filters.placeholder_only_images}
              />
              Placeholder-only
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="thin_pdp" value="1" defaultChecked={qs.filters.thin_pdp} />
              Thin PDP
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                name="missing_glove_attributes"
                value="1"
                defaultChecked={qs.filters.missing_glove_attributes}
              />
              Missing glove attrs
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="orphan_category" value="1" defaultChecked={qs.filters.orphan_category} />
              Orphan category
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="variant_issues" value="1" defaultChecked={qs.filters.variant_issues} />
              Variant issues
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" name="duplicate_warnings" value="1" defaultChecked={qs.filters.duplicate_warnings} />
              Duplicate warnings
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                name="pending_match_reviews"
                value="1"
                defaultChecked={qs.filters.pending_match_reviews}
              />
              Pending match reviews
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="limit" value={String(qs.limit)} />
          <button
            type="submit"
            className="rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ff7a4d]"
          >
            Apply
          </button>
          <Link href="/admin/products" className="text-xs text-white/50 hover:text-white/80">
            Reset
          </Link>
          <span className="text-xs text-white/40">
            {result.configured ? (
              <>
                <span className="font-mono text-white/70">{result.total}</span> matching
              </>
            ) : null}
          </span>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#101010]">
        <table className="min-w-[1100px] w-full border-collapse text-left text-[12px]">
          <thead className="border-b border-white/10 bg-black/40 text-[10px] font-semibold uppercase tracking-wide text-white/45">
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
          <tbody className="text-white/80">
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-sm text-white/45">
                  No products in this view.
                </td>
              </tr>
            ) : (
              result.rows.map((row) => (
                <tr key={row.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="px-3 py-2 align-middle">
                    <Link href={`/admin/products/${row.id}`} className="block w-14 shrink-0">
                      <ProductImage
                        src={row.primaryImageUrl}
                        alt={row.name}
                        containerClassName="!rounded-md !border-white/[0.08]"
                        loading="lazy"
                      />
                    </Link>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link href={`/admin/products/${row.id}`} className="font-medium text-[#f06232]/95 hover:underline">
                      {row.name}
                    </Link>
                    <div className="mt-0.5 font-mono text-[10px] text-white/40">{row.id}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-white/70">{row.brandName ?? "—"}</td>
                  <td className="px-3 py-2 align-top text-white/70">{row.categoryName ?? "—"}</td>
                  <td className="px-3 py-2 align-top">
                    <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase text-white/75">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">{row.storefrontVisible ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 align-top font-mono text-white/75">{row.activeVariantCount}</td>
                  <td className="px-3 py-2 align-top text-white/70">
                    {healthLabel(row)}
                    <span className="text-white/35"> ({row.imageCount})</span>
                  </td>
                  <td className="px-3 py-2 align-top text-white/70">{pdpLabel(row)}</td>
                  <td className="px-3 py-2 align-top">{row.quoteEnabled ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 align-top font-mono text-[10px] text-white/50">
                    {row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="font-mono text-white/80">{row.warnings.length}</span>
                    {row.warnings.length > 0 ? (
                      <ul className="mt-1 max-w-[200px] list-inside list-disc text-[10px] text-amber-100/85">
                        {row.warnings.slice(0, 3).map((w) => (
                          <li key={w.code}>{w.label}</li>
                        ))}
                        {row.warnings.length > 3 ? <li>…</li> : null}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {result.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/55">
          <span>
            Page <span className="font-mono text-white/80">{qs.page}</span> of{" "}
            <span className="font-mono text-white/80">{totalPages}</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {qs.page > 1 ? (
              <Link
                className="rounded border border-white/15 px-2 py-1 text-white/80 hover:bg-white/[0.06]"
                href={`/admin/products${buildQuery(baseQs, { page: String(qs.page - 1) })}`}
              >
                Previous
              </Link>
            ) : null}
            {qs.page < totalPages ? (
              <Link
                className="rounded border border-white/15 px-2 py-1 text-white/80 hover:bg-white/[0.06]"
                href={`/admin/products${buildQuery(baseQs, { page: String(qs.page + 1) })}`}
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

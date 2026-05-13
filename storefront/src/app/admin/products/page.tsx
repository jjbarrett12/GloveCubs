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
import { ProductsCommandActions } from "@/app/admin/products/_components/ProductsCommandActions";
import { ProductsWorkspaceTabs } from "@/app/admin/products/_components/ProductsWorkspaceTabs";
import { listClipboardStaging } from "@/lib/admin/clipboard-url-staging";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { ClipboardUrlStagingClient } from "@/app/admin/products/import/_components/ClipboardUrlStagingClient";

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

function parseWorkspaceTab(sp: Record<string, string | string[] | undefined>): string | undefined {
  const raw = sp.tab;
  const v = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? (raw[0] ?? "").trim() : "";
  return ["products", "drafts", "url-imports", "needs-review", "archived"].includes(v) ? v : undefined;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const tab = parseWorkspaceTab(searchParams);
  const qs = parseAdminProductListQuery(searchParams);
  const listQs = { ...qs, filters: { ...qs.filters } };
  if (tab === "products") listQs.status = "active";
  else if (tab === "drafts") listQs.status = "draft";
  else if (tab === "archived") listQs.status = "archived";
  else if (tab === "needs-review") {
    listQs.status = "all";
    listQs.filters.pending_match_reviews = true;
  }

  const isUrlImports = tab === "url-imports";

  const result = isUrlImports
    ? {
        rows: [] as AdminProductListRow[],
        total: 0,
        page: 1,
        limit: qs.limit,
        scanLimited: false,
        configured: true,
        error: null as string | null,
      }
    : await fetchAdminProductsPage(listQs);

  let stagingRows: Awaited<ReturnType<typeof listClipboardStaging>> = [];
  let stagingCategories: Awaited<ReturnType<typeof fetchAdminCategoriesForProductForm>> = [];
  if (isUrlImports) {
    const pair = await Promise.all([listClipboardStaging(50), fetchAdminCategoriesForProductForm()]);
    stagingRows = pair[0];
    stagingCategories = pair[1];
  }

  const baseQs: Record<string, string | undefined> = {
    q: qs.q || undefined,
    status: tab ? undefined : qs.status === "all" ? undefined : qs.status,
    sort: qs.sort === "newest" ? undefined : qs.sort,
    category: qs.categoryId ?? undefined,
    brand: qs.brand || undefined,
    limit: String(qs.limit),
    missing_images: listQs.filters.missing_images ? "1" : undefined,
    placeholder_only_images: listQs.filters.placeholder_only_images ? "1" : undefined,
    thin_pdp: listQs.filters.thin_pdp ? "1" : undefined,
    missing_glove_attributes: listQs.filters.missing_glove_attributes ? "1" : undefined,
    orphan_category: listQs.filters.orphan_category ? "1" : undefined,
    variant_issues: listQs.filters.variant_issues ? "1" : undefined,
    duplicate_warnings: listQs.filters.duplicate_warnings ? "1" : undefined,
    pending_match_reviews: listQs.filters.pending_match_reviews ? "1" : undefined,
    tab: tab ?? undefined,
  };

  const totalPages = Math.max(1, Math.ceil(result.total / qs.limit) || 1);
  const catalogosBase = process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/$/, "") ?? "";

  const missingImages = result.rows.filter((r) => r.imageHealth === "missing").length;
  const placeholderImages = result.rows.filter((r) => r.imageHealth === "placeholder_only").length;
  const thinPdp = result.rows.filter((r) => r.pdpHealth === "thin").length;
  const withWarnings = result.rows.filter((r) => r.warnings.length > 0).length;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-4 shadow-md ring-1 ring-black/30 sm:p-5">
      <PageHeader
        variant="dark"
        title="Product command center"
        description="Manage catalog_v2 parents, variants, and imagery. URL clipboard staging never auto-publishes; CatalogOS crawl remains available for deep extraction."
        actions={
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <ProductsCommandActions />
            {catalogosBase ? (
              <a
                href={`${catalogosBase}/dashboard/url-import`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-md border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-medium text-neutral-200 shadow-sm transition hover:border-[#f06232]/35 hover:bg-white/[0.08] sm:w-auto"
              >
                Open CatalogOS URL import
              </a>
            ) : null}
          </div>
        }
      />

      <ProductsWorkspaceTabs activeTab={tab} variant="dark" />

      {!result.configured ? (
        <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Supabase is not configured. Set credentials to load the product grid.
        </div>
      ) : null}

      {result.error ? (
        <div className="mb-4 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{result.error}</div>
      ) : null}

      {result.scanLimited ? (
        <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-4 py-2 text-xs text-amber-100/90">
          Governance or search scan capped at 5,000 products by recency. Refine filters or search to narrow results.
        </div>
      ) : null}

      {isUrlImports ? (
        <div className="mb-6 space-y-4">
          <div className="rounded-lg border border-white/10 bg-[#161616] px-4 py-3 text-sm text-neutral-300">
            <strong className="text-white">Clipboard URLs</strong> — stage distributor or manufacturer PDP links, review extracted evidence,
            then promote to a <em className="text-[#f06232]">draft</em> catalog product. For full-site crawls, use{" "}
            <Link href="/admin/products/import/url" className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
              Import from URL (tools)
            </Link>{" "}
            or CatalogOS.
          </div>
          {isUrlImports ? (
            <ClipboardUrlStagingClient categories={stagingCategories} initialRows={stagingRows} />
          ) : null}
        </div>
      ) : null}

      {!isUrlImports ? (
        <>
          <StatGrid columns={4} className="mb-5 gap-3">
            <StatCard label="Matching" value={result.total} color="blue" accentBorder variant="dark" />
            <StatCard label="Missing images" value={missingImages} color={missingImages > 0 ? "red" : "default"} accentBorder variant="dark" />
            <StatCard
              label="Placeholder only"
              value={placeholderImages}
              color={placeholderImages > 0 ? "amber" : "default"}
              accentBorder
              variant="dark"
            />
            <StatCard label="Thin PDP" value={thinPdp} color={thinPdp > 0 ? "amber" : "default"} accentBorder variant="dark" />
          </StatGrid>

          <TableCard className="mb-6" variant="dark">
        <form method="get" className="space-y-4 border-b border-white/10 p-4">
          {tab ? <input type="hidden" name="tab" value={tab} /> : null}
          <div className="grid gap-3 md:grid-cols-12 md:items-end">
            <div className="md:col-span-4">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Search</label>
              <input
                name="q"
                type="search"
                defaultValue={qs.q}
                placeholder="Name, slug, SKU, GTIN, brand, category…"
                className="mt-1 w-full rounded-md border border-white/12 bg-[#181818] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Status</label>
              <select
                name="status"
                defaultValue={listQs.status}
                disabled={Boolean(tab)}
                className="mt-1 w-full rounded-md border border-white/12 bg-[#181818] px-2 py-2 text-sm text-neutral-100 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Sort</label>
              <select
                name="sort"
                defaultValue={qs.sort}
                className="mt-1 w-full rounded-md border border-white/12 bg-[#181818] px-2 py-2 text-sm text-neutral-100 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40"
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
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Category ID</label>
              <input
                name="category"
                defaultValue={qs.categoryId ?? ""}
                placeholder="UUID"
                className="mt-1 w-full rounded-md border border-white/12 bg-[#181818] px-3 py-2 font-mono text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Brand contains</label>
              <input
                name="brand"
                defaultValue={qs.brand}
                className="mt-1 w-full rounded-md border border-white/12 bg-[#181818] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40"
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Governance filters</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-neutral-300">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="missing_images"
                  value="1"
                  defaultChecked={listQs.filters.missing_images}
                  className="rounded border-white/20 bg-[#181818] text-[#f06232] focus:ring-[#f06232]/40"
                />
                Missing images
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="placeholder_only_images"
                  value="1"
                  defaultChecked={listQs.filters.placeholder_only_images}
                  className="rounded border-white/20 bg-[#181818] text-[#f06232] focus:ring-[#f06232]/40"
                />
                Placeholder-only
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="thin_pdp"
                  value="1"
                  defaultChecked={listQs.filters.thin_pdp}
                  className="rounded border-white/20 bg-[#181818] text-[#f06232] focus:ring-[#f06232]/40"
                />
                Thin PDP
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="missing_glove_attributes"
                  value="1"
                  defaultChecked={listQs.filters.missing_glove_attributes}
                  className="rounded border-white/20 bg-[#181818] text-[#f06232] focus:ring-[#f06232]/40"
                />
                Missing glove attrs
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="orphan_category"
                  value="1"
                  defaultChecked={listQs.filters.orphan_category}
                  className="rounded border-white/20 bg-[#181818] text-[#f06232] focus:ring-[#f06232]/40"
                />
                Orphan category
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="variant_issues"
                  value="1"
                  defaultChecked={listQs.filters.variant_issues}
                  className="rounded border-white/20 bg-[#181818] text-[#f06232] focus:ring-[#f06232]/40"
                />
                Variant issues
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="duplicate_warnings"
                  value="1"
                  defaultChecked={listQs.filters.duplicate_warnings}
                  className="rounded border-white/20 bg-[#181818] text-[#f06232] focus:ring-[#f06232]/40"
                />
                Duplicate warnings
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="pending_match_reviews"
                  value="1"
                  defaultChecked={listQs.filters.pending_match_reviews}
                  className="rounded border-white/20 bg-[#181818] text-[#f06232] focus:ring-[#f06232]/40"
                />
                Pending match reviews
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <input type="hidden" name="limit" value={String(qs.limit)} />
            <button
              type="submit"
              className="rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d]"
            >
              Apply
            </button>
            <Link href="/admin/products" className="text-xs text-neutral-500 hover:text-[#f06232]">
              Reset
            </Link>
            <span className="text-xs text-neutral-500">
              {result.configured ? (
                <>
                  <span className="font-mono text-neutral-300">{result.total}</span> matching
                </>
              ) : null}
            </span>
          </div>
        </form>

        <TableToolbar variant="dark" className="text-neutral-400">
          <span>
            Page <span className="font-mono text-neutral-200">{qs.page}</span> of{" "}
            <span className="font-mono text-neutral-200">{totalPages}</span>
          </span>
          <span className="ml-auto inline-flex gap-2">
            {qs.page > 1 ? (
              <Link
                className="rounded border border-white/12 bg-[#1a1a1a] px-2 py-1 text-neutral-200 hover:border-[#f06232]/40 hover:text-white"
                href={`/admin/products${buildQuery(baseQs, { page: String(qs.page - 1) })}`}
              >
                Previous
              </Link>
            ) : null}
            {qs.page < totalPages ? (
              <Link
                className="rounded border border-white/12 bg-[#1a1a1a] px-2 py-1 text-neutral-200 hover:border-[#f06232]/40 hover:text-white"
                href={`/admin/products${buildQuery(baseQs, { page: String(qs.page + 1) })}`}
              >
                Next
              </Link>
            ) : null}
          </span>
        </TableToolbar>

        {result.rows.length === 0 ? (
          <EmptyState
            variant="dark"
            title="No products in this view"
            description={
              tab === "products"
                ? "No published (active) products yet. Add a product as draft, then publish when category, image, and variant guards pass."
                : "Adjust filters or search to broaden the result."
            }
            action={
              tab === "products" ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Link
                    href="/admin/products/new"
                    className="inline-flex rounded-md bg-[#f06232] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e5582d]"
                  >
                    Add first product
                  </Link>
                  <Link
                    href="/admin/products/import/url"
                    className="inline-flex rounded-md border border-white/15 px-3 py-2 text-sm text-neutral-200 hover:border-[#f06232]/40 hover:text-white"
                  >
                    Import from URL
                  </Link>
                </div>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
              <thead className="border-b border-white/10 bg-[#181818] text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2.5">Image</th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5">Brand</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Visible</th>
                  <th className="px-3 py-2.5">Variants</th>
                  <th className="px-3 py-2.5">Images</th>
                  <th className="px-3 py-2.5">PDP</th>
                  <th className="px-3 py-2.5">Quote</th>
                  <th className="px-3 py-2.5">Updated</th>
                  <th className="px-3 py-2.5">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] bg-[#141414] text-neutral-200">
                {result.rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-white/[0.04]">
                    <td className="px-3 py-2 align-middle">
                      <Link href={`/admin/products/${row.id}`} className="block w-16 shrink-0">
                        <ProductImage
                          src={row.primaryImageUrl}
                          alt={row.name}
                          containerClassName="!rounded-md !border-white/15 !bg-black/50"
                          loading="lazy"
                        />
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Link href={`/admin/products/${row.id}`} className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
                        {row.name}
                      </Link>
                      <div className="mt-0.5 font-mono text-[10px] text-neutral-600">{row.id}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-neutral-300">{row.brandName ?? "—"}</td>
                    <td className="px-3 py-2 align-top text-neutral-300">{row.categoryName ?? "—"}</td>
                    <td className="px-3 py-2 align-top">
                      <StatusBadge status={row.status === "active" ? "enabled" : row.status === "archived" ? "disabled" : "pending"} />
                    </td>
                    <td className="px-3 py-2 align-top text-neutral-400">{row.storefrontVisible ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 align-top font-mono text-neutral-300">{row.activeVariantCount}</td>
                    <td className="px-3 py-2 align-top text-neutral-300">
                      {healthLabel(row)}
                      <span className="text-neutral-600"> ({row.imageCount})</span>
                    </td>
                    <td className="px-3 py-2 align-top text-neutral-300">{pdpLabel(row)}</td>
                    <td className="px-3 py-2 align-top text-neutral-400">{row.quoteEnabled ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 align-top font-mono text-[10px] text-neutral-500">
                      {row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="font-mono text-neutral-200">{row.warnings.length}</span>
                      {row.warnings.length > 0 ? (
                        <ul className="mt-1 max-w-[200px] list-inside list-disc text-[10px] text-amber-400/95">
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

        {result.total > 0 && withWarnings > 0 ? (
          <div className="border-t border-white/10 bg-[#181818] px-4 py-2 text-xs text-neutral-500">
            <span className="font-mono text-amber-400">{withWarnings}</span> of {result.rows.length} rows on this page have governance
            warnings.
          </div>
        ) : null}
      </TableCard>
        </>
      ) : null}
    </div>
  );
}

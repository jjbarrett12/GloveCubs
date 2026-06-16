import Link from "next/link";
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
} from "@/components/admin";
import { ProductsCommandActions } from "@/app/admin/products/_components/ProductsCommandActions";
import { ProductsWorkspaceTabs } from "@/app/admin/products/_components/ProductsWorkspaceTabs";
import { listClipboardStaging } from "@/lib/admin/clipboard-url-staging";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { ClipboardUrlStagingClient } from "@/app/admin/products/import/_components/ClipboardUrlStagingClient";
import { ProductListTable } from "@/app/admin/products/_components/ProductListTable";
import { fetchAdminCatalogOperationalCounts } from "@/lib/admin/admin-catalog-operational-counts";

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

function parseWorkspaceTab(sp: Record<string, string | string[] | undefined>): string | undefined {
  const raw = sp.tab;
  const v = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? (raw[0] ?? "").trim() : "";
  return ["products", "drafts", "url-imports", "needs-review", "archived"].includes(v) ? v : undefined;
}

function fmtCount(n: number | null | undefined) {
  if (n == null) return "n/a";
  return n.toLocaleString();
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

  const catalogOverview = !isUrlImports ? await fetchAdminCatalogOperationalCounts() : null;

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
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-8">
      <PageHeader
        title="Products"
        description="Manage parents, variants, and media. Clipboard staging never auto-publishes; use Import for deeper supplier URL runs."
        actions={
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <ProductsCommandActions />
            {catalogosBase ? (
              <a
                href={`${catalogosBase}/dashboard/url-import`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
              >
                Open catalog sync (URL import)
              </a>
            ) : null}
          </div>
        }
      />

      <ProductsWorkspaceTabs activeTab={tab} variant="default" />

      {!isUrlImports && catalogOverview?.configured ? (
        <StatGrid columns={5} className="mb-6 gap-4">
          <StatCard
            label="Active variants (all)"
            value={fmtCount(catalogOverview.activeVariantCount)}
            color="green"
            accentBorder
          />
          <StatCard
            label="Draft parents (catalog)"
            value={fmtCount(catalogOverview.catalog.buckets.find((b) => b.key === "drafts")?.count ?? null)}
            color="amber"
            accentBorder
          />
          <StatCard
            label="Missing imagery"
            value={fmtCount(catalogOverview.catalog.buckets.find((b) => b.key === "missing_images")?.count ?? null)}
            color="default"
            accentBorder
          />
          <StatCard
            label="Pending match reviews"
            value={fmtCount(catalogOverview.catalog.buckets.find((b) => b.key === "pending_match_reviews")?.count ?? null)}
            color="default"
            accentBorder
          />
          <StatCard
            label="Thin PDPs"
            value={fmtCount(catalogOverview.catalog.buckets.find((b) => b.key === "thin_pdps")?.count ?? null)}
            color="default"
            accentBorder
          />
        </StatGrid>
      ) : null}

      {!result.configured ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Supabase is not configured. Set credentials to load the product grid.
        </div>
      ) : null}

      {result.error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{result.error}</div>
      ) : null}

      {result.scanLimited ? (
        <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          Governance or search scan capped at 5,000 products by recency. Refine filters or search to narrow results.
        </div>
      ) : null}

      {isUrlImports ? (
        <div className="mb-6 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
            <strong className="text-slate-900">Clipboard URLs</strong> — stage distributor or manufacturer PDP links, review extracted evidence,
            then promote to a <em className="font-semibold text-[#c2410c]">draft</em> catalog product. For full-site crawls, use{" "}
            <Link href="/admin/products/import/url" className="font-semibold text-[#e5582d] underline decoration-[#f06232]/40 underline-offset-2 hover:text-[#c2410c]">
              Import from URL (tools)
            </Link>{" "}
            or Catalog sync tools.
          </div>
          {isUrlImports ? (
            <ClipboardUrlStagingClient categories={stagingCategories} initialRows={stagingRows} />
          ) : null}
        </div>
      ) : null}

      {!isUrlImports ? (
        <>
          <StatGrid columns={4} className="mb-6 gap-4">
            <StatCard label="Matching" value={result.total} color="blue" accentBorder />
            <StatCard label="Missing images" value={missingImages} color={missingImages > 0 ? "red" : "default"} accentBorder />
            <StatCard
              label="Placeholder only"
              value={placeholderImages}
              color={placeholderImages > 0 ? "amber" : "default"}
              accentBorder
            />
            <StatCard label="Thin PDP" value={thinPdp} color={thinPdp > 0 ? "amber" : "default"} accentBorder />
          </StatGrid>

          <TableCard className="mb-6">
        <form method="get" className="space-y-5 border-b border-slate-100 bg-slate-50/50 p-5">
          {tab ? <input type="hidden" name="tab" value={tab} /> : null}
          <div className="grid gap-4 md:grid-cols-12 md:items-end">
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-slate-600">Search</label>
              <input
                name="q"
                type="search"
                defaultValue={qs.q}
                placeholder="Name, slug, SKU, GTIN, brand, category…"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600">Status</label>
              <select
                name="status"
                defaultValue={listQs.status}
                disabled={Boolean(tab)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600">Sort</label>
              <select
                name="sort"
                defaultValue={qs.sort}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20"
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
              <label className="block text-xs font-semibold text-slate-600">Category ID</label>
              <input
                name="category"
                defaultValue={qs.categoryId ?? ""}
                placeholder="UUID"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600">Brand contains</label>
              <input
                name="brand"
                defaultValue={qs.brand}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600">Governance filters</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-slate-700">
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="missing_images"
                  value="1"
                  defaultChecked={listQs.filters.missing_images}
                  className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                />
                Missing images
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="placeholder_only_images"
                  value="1"
                  defaultChecked={listQs.filters.placeholder_only_images}
                  className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                />
                Placeholder-only
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="thin_pdp"
                  value="1"
                  defaultChecked={listQs.filters.thin_pdp}
                  className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                />
                Thin PDP
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="missing_glove_attributes"
                  value="1"
                  defaultChecked={listQs.filters.missing_glove_attributes}
                  className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                />
                Missing glove attrs
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="orphan_category"
                  value="1"
                  defaultChecked={listQs.filters.orphan_category}
                  className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                />
                Orphan category
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="variant_issues"
                  value="1"
                  defaultChecked={listQs.filters.variant_issues}
                  className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                />
                Variant issues
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="duplicate_warnings"
                  value="1"
                  defaultChecked={listQs.filters.duplicate_warnings}
                  className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                />
                Duplicate warnings
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="pending_match_reviews"
                  value="1"
                  defaultChecked={listQs.filters.pending_match_reviews}
                  className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                />
                Pending match reviews
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <input type="hidden" name="limit" value={String(qs.limit)} />
            <button
              type="submit"
              className="rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d]"
            >
              Apply filters
            </button>
            <Link href="/admin/products" className="text-sm font-medium text-slate-500 hover:text-[#e5582d]">
              Reset
            </Link>
            <span className="text-sm text-slate-500">
              {result.configured ? (
                <>
                  <span className="font-mono font-medium text-slate-800">{result.total}</span> matching
                </>
              ) : null}
            </span>
          </div>
        </form>

        <TableToolbar className="text-slate-600">
          <span>
            Page <span className="font-mono font-medium text-slate-800">{qs.page}</span> of{" "}
            <span className="font-mono font-medium text-slate-800">{totalPages}</span>
          </span>
          <span className="ml-auto inline-flex gap-2">
            {qs.page > 1 ? (
              <Link
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                href={`/admin/products${buildQuery(baseQs, { page: String(qs.page - 1) })}`}
              >
                Previous
              </Link>
            ) : null}
            {qs.page < totalPages ? (
              <Link
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
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
                    className="inline-flex rounded-lg bg-[#f06232] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#e5582d]"
                  >
                    Add first product
                  </Link>
                  <Link
                    href="/admin/products/import/url"
                    className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                  >
                    Import from URL
                  </Link>
                </div>
              ) : undefined
            }
          />
        ) : (
          <ProductListTable rows={result.rows} />
        )}

        {result.total > 0 && withWarnings > 0 ? (
          <div className="border-t border-slate-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
            <span className="font-semibold text-amber-900">{withWarnings}</span> of {result.rows.length} products on this page have
            governance warnings.
          </div>
        ) : null}
      </TableCard>
        </>
      ) : null}
    </div>
  );
}

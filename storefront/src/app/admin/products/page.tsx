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
  ErrorState,
} from "@/components/admin";
import {
  adminAlertSurface,
  adminFormInput,
  adminFormLabel,
  adminLink,
  adminMutedPanel,
  adminPrimaryButton,
  adminSecondaryButton,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
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
  const published = searchParams.published === "1" || searchParams.published === "true";
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
    <div>
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
                className={cn(adminSecondaryButton, "inline-flex w-full items-center justify-center text-xs sm:w-auto")}
              >
                Open catalog sync (URL import)
              </a>
            ) : null}
          </div>
        }
      />

      <ProductsWorkspaceTabs activeTab={tab} />

      {published ? (
        <div role="status" className={cn(adminAlertSurface("success", "mb-4"))}>
          Product published to the active catalog. Find it under the <strong>Products</strong> tab (published /
          active). Draft imports remain under <strong>Drafts</strong> until you publish them.
        </div>
      ) : null}

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
        <ErrorState
          className="mb-4"
          title="Database not configured"
          message="Product grid cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      ) : null}

      {result.error ? (
        <div className={cn(adminAlertSurface("critical", "mb-4"))}>{result.error}</div>
      ) : null}

      {result.scanLimited ? (
        <div className={cn(adminAlertSurface("warning", "mb-4"))}>
          Governance or search scan capped at 5,000 products by recency. Refine filters or search to narrow results.
        </div>
      ) : null}

      {isUrlImports ? (
        <div className="mb-6 space-y-4">
          <div className={cn(adminMutedPanel, "border-solid px-4 py-4 text-sm text-admin-secondary")}>
            <strong className="text-admin-primary">Clipboard URLs</strong> — stage distributor or manufacturer PDP links, review extracted evidence,
            then promote to a <em className="font-semibold text-admin-accent">draft</em> catalog product. For full-site crawls, use{" "}
            <Link href="/admin/products/import/url" className={adminLink}>
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
        <form method="get" className={cn(adminMutedPanel, "space-y-5 border-solid border-b border-admin-border p-5")}>
          {tab ? <input type="hidden" name="tab" value={tab} /> : null}
          <div className="grid gap-4 md:grid-cols-12 md:items-end">
            <div className="md:col-span-4">
              <label className={adminFormLabel}>Search</label>
              <input
                name="q"
                type="search"
                defaultValue={qs.q}
                placeholder="Name, slug, SKU, GTIN, brand, category…"
                className={cn(adminFormInput, "mt-1.5 w-full py-2.5")}
              />
            </div>
            <div className="md:col-span-2">
              <label className={adminFormLabel}>Status</label>
              <select
                name="status"
                defaultValue={listQs.status}
                disabled={Boolean(tab)}
                className={cn(adminFormInput, "mt-1.5 w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60")}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={adminFormLabel}>Sort</label>
              <select
                name="sort"
                defaultValue={qs.sort}
                className={cn(adminFormInput, "mt-1.5 w-full py-2.5")}
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
              <label className={adminFormLabel}>Category ID</label>
              <input
                name="category"
                defaultValue={qs.categoryId ?? ""}
                placeholder="UUID"
                className={cn(adminFormInput, "mt-1.5 w-full py-2.5 font-mono text-xs")}
              />
            </div>
            <div className="md:col-span-2">
              <label className={adminFormLabel}>Brand contains</label>
              <input
                name="brand"
                defaultValue={qs.brand}
                className={cn(adminFormInput, "mt-1.5 w-full py-2.5")}
              />
            </div>
          </div>

          <div>
            <p className={adminFormLabel}>Governance filters</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-admin-secondary">
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="missing_images"
                  value="1"
                  defaultChecked={listQs.filters.missing_images}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
                Missing images
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="placeholder_only_images"
                  value="1"
                  defaultChecked={listQs.filters.placeholder_only_images}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
                Placeholder-only
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="thin_pdp"
                  value="1"
                  defaultChecked={listQs.filters.thin_pdp}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
                Thin PDP
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="missing_glove_attributes"
                  value="1"
                  defaultChecked={listQs.filters.missing_glove_attributes}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
                Missing glove attrs
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="orphan_category"
                  value="1"
                  defaultChecked={listQs.filters.orphan_category}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
                Orphan category
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="variant_issues"
                  value="1"
                  defaultChecked={listQs.filters.variant_issues}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
                Variant issues
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="duplicate_warnings"
                  value="1"
                  defaultChecked={listQs.filters.duplicate_warnings}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
                Duplicate warnings
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="pending_match_reviews"
                  value="1"
                  defaultChecked={listQs.filters.pending_match_reviews}
                  className="rounded border-admin-border text-admin-accent focus:ring-admin-focus-ring"
                />
                Pending match reviews
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <input type="hidden" name="limit" value={String(qs.limit)} />
            <button type="submit" className={adminPrimaryButton}>
              Apply filters
            </button>
            <Link href="/admin/products" className={cn("text-sm font-medium", adminLink)}>
              Reset
            </Link>
            <span className="text-sm text-admin-muted">
              {result.configured ? (
                <>
                  <span className="font-mono font-medium text-admin-primary">{result.total}</span> matching
                </>
              ) : null}
            </span>
          </div>
        </form>

        <TableToolbar className="text-admin-secondary">
          <span>
            Page <span className="font-mono font-medium text-admin-primary">{qs.page}</span> of{" "}
            <span className="font-mono font-medium text-admin-primary">{totalPages}</span>
          </span>
          <span className="ml-auto inline-flex gap-2">
            {qs.page > 1 ? (
              <Link
                className={adminSecondaryButton}
                href={`/admin/products${buildQuery(baseQs, { page: String(qs.page - 1) })}`}
              >
                Previous
              </Link>
            ) : null}
            {qs.page < totalPages ? (
              <Link
                className={adminSecondaryButton}
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
                  <Link href="/admin/products/new" className={adminPrimaryButton}>
                    Add first product
                  </Link>
                  <Link href="/admin/products/import/url" className={adminSecondaryButton}>
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
          <div className={cn(adminAlertSurface("warning", "border-t border-admin-border"))}>
            <span className="font-semibold">{withWarnings}</span> of {result.rows.length} products on this page have
            governance warnings.
          </div>
        ) : null}
      </TableCard>
        </>
      ) : null}
    </div>
  );
}

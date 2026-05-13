import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { adaptUrlImportJobList, type UrlImportJobSummary } from "@/lib/admin/url-import-adapter";
import { PageHeader, StatusBadge } from "@/components/admin";
import { UrlImportPanel } from "../_components/UrlImportPanel";
import { ClipboardUrlStagingClient } from "../_components/ClipboardUrlStagingClient";
import { listClipboardStaging } from "@/lib/admin/clipboard-url-staging";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import from URL | GloveCubs admin",
  robots: { index: false, follow: false },
};

function connectionVariant(status: "online" | "offline" | "misconfigured"): "success" | "error" | "warning" {
  if (status === "online") return "success";
  if (status === "misconfigured") return "warning";
  return "error";
}

export default async function AdminProductsImportUrlPage() {
  const conn = computeProductsImportConnectionStatus();
  const offline = conn.status !== "online";
  const [stagingRows, categories] = await Promise.all([listClipboardStaging(50), fetchAdminCategoriesForProductForm()]);

  const jobs = offline
    ? { rows: [] as UrlImportJobSummary[], error: null as string | null }
    : await (async () => {
        const res = await catalogosInternalRequest({
          method: "GET",
          path: "/api/admin/url-import?limit=10",
          maxAttempts: 2,
        });
        if (!res.ok) return { rows: [], error: res.error.message };
        return { rows: adaptUrlImportJobList(res.data), error: null };
      })();

  return (
    <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-4 pb-8 shadow-md ring-1 ring-black/30 sm:p-5">
      <PageHeader
        variant="dark"
        title="Import from URL"
        description="Clipboard staging writes to Supabase for operator review. CatalogOS crawl (supplier mode) still proxies upstream when online."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "Import", href: "/admin/products/import" },
          { label: "URL" },
        ]}
        actions={<StatusBadge status={connectionVariant(conn.status)} size="md" dot />}
      />

      {offline ? (
        <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong className="font-semibold text-amber-50">CatalogOS offline.</strong> {conn.message} You can still use clipboard staging below.
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link href="/admin/products/import/jobs" className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
          View import jobs
        </Link>
        <span className="text-neutral-600">|</span>
        <Link href="/admin/products" className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
          Product command center
        </Link>
      </div>

      <div className="mb-8">
        <ClipboardUrlStagingClient categories={categories} initialRows={stagingRows} />
      </div>

      <div className="mb-6">
        <UrlImportPanel offline={offline} offlineMessage={conn.message} />
      </div>

      {!offline && jobs.rows.length > 0 ? (
        <div className="rounded-lg border border-white/10 bg-[#161616] px-4 py-3 text-xs text-neutral-400 ring-1 ring-white/[0.03]">
          <span className="font-semibold text-neutral-200">Recent CatalogOS jobs (sample):</span>{" "}
          {jobs.rows.map((j) => (
            <span key={j.id} className="ml-2 inline-block">
              <Link
                className="font-mono text-[#f06232] hover:text-[#ff8a5c] hover:underline"
                href={`/admin/products/import/jobs/${encodeURIComponent(j.id)}`}
              >
                {j.id.slice(0, 8)}…
              </Link>
              <span className="text-neutral-600"> ({j.status})</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

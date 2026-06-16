import { catalogosInternalRequest, probeCatalogosHealth } from "@/lib/admin/catalogos-internal-client";
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
  const catalogosProbe = !offline ? await probeCatalogosHealth() : null;
  const catalogosUnreachable = catalogosProbe != null && !catalogosProbe.ok;
  const [stagingRows, categories] = await Promise.all([listClipboardStaging(50), fetchAdminCategoriesForProductForm()]);

  const catalogosBaseUrl =
    process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/+$/, "") ||
    conn.catalogos_base_url?.replace(/\/+$/, "") ||
    "";

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
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title="Import from URL"
        description="Paste supplier links for staging and review. Remote crawls run when catalog sync is online; clipboard staging works either way."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "Import", href: "/admin/products/import" },
          { label: "URL" },
        ]}
        actions={<StatusBadge status={connectionVariant(conn.status)} size="md" dot />}
      />

      {offline ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="font-semibold">Catalog sync is offline.</strong> {conn.message} You can still use clipboard staging below.
        </div>
      ) : catalogosUnreachable && catalogosProbe ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong className="font-semibold">Catalog sync configured but not reachable.</strong> {catalogosProbe.message} Clipboard
          staging below still works against Supabase. Start CatalogOS at {conn.catalogos_base_url ?? "localhost:3010"} or fix{" "}
          <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">CATALOGOS_INTERNAL_URL</code>.
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link href="/admin/products/import/jobs" className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline">
          Import activity
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/products" className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline">
          Back to products
        </Link>
      </div>

      <div className="mb-8">
        <ClipboardUrlStagingClient
          categories={categories}
          initialRows={stagingRows}
          catalogosBaseUrl={catalogosBaseUrl}
        />
      </div>

      <div className="mb-6">
        <UrlImportPanel offline={offline} offlineMessage={conn.message} />
      </div>

      {!offline && jobs.rows.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">Recent import runs (sample):</span>{" "}
          {jobs.rows.map((j) => (
            <span key={j.id} className="ml-2 inline-block">
              <Link
                className="font-mono font-medium text-[#c2410c] hover:text-[#e5582d] hover:underline"
                href={`/admin/products/import/jobs/${encodeURIComponent(j.id)}`}
              >
                {j.id.slice(0, 8)}…
              </Link>
              <span className="text-slate-500"> ({j.status})</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

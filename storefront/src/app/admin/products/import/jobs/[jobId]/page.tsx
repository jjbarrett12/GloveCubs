import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { adaptUrlImportJobDetail } from "@/lib/admin/url-import-adapter";
import { UrlJobDetailClient } from "@/app/admin/products/import/_components/UrlJobDetailClient";
import { PageHeader } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Import job | GloveCubs admin",
  robots: { index: false, follow: false },
};

const JOB_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export default async function AdminProductsImportJobDetailPage({
  params,
}: {
  params: { jobId: string };
}) {
  const jobId = params.jobId?.trim();
  const idValid = !!jobId && JOB_ID_RE.test(jobId);
  const conn = computeProductsImportConnectionStatus();
  const offline = conn.status !== "online";
  const catalogosBaseUrl =
    process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/+$/, "") ||
    conn.catalogos_base_url?.replace(/\/+$/, "") ||
    "";

  let initial = null;
  let loadError: string | null = null;

  if (idValid && !offline) {
    const res = await catalogosInternalRequest({
      method: "GET",
      path: `/api/admin/url-import/${encodeURIComponent(jobId)}`,
      maxAttempts: 2,
    });
    if (res.ok) {
      initial = adaptUrlImportJobDetail(res.data);
      if (!initial) loadError = "Import service returned an unexpected job shape.";
    } else {
      loadError = res.error.message;
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title="Import run"
        description={idValid ? `Run ${jobId}` : "Invalid run id"}
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "Import", href: "/admin/products/import" },
          { label: "Activity", href: "/admin/products/import/jobs" },
          { label: "Detail" },
        ]}
      />

      {!idValid ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Invalid job id.
        </div>
      ) : offline ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong className="font-semibold">Catalog sync offline.</strong> <span>{conn.message}</span>
        </div>
      ) : loadError && !initial ? (
        <UrlJobDetailClient jobId={jobId} initial={null} catalogosBaseUrl={catalogosBaseUrl} />
      ) : (
        <UrlJobDetailClient jobId={jobId} initial={initial} catalogosBaseUrl={catalogosBaseUrl} />
      )}
    </div>
  );
}

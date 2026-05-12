import { catalogosInternalRequest } from "@/lib/admin/catalogos-internal-client";
import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { adaptUrlImportJobDetail } from "@/lib/admin/url-import-adapter";
import { UrlJobDetailClient } from "@/app/admin/products/import/_components/UrlJobDetailClient";
import { PageHeader } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "URL import job | GloveCubs admin",
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
      if (!initial) loadError = "CatalogOS returned an unexpected job detail shape.";
    } else {
      loadError = res.error.message;
    }
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-180px)] bg-gray-50 px-6 py-8 text-gray-900 md:-mx-8 md:px-10">
      <PageHeader
        title="URL import job"
        description={idValid ? `Job ${jobId}` : "Invalid job id"}
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "Import", href: "/admin/products/import" },
          { label: "Job detail" },
        ]}
      />

      {!idValid ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          Invalid job id.
        </div>
      ) : offline ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong className="font-semibold">Ingestion offline.</strong>{" "}
          <span className="text-red-800">{conn.message}</span>
        </div>
      ) : loadError && !initial ? (
        <UrlJobDetailClient jobId={jobId} initial={null} />
      ) : (
        <UrlJobDetailClient jobId={jobId} initial={initial} />
      )}
    </div>
  );
}

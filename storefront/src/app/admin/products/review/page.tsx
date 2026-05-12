import { computeProductsImportConnectionStatus } from "@/lib/admin/products-import-connection";
import { PageHeader, EmptyState, StatCard, StatGrid } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review queue | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default function AdminProductsReviewPage() {
  const conn = computeProductsImportConnectionStatus();
  const offline = conn.status !== "online";

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-180px)] bg-gray-50 px-6 py-8 text-gray-900 md:-mx-8 md:px-10">
      <PageHeader
        title="Review queue"
        description="Staged import rows, duplicate evidence, and publish decisions surface here once CatalogOS proxy routes are wired. Read-only until then."
      />

      <StatGrid columns={4} className="mb-6">
        <StatCard
          label="CatalogOS"
          value={conn.status === "online" ? "Online" : conn.status === "misconfigured" ? "Misconfigured" : "Offline"}
          color={conn.status === "online" ? "green" : conn.status === "misconfigured" ? "amber" : "red"}
          accentBorder
        />
        <StatCard label="Open reviews" value="—" color="default" accentBorder />
        <StatCard label="Approved (24h)" value="—" color="default" accentBorder />
        <StatCard label="Rejected (24h)" value="—" color="default" accentBorder />
      </StatGrid>

      {offline ? (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">Ingestion offline — configure CatalogOS connection.</strong>{" "}
          <span className="text-amber-800">{conn.message}</span>
        </div>
      ) : (
        <div className="mb-6 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          CatalogOS connection is configured. Review queue data will load from CatalogOS-backed APIs when those
          proxies ship — storefront will not fabricate staged rows.
        </div>
      )}

      <div className="rounded-lg border border-dashed border-gray-300 bg-white">
        <EmptyState
          icon={
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          }
          title="No staged rows in this view yet"
          description="Once CatalogOS proxy routes for the review queue are wired, staged extracted rows will appear here for operator review and publish."
        />
      </div>
    </div>
  );
}

import { fetchCatalogHealth } from "@/lib/admin/catalog-health";
import { PageHeader } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalog overview | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminCatalogHealthPage() {
  const { configured, buckets } = await fetchCatalogHealth();

  return (
    <div>
      <PageHeader
        title="Catalog overview"
        description="Quality signals for your published catalog—coverage, completeness, and readiness. Read-only counts; nothing on this page writes to the database."
      />

      {!configured ? (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Supabase is not configured for this environment. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
          to see live counts.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {buckets.map((b) => (
          <div
            key={b.key}
            data-bucket={b.key}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">{b.label}</div>
              <div className="font-mono text-2xl font-bold tabular-nums text-gray-900">
                {b.count == null ? "n/a" : b.count.toLocaleString()}
              </div>
            </div>
            <p className="mt-2 text-xs leading-snug text-gray-500">{b.description}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-gray-500">
        Counts are sampled for speed. For a full reconciliation export, use your reporting database or ask your data team—this screen is meant for day-to-day health checks.
      </p>
    </div>
  );
}

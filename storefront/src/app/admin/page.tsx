import Link from "next/link";
import { fetchAdminHomeSnapshot } from "@/lib/admin/admin-home-snapshot";
import { PageHeader, PageSection, StatCard, StatGrid } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin dashboard | GloveCubs",
  robots: { index: false, follow: false },
};

function fmt(n: number | null | undefined) {
  if (n == null) return "n/a";
  return n.toLocaleString();
}

export default async function AdminDashboardPage() {
  const snap = await fetchAdminHomeSnapshot();
  const drafts = snap.catalog.buckets.find((b) => b.key === "drafts")?.count ?? null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live counts from your connected data—quotes, pipeline, and catalog status. No estimates or sample data."
      />

      <PageSection title="At a glance">
        <StatGrid columns={4}>
          <StatCard
            label="Quote requests"
            value={fmt(snap.quoteRequestCount)}
            color="blue"
            accentBorder
            href="/admin/leads"
          />
          <StatCard
            label="Opportunities"
            value={fmt(snap.opportunityCount)}
            color="purple"
            accentBorder
            href="/admin/opportunities"
          />
          <StatCard
            label="Active products"
            value={fmt(snap.activeProductCount)}
            color="green"
            accentBorder
            href="/admin/products?status=active"
          />
          <StatCard
            label="Draft products"
            value={fmt(drafts)}
            color="amber"
            accentBorder
            href="/admin/products?status=draft"
          />
        </StatGrid>
      </PageSection>

      <PageSection
        title="Catalog quality"
        description="Snapshot of how complete and ready your published catalog is."
        actions={
          <Link
            href="/admin/catalog"
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            View all buckets →
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snap.catalog.buckets.slice(0, 6).map((b) => (
            <div
              key={b.key}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">{b.label}</span>
                <span className="font-mono text-xl font-semibold text-gray-900">{fmt(b.count)}</span>
              </div>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Shortcuts">
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            href="/admin/products/import"
          >
            Product import
          </Link>
          <Link
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            href="/admin/products/review"
          >
            Review & staging
          </Link>
          <Link
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            href="/admin/leads"
          >
            Quotes
          </Link>
          <Link
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            href="/admin/opportunities"
          >
            Pipeline
          </Link>
          <Link
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            href="/admin/procurement"
          >
            Sourcing
          </Link>
        </div>
      </PageSection>
    </div>
  );
}

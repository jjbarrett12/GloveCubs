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
  const missingImages = snap.catalog.buckets.find((b) => b.key === "missing_images")?.count ?? null;
  const pendingReviews = snap.catalog.buckets.find((b) => b.key === "pending_match_reviews")?.count ?? null;
  const { tierMix } = snap;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational counts from Supabase—quotes, catalog, companies, and pipeline. No revenue, margin, or payment KPIs until those lifecycles are wired with trusted sources."
      />

      <PageSection title="At a glance">
        <StatGrid columns={4}>
          <StatCard
            label="Companies"
            value={fmt(snap.companiesCount)}
            color="default"
            accentBorder
            href="/admin/companies"
          />
          <StatCard
            label="Buyer members"
            value={fmt(snap.companyMembersCount)}
            color="default"
            accentBorder
            href="/admin/companies"
          />
          <StatCard
            label="Quote requests"
            value={fmt(snap.quoteRequestCount)}
            color="blue"
            accentBorder
            href="/admin/leads"
          />
          <StatCard
            label="Linked quote requests"
            value={fmt(snap.quoteRequestsLinkedCount)}
            color="blue"
            accentBorder
            href="/admin/leads"
          />
        </StatGrid>
        <StatGrid columns={4} className="mt-3">
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
          <StatCard label="Draft products" value={fmt(drafts)} color="amber" accentBorder href="/admin/products?status=draft" />
          <StatCard
            label="Active variants"
            value={fmt(snap.totalVariantActiveCount)}
            color="green"
            accentBorder
            href="/admin/products"
          />
        </StatGrid>
        <StatGrid columns={3} className="mt-3">
          <StatCard
            label="Missing imagery (catalog)"
            value={fmt(missingImages)}
            color={missingImages != null && missingImages > 0 ? "red" : "default"}
            accentBorder
            href="/admin/catalog"
          />
          <StatCard
            label="Pending match reviews"
            value={fmt(pendingReviews)}
            color={pendingReviews != null && pendingReviews > 0 ? "amber" : "default"}
            accentBorder
            href="/admin/products?tab=needs-review"
          />
          <StatCard
            label="Canonical orders (records)"
            value={fmt(snap.canonicalOrdersCount)}
            color="default"
            accentBorder
          />
        </StatGrid>
        <p className="mt-2 text-xs text-gray-500">
          “Canonical orders” counts rows in <span className="font-mono">gc_commerce.orders</span> — not sales revenue.
        </p>
      </PageSection>

      <PageSection title="B2B tier mix (companies)">
        <div className="grid max-w-xl gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
          <div className="flex justify-between tabular-nums">
            <span className="text-gray-600">Cub</span>
            <span className="font-semibold text-gray-900">{tierMix.cub}</span>
          </div>
          <div className="flex justify-between tabular-nums">
            <span className="text-gray-600">Grizzly</span>
            <span className="font-semibold text-gray-900">{tierMix.grizzly}</span>
          </div>
          <div className="flex justify-between tabular-nums">
            <span className="text-gray-600">Kodiak</span>
            <span className="font-semibold text-gray-900">{tierMix.kodiak}</span>
          </div>
          {tierMix.other > 0 ? (
            <div className="flex justify-between tabular-nums">
              <span className="text-gray-600">Other / unknown code</span>
              <span className="font-semibold text-gray-900">{tierMix.other}</span>
            </div>
          ) : null}
        </div>
      </PageSection>

      <PageSection title="Recent quote requests" description="Latest rows from catalogos.quote_requests (operator view).">
        {snap.recentQuoteRequests.length === 0 ? (
          <p className="text-sm text-gray-500">No quote requests returned.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Linked co.</th>
                </tr>
              </thead>
              <tbody>
                {snap.recentQuoteRequests.map((q) => (
                  <tr key={q.id} className="border-b border-gray-50 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                      {q.created_at ? new Date(q.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-700">
                        {q.status}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-gray-800">{q.company_name || "—"}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-xs text-gray-600">{q.contact_name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{q.gc_company_id ? `${q.gc_company_id.slice(0, 8)}…` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      <PageSection
        title="Catalog quality"
        description="Snapshot of how complete and ready your published catalog is."
        actions={
          <Link href="/admin/catalog" className="text-sm font-medium text-blue-700 hover:text-blue-900">
            View all buckets →
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snap.catalog.buckets.slice(0, 6).map((b) => (
            <div key={b.key} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
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
            href="/admin/companies"
          >
            Companies
          </Link>
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
            href="/admin/analytics"
          >
            Activity
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

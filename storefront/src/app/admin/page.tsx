import Link from "next/link";
import { fetchAdminHomeSnapshot } from "@/lib/admin/admin-home-snapshot";
import { ContaminationExclusionNotice, PageHeader, PageSection, StatCard, StatGrid } from "@/components/admin";
import { describeQuoteStatusForOperator } from "@/lib/procurement/operator-lifecycle-copy";

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
  const drafts = snap.draftProductCount ?? snap.catalog.buckets.find((b) => b.key === "drafts")?.count ?? null;
  const missingImages = snap.catalog.buckets.find((b) => b.key === "missing_images")?.count ?? null;
  const pendingReviews = snap.catalog.buckets.find((b) => b.key === "pending_match_reviews")?.count ?? null;
  const { tierMix } = snap;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Procurement-first operator home — quote requests, sourcing threads, and fulfillment queues. Counts are operational, not revenue or checkout KPIs."
      />

      <PageSection title="Procurement queues" description="Actionable work — review quote requests and sourcing threads before catalog maintenance.">
        <StatGrid columns={4}>
          <StatCard
            label="Quote requests"
            value={fmt(snap.quoteRequestCount)}
            color="blue"
            accentBorder
            href="/admin/leads"
          />
          <StatCard
            label="Company-linked quotes"
            value={fmt(snap.quoteRequestsLinkedCount)}
            color="blue"
            accentBorder
            href="/admin/leads"
          />
          <StatCard
            label="Sourcing threads"
            value={fmt(snap.opportunityCount)}
            color="purple"
            accentBorder
            href="/admin/opportunities"
          />
          <StatCard
            label="Pending match reviews"
            value={fmt(pendingReviews)}
            color={pendingReviews != null && pendingReviews > 0 ? "amber" : "default"}
            accentBorder
            href="/admin/products?tab=needs-review"
          />
        </StatGrid>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100"
            href="/admin/leads"
          >
            Review quote requests
          </Link>
          <Link
            className="inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-900 hover:bg-purple-100"
            href="/admin/opportunities"
          >
            Open sourcing threads
          </Link>
          <Link
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            href="/admin/procurement"
          >
            Procurement review
          </Link>
        </div>
      </PageSection>

      <PageSection title="Recent quote requests" description="Latest catalogos.quote_requests — operator review label and buyer-visible status.">
        {snap.recentQuoteRequests.length === 0 ? (
          <p className="text-sm text-gray-500">No quote requests returned.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Operator review</th>
                  <th className="px-3 py-2">Buyer sees</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Linked co.</th>
                </tr>
              </thead>
              <tbody>
                {snap.recentQuoteRequests.map((q) => {
                  const statusCopy = describeQuoteStatusForOperator(q.status);
                  return (
                    <tr key={q.id} className="border-b border-gray-50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-600">
                        {q.created_at ? new Date(q.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-800">
                          {statusCopy.internalLabel}
                        </span>
                        <p className="mt-0.5 text-[10px] text-gray-500">{statusCopy.actionHint}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{statusCopy.buyerSees}</td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-gray-800">
                        {q.company_name || "—"}
                        {q.likelyTestDemo ? (
                          <span
                            className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900"
                            title={q.exclusionReason ?? "Likely test/demo data"}
                          >
                            Likely test/demo
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-xs text-gray-600">{q.contact_name || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">
                        {q.gc_company_id ? `${q.gc_company_id.slice(0, 8)}…` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm">
          <Link href="/admin/leads" className="font-medium text-blue-700 hover:underline">
            Full quote request queue →
          </Link>
        </p>
      </PageSection>

      <PageSection title="Fulfillment snapshot" description="Order records for validation — not finance-approved totals.">
        <StatGrid columns={3}>
          <StatCard
            label="Order records"
            value={fmt(snap.canonicalOrdersCount)}
            color="default"
            accentBorder
            href="/admin/orders"
          />
          <StatCard label="Active products" value={fmt(snap.activeProductCount)} color="green" accentBorder href="/admin/products?status=active" />
          <StatCard label="Draft products" value={fmt(drafts)} color="amber" accentBorder href="/admin/products?status=draft" />
        </StatGrid>
      </PageSection>

      <PageSection
        title="Catalog quality"
        description="Publishing readiness — secondary to procurement queues."
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
        {missingImages != null && missingImages > 0 ? (
          <p className="mt-3 text-xs text-amber-800">
            {missingImages.toLocaleString()} catalog items missing imagery —{" "}
            <Link href="/admin/catalog" className="font-medium underline">
              review catalog health
            </Link>
          </p>
        ) : null}
      </PageSection>

      <PageSection title="Customers & data quality">
        <StatGrid columns={3}>
          <StatCard label="Companies" value={fmt(snap.companiesCount)} color="default" accentBorder href="/admin/companies" />
          <StatCard label="Buyer members" value={fmt(snap.companyMembersCount)} color="default" accentBorder href="/admin/companies" />
          <StatCard label="Active variants" value={fmt(snap.totalVariantActiveCount)} color="green" accentBorder href="/admin/products" />
        </StatGrid>
        <div className="mt-4 grid max-w-xl gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">B2B tier mix (companies)</p>
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
        <div className="mt-4">
          <ContaminationExclusionNotice
            excludedTotal={snap.contamination.flaggedVisibleTotal}
            kpiExcludedTotal={snap.contamination.kpiExcludedTotal}
            partialScan={snap.contamination.partialScan}
          />
        </div>
      </PageSection>
    </div>
  );
}

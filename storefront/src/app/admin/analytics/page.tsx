import Link from "next/link";
import { fetchAdminHomeSnapshot } from "@/lib/admin/admin-home-snapshot";
import { ContaminationExclusionNotice, PageHeader, StatCard, StatGrid } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Activity | GloveCubs admin",
  robots: { index: false, follow: false },
};

function fmt(n: number | null | undefined) {
  if (n == null) return "n/a";
  return n.toLocaleString();
}

export default async function AdminAnalyticsPage() {
  const snap = await fetchAdminHomeSnapshot();
  const missingImages = snap.catalog.buckets.find((b) => b.key === "missing_images")?.count ?? null;
  const pendingReviews = snap.catalog.buckets.find((b) => b.key === "pending_match_reviews")?.count ?? null;

  return (
    <div>
      <PageHeader
        title="Activity"
        description="Operational volume across quotes, companies, catalog, and pipeline. Revenue, margin, payments, and checkout metrics are intentionally omitted until backed by trusted order and payment data."
      />

      <ContaminationExclusionNotice
        excludedTotal={snap.contamination.flaggedVisibleTotal}
        kpiExcludedTotal={snap.contamination.kpiExcludedTotal}
        partialScan={snap.contamination.partialScan}
      />

      <StatGrid columns={3} className="mb-4">
        <StatCard label="Companies" value={fmt(snap.companiesCount)} color="default" accentBorder href="/admin/companies" />
        <StatCard label="Buyer members" value={fmt(snap.companyMembersCount)} color="default" accentBorder href="/admin/companies" />
        <StatCard label="Quote requests" value={fmt(snap.quoteRequestCount)} color="blue" accentBorder href="/admin/leads" />
      </StatGrid>
      <StatGrid columns={3} className="mb-4">
        <StatCard label="Linked quote requests" value={fmt(snap.quoteRequestsLinkedCount)} color="blue" accentBorder href="/admin/leads" />
        <StatCard label="Opportunities" value={fmt(snap.opportunityCount)} color="purple" accentBorder href="/admin/opportunities" />
        <StatCard label="Active products" value={fmt(snap.activeProductCount)} color="green" accentBorder href="/admin/products?status=active" />
      </StatGrid>
      <StatGrid columns={3} className="mb-6">
        <StatCard label="Active variants" value={fmt(snap.totalVariantActiveCount)} color="green" accentBorder href="/admin/products" />
        <StatCard
          label="Missing imagery"
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
      </StatGrid>

      <p className="text-sm text-gray-500">
        Full catalog quality breakdown:{" "}
        <Link href="/admin/catalog" className="font-medium text-blue-700 hover:underline">
          Catalog overview
        </Link>{" "}
        ·{" "}
        <Link href="/admin" className="font-medium text-blue-700 hover:underline">
          Dashboard
        </Link>
        .
      </p>
    </div>
  );
}

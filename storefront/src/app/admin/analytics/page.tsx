import Link from "next/link";
import { fetchAdminHomeSnapshot } from "@/lib/admin/admin-home-snapshot";
import { PageHeader, StatCard, StatGrid } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics | GloveCubs admin",
  robots: { index: false, follow: false },
};

function fmt(n: number | null | undefined) {
  if (n == null) return "n/a";
  return n.toLocaleString();
}

export default async function AdminAnalyticsPage() {
  const snap = await fetchAdminHomeSnapshot();

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="No charts or inferred KPIs yet — only counts already queried elsewhere in admin."
      />

      <StatGrid columns={3} className="mb-6">
        <StatCard label="Quote requests" value={fmt(snap.quoteRequestCount)} color="blue" accentBorder />
        <StatCard label="Opportunities" value={fmt(snap.opportunityCount)} color="purple" accentBorder />
        <StatCard label="Active products" value={fmt(snap.activeProductCount)} color="green" accentBorder />
      </StatGrid>

      <p className="text-sm text-gray-500">
        Full catalog governance buckets:{" "}
        <Link href="/admin/catalog" className="font-medium text-blue-700 hover:underline">
          Catalog health
        </Link>
        . A future dashboard can join quote lines, opportunities, and coverage metrics — without synthetic traffic or revenue.
      </p>
    </div>
  );
}

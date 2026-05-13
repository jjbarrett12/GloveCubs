import Link from "next/link";
import { fetchAdminHomeSnapshot } from "@/lib/admin/admin-home-snapshot";
import { PageHeader, StatCard, StatGrid } from "@/components/admin";

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

  return (
    <div>
      <PageHeader
        title="Activity"
        description="High-level volume counts—the same figures you see on the dashboard. Deeper sales KPIs will layer in as reporting matures."
      />

      <StatGrid columns={3} className="mb-6">
        <StatCard label="Quote requests" value={fmt(snap.quoteRequestCount)} color="blue" accentBorder />
        <StatCard label="Opportunities" value={fmt(snap.opportunityCount)} color="purple" accentBorder />
        <StatCard label="Active products" value={fmt(snap.activeProductCount)} color="green" accentBorder />
      </StatGrid>

      <p className="text-sm text-gray-500">
        Full catalog quality breakdown:{" "}
        <Link href="/admin/catalog" className="font-medium text-blue-700 hover:underline">
          Catalog overview
        </Link>
        .
      </p>
    </div>
  );
}

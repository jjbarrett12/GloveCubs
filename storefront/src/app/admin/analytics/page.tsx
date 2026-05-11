import Link from "next/link";
import { fetchAdminHomeSnapshot } from "@/lib/admin/admin-home-snapshot";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage() {
  const snap = await fetchAdminHomeSnapshot();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="mt-2 text-sm text-white/60">
          No charts or inferred KPIs in this phase — only counts already queried elsewhere in admin.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/45">Real counts</h2>
        <ul className="mt-3 space-y-2 text-sm text-white/80">
          <li>
            Quote requests:{" "}
            <span className="font-mono text-[#f06232]">{snap.quoteRequestCount == null ? "n/a" : snap.quoteRequestCount}</span>
          </li>
          <li>
            Opportunities:{" "}
            <span className="font-mono text-[#f06232]">{snap.opportunityCount == null ? "n/a" : snap.opportunityCount}</span>
          </li>
          <li>
            Active products:{" "}
            <span className="font-mono text-[#f06232]">{snap.activeProductCount == null ? "n/a" : snap.activeProductCount}</span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-white/45">
          Full catalog governance buckets:{" "}
          <Link href="/admin/catalog" className="text-sky-300 hover:underline">
            Catalog health
          </Link>
          . A future dashboard can join quote lines, opportunities, and coverage metrics — without synthetic traffic or
          revenue.
        </p>
      </div>
    </div>
  );
}

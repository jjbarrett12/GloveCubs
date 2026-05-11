import Link from "next/link";
import { fetchAdminHomeSnapshot } from "@/lib/admin/admin-home-snapshot";

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
    <div className="mx-auto max-w-6xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Live operational counts from Supabase. Nothing here is estimated revenue, conversion, or traffic — only data
          the app already reads for catalog governance and intake.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-white/45">At a glance</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-[#141414] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Quote requests</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#f06232]">{fmt(snap.quoteRequestCount)}</p>
            <p className="mt-2 text-[11px] text-white/45">catalogos.quote_requests (head count)</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#141414] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Opportunities</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#f06232]">{fmt(snap.opportunityCount)}</p>
            <p className="mt-2 text-[11px] text-white/45">procurement_opportunities (head count)</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#141414] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Active products</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#f06232]">{fmt(snap.activeProductCount)}</p>
            <p className="mt-2 text-[11px] text-white/45">catalog_v2.catalog_products status=active</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#141414] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Draft products</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[#f06232]">{fmt(drafts)}</p>
            <p className="mt-2 text-[11px] text-white/45">Same source as Catalog health → drafts bucket</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-white/45">Catalog governance (subset)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snap.catalog.buckets.slice(0, 6).map((b) => (
            <div key={b.key} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-white/80">{b.label}</span>
                <span className="font-mono text-lg font-semibold text-[#f06232]">{fmt(b.count)}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/45">
          <Link href="/admin/catalog" className="text-sky-300 hover:underline">
            View all catalog health buckets
          </Link>
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-white/45">Shortcuts</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          <li>
            <Link className="rounded-md border border-white/15 px-3 py-1.5 text-sky-300 hover:bg-white/[0.05]" href="/admin/leads">
              Leads
            </Link>
          </li>
          <li>
            <Link
              className="rounded-md border border-white/15 px-3 py-1.5 text-sky-300 hover:bg-white/[0.05]"
              href="/admin/opportunities"
            >
              Opportunities
            </Link>
          </li>
          <li>
            <Link
              className="rounded-md border border-white/15 px-3 py-1.5 text-sky-300 hover:bg-white/[0.05]"
              href="/admin/procurement"
            >
              Procurement
            </Link>
          </li>
          <li>
            <Link className="rounded-md border border-white/15 px-3 py-1.5 text-sky-300 hover:bg-white/[0.05]" href="/admin/imports">
              Imports (CatalogOS)
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

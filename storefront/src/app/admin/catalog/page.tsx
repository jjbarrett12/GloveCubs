import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { fetchCatalogHealth } from "@/lib/admin/catalog-health";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalog health | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminCatalogHealthPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { configured, buckets } = await fetchCatalogHealth();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-white font-semibold">
          GloveCubs
        </Link>
        <span className="text-white/50 text-sm">Catalog health (read-only)</span>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-bold text-white">Catalog governance buckets</h1>
        <p className="mt-2 text-sm text-white/60">
          Operator observability for catalog quality. CatalogOS owns ingestion and resolution; this page does not write
          to the database. Each bucket is a count against the canonical <code className="text-white/80">catalog_v2</code>
          and <code className="text-white/80">catalogos</code> tables.
        </p>

        {!configured ? (
          <p className="mt-6 rounded border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-100">
            Supabase is not configured for this environment. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
            to see live counts.
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buckets.map((b) => (
            <div
              key={b.key}
              className="rounded-xl border border-white/10 bg-[#141414] p-4 shadow-sm"
              data-bucket={b.key}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold text-white">{b.label}</div>
                <div className="font-mono text-2xl font-bold tabular-nums text-[#f06232]">
                  {b.count == null ? "n/a" : b.count}
                </div>
              </div>
              <p className="mt-2 text-[12px] leading-snug text-white/55">{b.description}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-[11px] text-white/40">
          Counts are bounded reads (limit 5000–20000 rows). For exact production audits, run the audit SQL listed in
          the migration files (<code className="text-white/60">supabase/migrations/20261111120000_*</code>,{" "}
          <code className="text-white/60">_120100</code>, <code className="text-white/60">_120200</code>).
        </p>
      </main>
    </div>
  );
}

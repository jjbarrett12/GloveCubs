import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/get-admin-user";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin | GloveCubs",
  robots: { index: false, follow: false },
};

/**
 * Read-only admin index. Surfaces the existing admin sub-pages so operators
 * have a single entry point after sign-in. Mutations live behind the
 * sub-pages themselves (this page never writes).
 *
 * Auth: identical to `/admin/catalog` — requires a Supabase session whose
 * user id is present in `public.admin_users` with `is_active = true`.
 * The path-level middleware secret gate (`ADMIN_LEADS_SECRET` /
 * `ADMIN_MIDDLEWARE_RELAXED`) still applies in production.
 */
export default async function AdminIndexPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link href="/" className="font-semibold text-white">
          GloveCubs
        </Link>
        <span className="text-sm text-white/50">Admin (read-only index)</span>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="mt-2 text-sm text-white/60">
          Operator surfaces. Each sub-page enforces its own auth and (for moderation surfaces) the
          middleware secret gate. CatalogOS owns ingestion; this app does not write to the catalog
          from here.
        </p>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          <li>
            <Link
              href="/admin/catalog"
              className="block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#f06232]/40 hover:bg-white/[0.05]"
            >
              <p className="text-sm font-semibold text-white">Catalog health</p>
              <p className="mt-1 text-xs text-white/55">
                Governance buckets against catalog_v2 / catalogos. Read-only.
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/leads"
              className="block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#f06232]/40 hover:bg-white/[0.05]"
            >
              <p className="text-sm font-semibold text-white">Leads</p>
              <p className="mt-1 text-xs text-white/55">
                Quote requests captured from /request-pricing.
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/opportunities"
              className="block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#f06232]/40 hover:bg-white/[0.05]"
            >
              <p className="text-sm font-semibold text-white">Opportunities</p>
              <p className="mt-1 text-xs text-white/55">
                Customer lifecycle stages and source attribution.
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/procurement"
              className="block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#f06232]/40 hover:bg-white/[0.05]"
            >
              <p className="text-sm font-semibold text-white">Procurement queue</p>
              <p className="mt-1 text-xs text-white/55">
                Per-company review queue, blocked items, reorder, suppliers, spend.
              </p>
            </Link>
          </li>
          <li>
            <Link
              href="/admin/product-import"
              className="block rounded-lg border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#f06232]/40 hover:bg-white/[0.05]"
            >
              <p className="text-sm font-semibold text-white">Product import (deprecated)</p>
              <p className="mt-1 text-xs text-white/55">
                Redirects to the external CatalogOS importer. Storefront-side import is disabled.
              </p>
            </Link>
          </li>
        </ul>
      </main>
    </div>
  );
}

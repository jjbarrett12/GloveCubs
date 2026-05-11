import Link from "next/link";
import { getPendingCandidates } from "@/lib/admin/productImport";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Imports | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminImportsPage() {
  let pendingPreview: { total: number; sample: number } | null = null;
  if (isSupabaseConfigured()) {
    const { total, candidates } = await getPendingCandidates(5, 0);
    pendingPreview = { total, sample: candidates.length };
  }

  const catalogOsBase = process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/$/, "") ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Imports</h1>
        <p className="mt-2 text-sm text-white/60">
          Storefront-side product import <strong className="text-white/85">writes are disabled</strong> (POST returns
          410). Ingestion, crawl, review, and publish run in <strong className="text-white/85">CatalogOS</strong> →{" "}
          <code className="text-white/75">catalog_v2</code> → storefront projection sync.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm text-amber-50/95">
        This page is observational only. A future console can surface CatalogOS job status when that data is wired;
        until then, operators use CatalogOS directly.
      </div>

      {pendingPreview ? (
        <p className="text-sm text-white/70">
          Legacy <code className="text-white/80">product_import_candidates</code> — pending review (read-only):{" "}
          <span className="font-mono text-[#f06232]">{pendingPreview.total}</span> total (showing first{" "}
          {pendingPreview.sample} in API audits).
        </p>
      ) : (
        <p className="text-sm text-white/50">Configure Supabase to read import candidate totals.</p>
      )}

      <div className="flex flex-wrap gap-3">
        {catalogOsBase ? (
          <a
            href={`${catalogOsBase}/dashboard/url-import`}
            className="inline-flex rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open CatalogOS URL import
          </a>
        ) : null}
        <Link href="/admin/products" className="inline-flex items-center rounded-md border border-white/15 px-4 py-2 text-sm text-sky-300 hover:bg-white/[0.05]">
          Products module
        </Link>
      </div>
    </div>
  );
}

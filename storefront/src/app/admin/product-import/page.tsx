import Link from "next/link";

const CATALOGOS_URL_IMPORT = "/dashboard/url-import";

export default function ProductImportPage() {
  const base = (process.env.NEXT_PUBLIC_CATALOGOS_URL || "").replace(/\/$/, "");
  const catalogOsHref = base ? `${base}${CATALOGOS_URL_IMPORT}` : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/admin" className="hover:text-gray-700">
            Admin
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-gray-900">Product import</span>
        </nav>

        <h1 className="text-2xl font-bold text-gray-900">Product import moved to CatalogOS</h1>
        <p className="mt-4 text-gray-600">
          Product import is now handled in CatalogOS. Use the URL import dashboard to crawl, review, and publish
          into the canonical catalog (<code className="rounded bg-gray-100 px-1 text-sm">catalog_v2</code>); the
          storefront search projection updates via sync.
        </p>

        {catalogOsHref ? (
          <p className="mt-6">
            <a
              href={catalogOsHref}
              className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Open CatalogOS URL import
            </a>
          </p>
        ) : (
          <p className="mt-6 text-sm text-amber-800">
            Set <code className="rounded bg-amber-50 px-1">NEXT_PUBLIC_CATALOGOS_URL</code> to your CatalogOS base URL
            (no trailing slash) to show a direct link. Path: <code className="rounded bg-gray-100 px-1">{CATALOGOS_URL_IMPORT}</code>
          </p>
        )}

        <p className="mt-8 text-sm text-gray-500">
          <Link href="/admin" className="text-blue-600 hover:underline">
            Back to admin
          </Link>
        </p>
      </div>
    </div>
  );
}

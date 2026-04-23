import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * Storefront URL product import was unified into CatalogOS.
 * When NEXT_PUBLIC_CATALOGOS_URL is set, redirect to CatalogOS URL import.
 */

export default function AdminProductImportRedirectPage() {
  const base = process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/$/, "");
  if (base) {
    redirect(`${base}/dashboard/url-import`);
  }

  return (
    <div className="p-6 max-w-lg space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">URL product import</h1>
      <p className="text-sm text-muted-foreground">
        URL-based product import runs in CatalogOS: crawl supplier URLs, review extracted rows, import
        selected products into batches, then normalize, review, and publish in the same pipeline as CSV
        uploads.
      </p>
      <p className="text-sm text-amber-700">
        Set <code className="rounded bg-muted px-1">NEXT_PUBLIC_CATALOGOS_URL</code> in this app&apos;s
        environment to redirect here automatically (e.g. your CatalogOS origin).
      </p>
      <Link href="/admin/ingestion" className="text-primary text-sm hover:underline">
        ← Back to Ingestion
      </Link>
    </div>
  );
}

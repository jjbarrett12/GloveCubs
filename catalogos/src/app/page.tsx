import Link from "next/link";

export default function CatalogOSHome() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-2">CatalogOS</h1>
      <p className="text-muted-foreground mb-6">
        Internal catalog ingestion and publishing for GloveCubs.
      </p>
      <nav className="flex flex-wrap gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Dashboard
        </Link>
        <Link
          href="/dashboard/suppliers"
          className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Suppliers
        </Link>
        <Link
          href="/dashboard/batches"
          className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Batches
        </Link>
        <Link
          href="/dashboard/staging"
          className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Staging
        </Link>
        <Link
          href="/dashboard/review"
          className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Review queue
        </Link>
        <Link
          href="/dashboard/master-products"
          className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Master products
        </Link>
      </nav>
    </div>
  );
}

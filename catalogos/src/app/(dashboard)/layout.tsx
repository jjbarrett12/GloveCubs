import Link from "next/link";

export default function DashboardLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-border bg-muted/30 p-4 flex flex-col gap-2">
        <Link href="/" className="font-semibold text-sm text-muted-foreground hover:text-foreground">
          ← CatalogOS
        </Link>
        <nav className="flex flex-col gap-1 mt-4">
          <Link href="/dashboard" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Dashboard</Link>
          <Link href="/dashboard/suppliers" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Suppliers</Link>
          <Link href="/dashboard/feeds" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Feeds</Link>
          <Link href="/dashboard/ingestion" className="rounded-md px-3 py-2 text-sm hover:bg-muted font-medium">Ingestion</Link>
          <Link href="/dashboard/csv-import" className="rounded-md px-3 py-2 text-sm hover:bg-muted">AI CSV import</Link>
          <Link href="/dashboard/batches" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Batches</Link>
          <Link href="/dashboard/imports" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Import monitoring</Link>
          <Link href="/dashboard/staging" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Staging</Link>
          <Link href="/dashboard/review" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Review queue</Link>
          <Link href="/dashboard/products/quick-add" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Quick add product</Link>
          <Link href="/dashboard/products/bulk-add" className="rounded-md px-3 py-2 text-sm hover:bg-muted">CSV bulk add</Link>
          <Link href="/dashboard/publish" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Publish-ready</Link>
          <Link href="/dashboard/master-products" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Master products</Link>
          <Link href="/dashboard/discovery/runs" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Discovery</Link>
          <Link href="/dashboard/quotes" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Quotes / RFQ</Link>
          <Link href="/dashboard/rfq" className="rounded-md px-3 py-2 text-sm hover:bg-muted font-medium">RFQ queue</Link>
          <Link href="/dashboard/onboarding" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Onboarding</Link>
          <Link href="/dashboard/catalog-expansion" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Catalog expansion</Link>
          <Link href="/dashboard/product-matching" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Product matching</Link>
          <Link href="/dashboard/operations" className="rounded-md px-3 py-2 text-sm hover:bg-muted font-medium">Operations</Link>
          <Link href="/admin/distributors" className="rounded-md px-3 py-2 text-sm hover:bg-muted">Distributors</Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

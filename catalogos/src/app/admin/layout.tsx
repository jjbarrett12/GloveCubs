import Link from "next/link";

export default function AdminLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 border-r border-border bg-muted/30 p-4 flex flex-col gap-2">
        <Link href="/" className="font-semibold text-sm text-muted-foreground hover:text-foreground">
          ← CatalogOS
        </Link>
        <nav className="flex flex-col gap-1 mt-4">
          <Link href="/admin/distributors" className="rounded-md px-3 py-2 text-sm hover:bg-muted font-medium">
            Distributors
          </Link>
          <Link href="/dashboard" className="rounded-md px-3 py-2 text-sm hover:bg-muted text-muted-foreground">
            Dashboard
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

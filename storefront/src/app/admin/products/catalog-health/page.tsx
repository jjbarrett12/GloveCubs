import Link from "next/link";
import { fetchCatalogHealth } from "@/lib/admin/catalog-health";
import { EmptyState, ErrorState, PageHeader } from "@/components/admin";
import { adminCardSurface, adminLink } from "@/components/admin/admin-theme-utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalog quality | Products | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminProductsCatalogHealthPage() {
  const { configured, buckets } = await fetchCatalogHealth();

  return (
    <div>
      <PageHeader
        title="Catalog quality"
        description="Same overview as the standalone catalog page—quick read on how complete and customer-ready your assortment is."
      />

      {!configured ? (
        <ErrorState
          title="Database not configured"
          message="Catalog health counts cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      ) : buckets.length === 0 ? (
        <EmptyState title="No catalog buckets returned" description="Catalog health data is unavailable right now." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buckets.map((b) => (
            <div
              key={b.key}
              data-bucket={b.key}
              className={`${adminCardSurface} p-4 transition-colors hover:bg-admin-surface-muted`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold text-admin-primary">{b.label}</div>
                <div className="font-mono text-2xl font-bold tabular-nums text-admin-primary">
                  {b.count == null ? "—" : b.count.toLocaleString()}
                </div>
              </div>
              <p className="mt-2 text-xs leading-snug text-admin-muted">{b.description}</p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-admin-muted">
        Counts are sampled for speed. For a full reconciliation export, use your reporting tools or data team.{" "}
        <Link href="/admin/products" className={adminLink}>
          Products →
        </Link>
      </p>
    </div>
  );
}

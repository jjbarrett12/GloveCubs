import { getSupabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = getSupabase(false);
  const [batchesRes, stagingRes, suppliersRes] = await Promise.all([
    supabase.from("catalogos_import_batches").select("id, status, started_at, stats").order("started_at", { ascending: false }).limit(5),
    supabase.from("catalogos_staging_products").select("id, status", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("catalogos_suppliers").select("id", { count: "exact", head: true }),
  ]);

  const batches = batchesRes.data ?? [];
  const pendingCount = stagingRes.count ?? 0;
  const supplierCount = suppliersRes.count ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">CatalogOS Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border border-border p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground">Suppliers</p>
          <p className="text-2xl font-semibold">{supplierCount}</p>
        </div>
        <div className="rounded-lg border border-border p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground">Pending review</p>
          <p className="text-2xl font-semibold">{pendingCount}</p>
        </div>
        <div className="rounded-lg border border-border p-4 bg-muted/30">
          <p className="text-sm text-muted-foreground">Recent batches</p>
          <p className="text-2xl font-semibold">{batches.length}</p>
        </div>
      </div>
      <section>
        <h2 className="text-lg font-semibold mb-3">Recent import batches</h2>
        <ul className="space-y-2">
          {batches.length === 0 && <li className="text-muted-foreground text-sm">No batches yet. Run an ingestion from Feeds or API.</li>}
          {(batches as { id: number; status: string; started_at: string; stats: Record<string, number> }[]).map((b) => (
            <li key={b.id} className="flex items-center gap-4 rounded border border-border px-3 py-2 text-sm">
              <span className="font-mono">#{b.id}</span>
              <span className={b.status === "completed" ? "text-green-600" : b.status === "failed" ? "text-red-600" : "text-amber-600"}>{b.status}</span>
              <span className="text-muted-foreground">{new Date(b.started_at).toLocaleString()}</span>
              {b.stats && typeof b.stats === "object" && (
                <span className="text-muted-foreground">
                  raw: {(b.stats as { raw_count?: number }).raw_count ?? 0} → staged: {(b.stats as { staged_count?: number }).staged_count ?? 0}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

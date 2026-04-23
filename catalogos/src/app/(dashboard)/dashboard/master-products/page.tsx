import { getSupabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function MasterProductsPage() {
  const supabase = getSupabase(false);
  const { data: masters } = await supabase
    .from("catalogos_master_products")
    .select("id, sku, name, category")
    .order("sku")
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Master products</h1>
      <p className="text-muted-foreground text-sm mb-4">Canonical catalog. Published products are synced from here to the live storefront.</p>
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">SKU</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Category</th>
            </tr>
          </thead>
          <tbody>
            {(!masters || masters.length === 0) && (
              <tr><td colSpan={4} className="p-4 text-muted-foreground">No master products. Publish from staging to create.</td></tr>
            )}
            {(masters ?? []).map((m: { id: number; sku: string; name: string; category: string }) => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-2 font-mono">{m.id}</td>
                <td className="p-2">{m.sku}</td>
                <td className="p-2">{m.name}</td>
                <td className="p-2">{m.category}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { listSuppliers } from "@/lib/catalogos/suppliers";
import { SupplierCreateForm } from "./SupplierCreateForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SuppliersPage() {
  let suppliers: Awaited<ReturnType<typeof listSuppliers>>;
  try {
    suppliers = await listSuppliers(false);
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Suppliers</h1>
        <p className="text-destructive">Failed to load suppliers. Ensure catalogos schema and Supabase are configured.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>

      <Card className="max-w-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add supplier</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierCreateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All suppliers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {suppliers.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">No suppliers yet. Create one above.</div>
          ) : (
            <ul className="divide-y divide-border">
              {suppliers.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground text-sm font-mono">{s.slug}</span>
                    {!s.is_active && <Badge variant="secondary">inactive</Badge>}
                  </div>
                  <Link href={`/dashboard/feeds?supplier_id=${s.id}`} className="text-sm text-primary hover:underline">
                    Feeds →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

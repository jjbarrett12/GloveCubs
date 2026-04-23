"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { CsvMapAndImport } from "./CsvMapAndImport";

export function BulkAddPageClient({
  suppliers,
}: {
  suppliers: { id: string; name: string }[];
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");

  if (suppliers.length === 0) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight">CSV bulk add</h1>
        <p className="text-sm text-muted-foreground mt-4">No suppliers available. Add a supplier first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CSV bulk add</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV, map columns, then open each row in Quick Add to finish attributes and publish.
        </p>
      </div>

      <div className="space-y-2 max-w-md">
        <Label htmlFor="bulk-supplier">Supplier</Label>
        <select
          id="bulk-supplier"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {supplierId ? <CsvMapAndImport supplierId={supplierId} /> : null}
    </div>
  );
}

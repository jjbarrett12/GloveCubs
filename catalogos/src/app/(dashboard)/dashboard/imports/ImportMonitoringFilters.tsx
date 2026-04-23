"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { ImportMonitoringFilters as FilterShape } from "@/lib/ingestion/import-monitoring-data";

export function ImportMonitoringFilters({
  suppliers,
  current,
}: {
  suppliers: { id: string; name: string }[];
  current: Partial<FilterShape>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const apply = useCallback(
    (updates: Partial<FilterShape>) => {
      const next = new URLSearchParams(searchParams.toString());
      if (updates.supplier_id !== undefined) {
        if (updates.supplier_id) next.set("supplier_id", updates.supplier_id);
        else next.delete("supplier_id");
      }
      if (updates.status !== undefined) {
        if (updates.status) next.set("status", updates.status);
        else next.delete("status");
      }
      if (updates.date_from !== undefined) {
        if (updates.date_from) next.set("date_from", updates.date_from);
        else next.delete("date_from");
      }
      if (updates.date_to !== undefined) {
        if (updates.date_to) next.set("date_to", updates.date_to);
        else next.delete("date_to");
      }
      router.push(`/dashboard/imports?${next.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <Label htmlFor="filter-supplier" className="text-xs">Supplier</Label>
        <select
          id="filter-supplier"
          className="mt-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={current.supplier_id ?? ""}
          onChange={(e) => apply({ supplier_id: e.target.value || undefined })}
        >
          <option value="">All</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="filter-status" className="text-xs">Status</Label>
        <select
          id="filter-status"
          className="mt-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={current.status ?? ""}
          onChange={(e) => apply({ status: e.target.value || undefined })}
        >
          <option value="">All</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div>
        <Label htmlFor="filter-date-from" className="text-xs">Date from</Label>
        <Input
          id="filter-date-from"
          type="date"
          className="mt-1 h-9 w-[140px]"
          value={current.date_from ?? ""}
          onChange={(e) => apply({ date_from: e.target.value || undefined })}
        />
      </div>
      <div>
        <Label htmlFor="filter-date-to" className="text-xs">Date to</Label>
        <Input
          id="filter-date-to"
          type="date"
          className="mt-1 h-9 w-[140px]"
          value={current.date_to ?? ""}
          onChange={(e) => apply({ date_to: e.target.value || undefined })}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => apply({ supplier_id: undefined, status: undefined, date_from: undefined, date_to: undefined })}
      >
        Clear
      </Button>
    </div>
  );
}

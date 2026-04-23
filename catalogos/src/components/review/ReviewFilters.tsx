"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ReviewFiltersProps {
  suppliers: { id: string; name: string }[];
  categories?: { id: string; slug: string; name: string }[];
  className?: string;
}

export function ReviewFilters({ suppliers, categories = [], className }: ReviewFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const batchId = searchParams.get("batch_id") ?? "";
  const supplierId = searchParams.get("supplier_id") ?? "";
  const categoryId = searchParams.get("category_id") ?? "";
  const status = searchParams.get("status") ?? "";
  const unmatched = searchParams.get("unmatched") === "1";
  const hasAnomalies = searchParams.get("anomalies") === "1";
  const missingAttributes = searchParams.get("missing_attributes") === "1";
  const confMin = searchParams.get("conf_min") ?? "";
  const confMax = searchParams.get("conf_max") ?? "";
  const qParam = searchParams.get("q") ?? "";
  const [qDraft, setQDraft] = useState(qParam);

  useEffect(() => {
    setQDraft(qParam);
  }, [qParam]);

  function setParams(updates: Record<string, string | number | undefined>) {
    const p = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    });
    router.push(`/dashboard/review?${p.toString()}`);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="flex items-center gap-1.5">
        <Input
          placeholder="Search name, SKU, master, supplier…"
          className="w-52 h-9 text-sm"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParams({ q: qDraft.trim() || undefined });
          }}
        />
        <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => setParams({ q: qDraft.trim() || undefined })}>
          Search
        </Button>
      </div>
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        value={supplierId}
        onChange={(e) => setParams({ supplier_id: e.target.value || undefined })}
      >
        <option value="">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <Input
        placeholder="Batch ID"
        className="w-32 font-mono text-xs"
        value={batchId}
        onChange={(e) => setParams({ batch_id: e.target.value || undefined })}
      />
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        value={categoryId}
        onChange={(e) => setParams({ category_id: e.target.value || undefined })}
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        value={status}
        onChange={(e) => setParams({ status: e.target.value || undefined })}
      >
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="merged">Merged</option>
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={unmatched} onChange={(e) => setParams({ unmatched: e.target.checked ? 1 : undefined })} className="rounded border-border" />
        Unmatched only
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hasAnomalies} onChange={(e) => setParams({ anomalies: e.target.checked ? 1 : undefined })} className="rounded border-border" />
        Has anomalies
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={missingAttributes} onChange={(e) => setParams({ missing_attributes: e.target.checked ? 1 : undefined })} className="rounded border-border" />
        Missing attributes
      </label>
      <span className="text-muted-foreground text-sm">Confidence</span>
      <Input type="number" step="0.1" min="0" max="1" placeholder="Min" className="w-16 text-xs" value={confMin} onChange={(e) => setParams({ conf_min: e.target.value || undefined })} />
      <Input type="number" step="0.1" min="0" max="1" placeholder="Max" className="w-16 text-xs" value={confMax} onChange={(e) => setParams({ conf_max: e.target.value || undefined })} />
      <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/review")}>Clear</Button>
    </div>
  );
}

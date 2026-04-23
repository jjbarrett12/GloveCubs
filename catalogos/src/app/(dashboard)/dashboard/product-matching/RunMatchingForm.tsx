"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runMatchingAction } from "@/app/actions/product-matching";

interface BatchOption {
  id: string;
  supplier_name?: string;
  started_at: string;
}

interface RunMatchingFormProps {
  batches: BatchOption[];
}

export function RunMatchingForm({ batches }: RunMatchingFormProps) {
  const router = useRouter();
  const [scope, setScope] = useState<"batch" | "all_pending">("all_pending");
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [autoApply, setAutoApply] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await runMatchingAction({
        scope,
        batchId: scope === "batch" ? batchId : null,
        autoApplyHighConfidence: autoApply,
      });
      if (result.success && result.runId) {
        router.refresh();
        router.push(`/dashboard/product-matching/runs/${result.runId}`);
      } else {
        setError(result.error ?? "Run failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Scope</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "batch" | "all_pending")}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all_pending">All pending staged</option>
          <option value="batch">Single batch</option>
        </select>
      </div>
      {scope === "batch" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Batch</label>
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.supplier_name ?? b.id.slice(0, 8)} · {new Date(b.started_at).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
        Auto-apply high-confidence matches (≥0.9, no duplicate warning)
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || (scope === "batch" && !batchId)}>
        {pending ? "Running…" : "Run matching"}
      </Button>
    </form>
  );
}

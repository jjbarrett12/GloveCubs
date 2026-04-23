"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runSyncAction } from "@/app/actions/catalog-expansion";

export function ReRunSyncButton({ feedId }: { feedId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const result = await runSyncAction(feedId);
      if (result.success && result.runId) {
        router.refresh();
        router.push(`/dashboard/catalog-expansion/runs/${result.runId}`);
      } else {
        setError(result.error ?? "Sync failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={handleClick}>
        {pending ? "Running…" : "Re-run sync"}
      </Button>
    </div>
  );
}

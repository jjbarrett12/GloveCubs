"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function FeedRunImportButton({ feedId, disabled }: { feedId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feed_id: feedId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
      router.push(`/dashboard/batches/${data.batchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button type="button" size="sm" variant="outline" disabled={disabled || pending} onClick={handleRun}>
        {pending ? "Running…" : "Run import"}
      </Button>
    </div>
  );
}

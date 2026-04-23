"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runSyncAction } from "@/app/actions/catalog-expansion";

interface RunSyncFormProps {
  feeds: { id: string; supplier_id: string; label: string }[];
}

export function RunSyncForm({ feeds }: RunSyncFormProps) {
  const router = useRouter();
  const [feedId, setFeedId] = useState(feeds[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

  if (feeds.length === 0) {
    return <p className="text-sm text-muted-foreground">No feeds with URL. Add a feed in Feeds first.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <select
        value={feedId}
        onChange={(e) => setFeedId(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {feeds.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Running…" : "Run sync"}
      </Button>
    </form>
  );
}

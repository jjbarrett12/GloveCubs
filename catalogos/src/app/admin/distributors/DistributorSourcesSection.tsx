"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DistributorSourceForAdmin } from "@/lib/distributor-sync/admin-data";

export function DistributorSourcesSection({
  sources,
  onRunCrawl,
  onRefresh,
}: {
  sources: DistributorSourceForAdmin[];
  onRunCrawl?: (source: DistributorSourceForAdmin) => void;
  /** Optional extra callback after mutate (e.g. parent cache). Router refresh always runs. */
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [disabling, setDisabling] = useState<string | null>(null);
  const [crawlLoading, setCrawlLoading] = useState<string | null>(null);

  const refresh = () => router.refresh();

  async function handleRunCrawl(source: DistributorSourceForAdmin) {
    if (crawlLoading) return;
    setCrawlLoading(source.id);
    try {
      let domain = "";
      try {
        domain = new URL(source.root_url).hostname.replace(/^www\./, "");
      } catch {
        domain = "";
      }
      const res = await fetch("/api/admin/crawl-distributor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distributor_name: source.name,
          start_url: source.root_url,
          allowed_domain: domain || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        refresh();
        onRefresh?.();
        onRunCrawl?.(source);
      } else {
        alert(data.error || "Crawl failed");
      }
    } finally {
      setCrawlLoading(null);
    }
  }

  async function handleDisable(source: DistributorSourceForAdmin) {
    if (disabling) return;
    setDisabling(source.id);
    try {
      const res = await fetch(`/api/admin/distributor-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: source.status === "active" ? "paused" : "active",
        }),
      });
      if (res.ok) {
        refresh();
        onRefresh?.();
      }
    } finally {
      setDisabling(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Distributor Sources</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {sources.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No distributor sources yet. Add one via Start Crawl below.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Root URL</th>
                  <th className="text-left p-3 font-medium">Last crawled</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3 max-w-[200px] truncate text-muted-foreground">{s.root_url}</td>
                    <td className="p-3 text-muted-foreground">
                      {s.last_crawled_at
                        ? new Date(s.last_crawled_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant={s.status === "active" ? "default" : "secondary"}>
                        {s.status}
                      </Badge>
                    </td>
                    <td className="p-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRunCrawl(s)}
                        disabled={s.status !== "active" || crawlLoading === s.id}
                      >
                        {crawlLoading === s.id ? "Starting…" : "Run Crawl"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled title="Edit (coming soon)">
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDisable(s)}
                        disabled={disabling === s.id}
                      >
                        {s.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StartCrawlForm({
  onSuccess,
}: {
  onSuccess?: (result: { jobId: string; productsExtracted: number }) => void;
}) {
  const [distributorName, setDistributorName] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [allowedDomain, setAllowedDomain] = useState("");
  const [crawlScope, setCrawlScope] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/crawl-distributor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distributor_name: distributorName.trim(),
          start_url: startUrl.trim(),
          allowed_domain: allowedDomain.trim() || undefined,
          crawl_scope: crawlScope.trim()
            ? crawlScope.split(/[\s,]+/).filter(Boolean)
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Crawl failed");
        return;
      }
      setMessage(
        `Crawl started. Job ${data.jobId?.slice(0, 8)}… — ${data.productsExtracted ?? 0} products extracted.`
      );
      router.refresh();
      onSuccess?.({
        jobId: data.jobId,
        productsExtracted: data.productsExtracted ?? 0,
      });
      setDistributorName("");
      setStartUrl("");
      setAllowedDomain("");
      setCrawlScope("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Start Crawl</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="distributor_name">Distributor name</Label>
            <Input
              id="distributor_name"
              value={distributorName}
              onChange={(e) => setDistributorName(e.target.value)}
              placeholder="e.g. Safety Zone"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="start_url">Start URL</Label>
            <Input
              id="start_url"
              type="url"
              value={startUrl}
              onChange={(e) => setStartUrl(e.target.value)}
              placeholder="https://www.safety-zone.com/disposable-gloves"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="allowed_domain">Allowed domain</Label>
            <Input
              id="allowed_domain"
              value={allowedDomain}
              onChange={(e) => setAllowedDomain(e.target.value)}
              placeholder="e.g. safety-zone.com"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional. Crawl is restricted to this domain.
            </p>
          </div>
          <div>
            <Label htmlFor="crawl_scope">Optional crawl scope (path prefixes, comma-separated)</Label>
            <Input
              id="crawl_scope"
              value={crawlScope}
              onChange={(e) => setCrawlScope(e.target.value)}
              placeholder="/gloves, /category/disposable"
              className="mt-1"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Starting…" : "Start Crawl"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

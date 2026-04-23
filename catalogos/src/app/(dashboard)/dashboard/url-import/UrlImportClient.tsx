"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface JobItem {
  id: string;
  supplier_name: string;
  start_url: string;
  allowed_domain: string;
  crawl_mode: string;
  status: string;
  pages_discovered: number;
  pages_crawled: number;
  pages_skipped_unchanged: number;
  products_extracted: number;
  family_groups_inferred: number;
  variants_inferred: number;
  failed_pages_count: number;
  warnings: string[] | null;
  import_batch_id: string | null;
  created_at: string;
  finished_at: string | null;
}

export function UrlImportClient({ initialJobs }: { initialJobs: JobItem[] }) {
  const [jobs, setJobs] = useState<JobItem[]>(initialJobs);
  const [supplierName, setSupplierName] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [allowedDomain, setAllowedDomain] = useState("");
  const [crawlMode, setCrawlMode] = useState<"single_product" | "category">("category");
  const [maxPages, setMaxPages] = useState(50);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadJobs() {
    try {
      const res = await fetch("/api/admin/url-import?limit=50");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setJobs(data);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  async function handleCrawl() {
    setError(null);
    if (!supplierName.trim() || !startUrl.trim()) {
      setError("Supplier name and start URL are required.");
      return;
    }
    setCrawling(true);
    try {
      const res = await fetch("/api/admin/url-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name: supplierName.trim(),
          start_url: startUrl.trim(),
          allowed_domain: allowedDomain.trim() || undefined,
          crawl_mode: crawlMode,
          max_pages: maxPages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Crawl failed");
      await loadJobs();
      if (data.jobId) {
        window.location.href = `/dashboard/url-import/${data.jobId}`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Start URL import</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste a manufacturer or distributor category/product URL. Crawl is restricted to the allowed domain and max pages.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier_name">Supplier / manufacturer name</Label>
              <Input
                id="supplier_name"
                placeholder="Acme Gloves"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_url">Start URL</Label>
              <Input
                id="start_url"
                type="url"
                placeholder="https://example.com/gloves/category"
                value={startUrl}
                onChange={(e) => setStartUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="allowed_domain">Allowed domain (optional)</Label>
              <Input
                id="allowed_domain"
                placeholder="example.com"
                value={allowedDomain}
                onChange={(e) => setAllowedDomain(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to use the start URL host.</p>
            </div>
            <div className="space-y-2">
              <Label>Crawl mode</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="crawl_mode"
                    checked={crawlMode === "single_product"}
                    onChange={() => setCrawlMode("single_product")}
                  />
                  Single product page
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="crawl_mode"
                    checked={crawlMode === "category"}
                    onChange={() => setCrawlMode("category")}
                  />
                  Category page crawl
                </label>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_pages">Max pages (1–500)</Label>
              <Input
                id="max_pages"
                type="number"
                min={1}
                max={500}
                value={maxPages}
                onChange={(e) => setMaxPages(Math.min(500, Math.max(1, Number(e.target.value) || 50)))}
                className="w-24"
              />
            </div>
            <Button onClick={handleCrawl} disabled={crawling}>
              {crawling ? "Crawling…" : "Crawl"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent URL import jobs</CardTitle>
          <p className="text-sm text-muted-foreground">Status, pages crawled, products extracted, and link to preview.</p>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No URL import jobs yet.</p>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0">
                  <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>
                    {job.status}
                  </Badge>
                  <span className="font-medium">{job.supplier_name}</span>
                  <span className="text-muted-foreground text-sm truncate max-w-[200px]" title={job.start_url}>
                    {job.start_url}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {job.pages_crawled} pages · {job.products_extracted} products
                    {job.family_groups_inferred > 0 && ` · ${job.family_groups_inferred} families`}
                    {job.failed_pages_count > 0 && ` · ${job.failed_pages_count} failed`}
                  </span>
                  <Link href={`/dashboard/url-import/${job.id}`} className="text-primary text-sm hover:underline ml-auto">
                    Preview / Review
                  </Link>
                  {job.import_batch_id && (
                    <Link href={`/dashboard/batches/${job.import_batch_id}`} className="text-muted-foreground text-sm hover:underline">
                      Batch
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

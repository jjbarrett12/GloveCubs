"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CrawlJobForAdmin } from "@/lib/distributor-sync/admin-data";

export function CrawlJobsSection({ jobs }: { jobs: CrawlJobForAdmin[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Crawl Jobs</CardTitle>
        <p className="text-sm text-muted-foreground">Recent jobs. Click a row to view details.</p>
      </CardHeader>
      <CardContent className="p-0">
        {jobs.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No crawl jobs yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium">Job</th>
                  <th className="text-left p-3 font-medium">Distributor</th>
                  <th className="text-right p-3 font-medium">Pages</th>
                  <th className="text-right p-3 font-medium">Products</th>
                  <th className="text-right p-3 font-medium">New</th>
                  <th className="text-right p-3 font-medium">Updated</th>
                  <th className="text-right p-3 font-medium">Missing</th>
                  <th className="text-right p-3 font-medium">Errors</th>
                  <th className="text-left p-3 font-medium">Started</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    className="border-b border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => (window.location.href = `/admin/distributors?job=${j.id}`)}
                  >
                    <td className="p-3">
                      <Link
                        href={`/admin/distributors?job=${j.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {j.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="p-3">{j.distributor_name}</td>
                    <td className="p-3 text-right tabular-nums">{j.pages_discovered}</td>
                    <td className="p-3 text-right tabular-nums">{j.products_extracted}</td>
                    <td className="p-3 text-right tabular-nums">{j.new_products}</td>
                    <td className="p-3 text-right tabular-nums">{j.updated_products}</td>
                    <td className="p-3 text-right tabular-nums">{j.missing_products}</td>
                    <td className="p-3 text-right tabular-nums">{j.errors_count}</td>
                    <td className="p-3 text-muted-foreground">
                      {j.started_at
                        ? new Date(j.started_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          j.status === "completed"
                            ? "default"
                            : j.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {j.status}
                      </Badge>
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

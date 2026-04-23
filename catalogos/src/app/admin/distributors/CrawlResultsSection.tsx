"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StagingRowForAdmin, FailedPageForAdmin } from "@/lib/distributor-sync/admin-data";

export function CrawlResultsSection({
  jobId,
  staging,
  failedPages,
  onApproveReject,
}: {
  jobId: string;
  staging: StagingRowForAdmin[];
  failedPages: FailedPageForAdmin[];
  onApproveReject?: () => void;
}) {
  const router = useRouter();
  const [rawModal, setRawModal] = useState<StagingRowForAdmin | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const pending = staging.filter((s) => s.status === "pending");
  const approved = staging.filter((s) => s.status === "approved");
  const rejected = staging.filter((s) => s.status === "rejected");

  async function setStatus(id: string, status: "approved" | "rejected") {
    setUpdating(id);
    try {
      const res = await fetch(`/api/admin/distributor-staging/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        router.refresh();
        onApproveReject?.();
      }
    } finally {
      setUpdating(null);
    }
  }

  function RowActions({ row }: { row: StagingRowForAdmin }) {
    return (
      <td className="p-3 flex gap-2">
        {row.status === "pending" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus(row.id, "approved")}
              disabled={updating === row.id}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatus(row.id, "rejected")}
              disabled={updating === row.id}
            >
              Reject
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => setRawModal(row)}>
          View raw
        </Button>
      </td>
    );
  }

  const tableFragment = (rows: StagingRowForAdmin[], title: string) => (
    <div className="mb-4">
      <h4 className="text-sm font-medium mb-2">{title} ({rows.length})</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <div className="overflow-x-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2 font-medium">SKU</th>
                <th className="text-left p-2 font-medium">Name</th>
                <th className="text-left p-2 font-medium">Brand</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                  <td className="p-2 font-mono text-xs">{r.supplier_sku ?? "—"}</td>
                  <td className="p-2 max-w-[200px] truncate">{r.product_name ?? "—"}</td>
                  <td className="p-2">{r.brand ?? "—"}</td>
                  <td className="p-2">
                    <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                  </td>
                  <RowActions row={r} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Crawl Results</CardTitle>
          <p className="text-sm text-muted-foreground">
            Job {jobId.slice(0, 8)}… — staged products and failed pages.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {tableFragment(pending, "New products (pending)")}
          {tableFragment(approved, "Approved products")}
          {tableFragment(rejected, "Rejected products")}
          <div>
            <h4 className="text-sm font-medium mb-2">Failed extraction ({failedPages.length})</h4>
            {failedPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                {failedPages.slice(0, 20).map((p) => (
                  <li key={p.id} className="truncate max-w-[500px]" title={p.url}>
                    {p.url}
                  </li>
                ))}
                {failedPages.length > 20 && (
                  <li>… and {failedPages.length - 20} more</li>
                )}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!rawModal} onOpenChange={(open) => { if (!open) setRawModal(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Raw data</DialogTitle>
          </DialogHeader>
          {rawModal && (
            <pre className="text-xs bg-muted p-4 rounded-md overflow-auto whitespace-pre-wrap">
              {JSON.stringify(
                {
                  raw_payload: rawModal.raw_payload,
                  normalized_payload: rawModal.normalized_payload,
                },
                null,
                2
              )}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

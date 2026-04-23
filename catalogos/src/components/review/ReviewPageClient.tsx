"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReviewFilters } from "./ReviewFilters";
import { StagingTable } from "./StagingTable";
import { StagedProductDetail } from "./StagedProductDetail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { StagingRow } from "@/lib/review/data";
import { isPublishBlocked } from "@/lib/review/publish-blocked";
import {
  bulkApproveStaged,
  bulkRejectStaged,
  bulkMarkForReview,
  approveAllAboveConfidence,
  bulkPublishStaged,
  publishAllApprovedInBatch,
} from "@/app/actions/review";

const CONFIDENCE_THRESHOLD = 0.85;

type BulkResultDisplay =
  | { type: "approve"; succeeded: number; failed: number; errors: string[] }
  | { type: "reject"; succeeded: number; failed: number; errors: string[] }
  | { type: "mark_review"; succeeded: number; failed: number; errors: string[] }
  | { type: "approve_all"; succeeded: number; failed: number; errors: string[] }
  | { type: "publish"; published: number; succeeded: number; failed: number; publishErrors: string[] }
  | null;

interface ReviewPageClientProps {
  rows: StagingRow[];
  suppliers: { id: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
  /** From URL batch_id when reviewing a single batch; enables approve-all and publish-all. */
  batchId?: string | null;
  approvedCount: number;
  pendingCount: number;
}

export function ReviewPageClient({
  rows,
  suppliers,
  categories,
  batchId,
  approvedCount,
  pendingCount,
}: ReviewPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const [selectedId, setSelectedId] = useState<string | null>(idFromUrl);
  const [sheetOpen, setSheetOpen] = useState(!!idFromUrl);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<BulkResultDisplay>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (idFromUrl) {
      setSelectedId(idFromUrl);
      setSheetOpen(true);
    }
  }, [idFromUrl]);

  function openDetail(id: string) {
    setSelectedId(id);
    setSheetOpen(true);
  }

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));
  const selectedApprovedOrMerged = selectedRows.filter(
    (r) => r.status === "approved" || r.status === "merged"
  );
  const anyBlocked = selectedRows.some(isPublishBlocked);
  const firstMatchMasterId = selectedRows.find((r) => r.master_product_id)?.master_product_id ?? null;
  const allSelectedCanBeApproved = selectedRows.every(
    (r) => r.status === "pending" || r.status === "approved" || r.status === "merged"
  );

  const canApproveSelected =
    selectedIds.size > 0 &&
    firstMatchMasterId != null &&
    allSelectedCanBeApproved;
  const canRejectSelected = selectedIds.size > 0;
  const canMarkForReview = selectedIds.size > 0;
  const canApproveAllAbove = batchId != null && pendingCount > 0;
  const canPublishSelected =
    selectedIds.size > 0 &&
    selectedApprovedOrMerged.length === selectedIds.size &&
    !anyBlocked;
  const canPublishAll = batchId != null && approvedCount > 0;

  function runAction<T>(fn: () => Promise<T>, then: (data: T) => void) {
    startTransition(async () => {
      try {
        const data = await fn();
        then(data as T);
        setSelectedIds(new Set());
        router.refresh();
      } catch (e) {
        setLastResult({
          type: "reject",
          succeeded: 0,
          failed: 1,
          errors: [e instanceof Error ? e.message : "Action failed"],
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <ReviewFilters suppliers={suppliers} categories={categories} />

      {/* Bulk action bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Bulk actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            disabled={!canApproveSelected || isPending}
            title={!firstMatchMasterId ? "Select at least one row with a match to approve to that product" : undefined}
            onClick={() => {
              if (!firstMatchMasterId) return;
              runAction(
                () => bulkApproveStaged(Array.from(selectedIds), firstMatchMasterId),
                (r) => setLastResult({ type: "approve", succeeded: r.succeeded, failed: r.failed, errors: r.errors })
              );
            }}
          >
            Approve selected
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canRejectSelected || isPending}
            onClick={() => {
              runAction(() => bulkRejectStaged(Array.from(selectedIds)), (r) =>
                setLastResult({ type: "reject", succeeded: r.succeeded, failed: r.failed, errors: r.errors })
              );
            }}
          >
            Reject selected
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canMarkForReview || isPending}
            onClick={() => {
              runAction(() => bulkMarkForReview(Array.from(selectedIds)), (r) =>
                setLastResult({ type: "mark_review", succeeded: r.succeeded, failed: r.failed, errors: r.errors })
              );
            }}
          >
            Mark selected for review
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canApproveAllAbove || isPending}
            title={!batchId ? "Filter by batch to use this action" : undefined}
            onClick={() => {
              if (!batchId) return;
              runAction(
                () => approveAllAboveConfidence(batchId, CONFIDENCE_THRESHOLD),
                (r) => setLastResult({ type: "approve_all", succeeded: r.succeeded, failed: r.failed, errors: r.errors })
              );
            }}
          >
            Approve all with confidence ≥ 0.85
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!canPublishSelected || isPending}
            title={anyBlocked ? "Some selected rows are blocked (missing required attributes or no match)" : undefined}
            onClick={() => {
              runAction(() => bulkPublishStaged(Array.from(selectedIds)), (r) =>
                setLastResult({
                  type: "publish",
                  published: r.published,
                  succeeded: r.succeeded,
                  failed: r.failed,
                  publishErrors: r.publishErrors ?? [],
                })
              );
            }}
          >
            Publish selected approved
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!canPublishAll || isPending}
            title={!batchId ? "Filter by batch to use this action" : undefined}
            onClick={() => {
              if (!batchId) return;
              runAction(() => publishAllApprovedInBatch(batchId), (r) =>
                setLastResult({
                  type: "publish",
                  published: r.published,
                  succeeded: r.succeeded,
                  failed: r.failed,
                  publishErrors: r.publishErrors ?? [],
                })
              );
            }}
          >
            Publish all approved in batch
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear selection ({selectedIds.size})
            </Button>
          )}
          {isPending && <span className="text-xs text-muted-foreground">Running…</span>}
        </CardContent>
      </Card>

      {/* Last action result */}
      {lastResult && (
        <Card className="border-primary/50">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium">Last action result</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {lastResult.type === "publish" && (
              <>
                <p>Published: {lastResult.published}</p>
                <p>Succeeded: {lastResult.succeeded}</p>
                <p>Failed: {lastResult.failed}</p>
                {lastResult.publishErrors.length > 0 && (
                  <p className="text-destructive">Errors: {lastResult.publishErrors.slice(0, 5).join("; ")}</p>
                )}
              </>
            )}
            {(lastResult.type === "approve" ||
              lastResult.type === "reject" ||
              lastResult.type === "mark_review" ||
              lastResult.type === "approve_all") && (
              <>
                <p>Processed: {lastResult.succeeded + lastResult.failed}</p>
                <p>Succeeded: {lastResult.succeeded}</p>
                <p>Failed: {lastResult.failed}</p>
                {lastResult.errors.length > 0 && (
                  <p className="text-destructive">Errors: {lastResult.errors.slice(0, 5).join("; ")}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <StagingTable
        rows={rows}
        onRowClick={openDetail}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        getBlocked={isPublishBlocked}
      />
      <StagedProductDetail
        normalizedId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        categories={categories}
      />
    </div>
  );
}

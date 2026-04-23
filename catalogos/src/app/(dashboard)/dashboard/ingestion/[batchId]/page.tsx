import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBatchById,
  getBatchStagingSummaryCounts,
  getBatchOperatorQueueCounts,
  getBatchIngestionWorkflowSummary,
} from "@/lib/review/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IngestionBatchDetailClient } from "./IngestionBatchDetailClient";
import VariantFamiliesPanel from "./VariantFamiliesPanel";

export default async function IngestionBatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ filter?: string; confidence?: string; family_key?: string }>;
}) {
  const { batchId } = await params;
  const { filter, confidence, family_key: familyKey } = await searchParams;
  const batch = await getBatchById(batchId);
  if (!batch) notFound();

  const summary = await getBatchStagingSummaryCounts(batchId);
  const operatorQueues = await getBatchOperatorQueueCounts(batchId);
  const workflow = await getBatchIngestionWorkflowSummary(batchId);
  const supplierName = (batch.supplier as { name?: string })?.name ?? "—";
  const stats = (batch.stats as Record<string, number>) ?? {};
  const anomalyRowCount = stats.anomaly_row_count ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/ingestion" className="text-muted-foreground hover:text-foreground text-sm">
          ← Ingestion
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Batch {batchId.slice(0, 8)}…</h1>
        <Badge variant={batch.status === "completed" ? "success" : batch.status === "failed" ? "destructive" : "warning"}>
          {String(batch.status)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Supplier</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{supplierName}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total rows</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{summary.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Needs review</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-600">{summary.pending}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-600">{summary.approved_or_merged}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{summary.rejected}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Anomalies / low conf.</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-500">
            {anomalyRowCount} / {summary.low_confidence}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sync failed</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-red-600">{summary.sync_failed}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sync pending</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-600">{summary.pending_search_sync}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">AI match queue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-violet-600">{summary.ai_match_pending}</CardContent>
          <p className="text-xs text-muted-foreground px-6 pb-4">Pass 2 pending</p>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">AI suggestions ready</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-violet-700">{summary.ai_suggestions_ready}</CardContent>
          <p className="text-xs text-muted-foreground px-6 pb-4">Awaiting approve</p>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Ingestion workflow</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Auto-ready</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-emerald-600">{workflow.auto_candidate}</CardContent>
            <p className="text-[10px] text-muted-foreground px-6 pb-3">disposition auto_candidate + match</p>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Needs review (disp.)</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-amber-600">{workflow.needs_review_disposition}</CardContent>
            <p className="text-[10px] text-muted-foreground px-6 pb-3">ingestion_disposition</p>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Missing image</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-amber-700">{workflow.missing_image}</CardContent>
            <p className="text-[10px] text-muted-foreground px-6 pb-3">pending, image_missing</p>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Missing (families)</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-amber-800">{workflow.missing_image_family}</CardContent>
            <p className="text-[10px] text-muted-foreground px-6 pb-3">pending, grouped variants</p>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Low conf. match</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-amber-600">{workflow.low_confidence_match}</CardContent>
            <p className="text-[10px] text-muted-foreground px-6 pb-3">pending + master + conf &lt; 0.85</p>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Unmatched</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">{workflow.unmatched}</CardContent>
            <p className="text-[10px] text-muted-foreground px-6 pb-3">pending, no master</p>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Family conflicts</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-violet-700">{workflow.family_conflict_rows}</CardContent>
            <p className="text-[10px] text-muted-foreground px-6 pb-3">pending in conflicted families</p>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">Ready to publish</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold text-sky-600">{workflow.ready_to_publish}</CardContent>
            <p className="text-[10px] text-muted-foreground px-6 pb-3">approved/merged, not synced</p>
          </Card>
        </div>
      </div>

      <VariantFamiliesPanel batchId={batchId} />

      <IngestionBatchDetailClient
        key={`${filter ?? "all"}-${confidence ?? ""}-${familyKey ?? ""}`}
        batchId={batchId}
        currentFilter={filter ?? "all"}
        currentConfidence={confidence}
        familyGroupKey={familyKey ?? ""}
        operatorQueues={operatorQueues}
        approvedCount={summary.approved_or_merged}
        pendingCount={summary.pending}
        totalRowCount={summary.total}
        aiMatchPending={summary.ai_match_pending}
        aiSuggestionsReady={summary.ai_suggestions_ready}
        workflowSummary={workflow}
      />
    </div>
  );
}

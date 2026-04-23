"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FamilyGroupMetaV1 } from "@/lib/variant-family";
import type { FamilyOperatorMeta } from "@/lib/review/family-review-types";
import { hasFamilyConflict } from "@/lib/review/family-review-types";
import {
  bulkApproveStaged,
  bulkApproveAiSuggestions,
  bulkRejectStaged,
} from "@/app/actions/review";

export type FamilyReviewRowDTO = {
  id: string;
  status: string;
  sku: string;
  variant_axis: string | null;
  variant_value: string | null;
  inferred_size: string | null;
  title: string;
  ai_match_status: string | null;
  ai_match_queue_reason: string | null;
  ai_confidence: number | null;
  ai_suggested_master_product_id: string | null;
  ai_suggested_master_sku: string | null;
  ai_suggested_master_name: string | null;
  master_product_id: string | null;
  master_sku: string | null;
  match_confidence: number | null;
};

export type FamilyReviewGroupDTO = {
  family_group_key: string;
  inferred_base_sku: string;
  variant_axis: string | null;
  confidence: number;
  variantCount: number;
  family_group_meta: FamilyGroupMetaV1 | null;
  operator: FamilyOperatorMeta;
  rows: FamilyReviewRowDTO[];
};

type FamilyTab = "all" | "conflicts" | "quick_win" | "ai_ready" | "unmatched";

export function FamilyFirstReviewClient({
  batchId,
  groups,
  conflictFamilyCount,
}: {
  batchId: string;
  groups: FamilyReviewGroupDTO[];
  conflictFamilyCount: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<FamilyTab>("all");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeMsg, setMergeMsg] = useState<string | null>(null);
  const [mergeTitle, setMergeTitle] = useState("");
  const [mergeBrand, setMergeBrand] = useState("");
  const [openMergeKey, setOpenMergeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      const op = g.operator;
      if (tab === "conflicts") return hasFamilyConflict(op);
      if (tab === "quick_win") return op.sharedAutoApproveMasterId != null && op.pendingCount > 0;
      if (tab === "ai_ready") return op.aiSuggestionReadyCount > 0;
      if (tab === "unmatched") return op.unmatchedPendingCount > 0;
      return true;
    });
  }, [groups, tab]);

  const base = `/dashboard/ingestion/${batchId}`;

  const rowsHref = (familyKey: string) =>
    `${base}?filter=needs_review&family_key=${encodeURIComponent(familyKey)}`;

  const runFamily = (fn: () => Promise<unknown>, ok: string) => {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        setMergeMsg(ok);
      } catch (e) {
        setMergeMsg(e instanceof Error ? e.message : "Action failed");
      }
    });
  };

  const submitFamilyMerge = async (g: FamilyReviewGroupDTO) => {
    const merge: Record<string, unknown> = {};
    if (mergeTitle.trim()) merge.canonical_title = mergeTitle.trim();
    if (mergeBrand.trim()) merge.brand = mergeBrand.trim();
    if (Object.keys(merge).length === 0) {
      setMergeMsg("Enter at least title or brand to merge.");
      return;
    }
    const ids = g.operator.pendingIds;
    if (ids.length === 0) {
      setMergeMsg("No pending rows in this family.");
      return;
    }
    setMergeBusy(true);
    setMergeMsg(null);
    try {
      const res = await fetch(`/api/supplier-import/batches/${batchId}/bulk-merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalized_ids: ids.slice(0, 500), merge }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "bulk-merge failed");
      setMergeMsg(`Merged ${data.updated ?? 0} row(s).`);
      setMergeTitle("");
      setMergeBrand("");
      setOpenMergeKey(null);
      router.refresh();
    } catch (e) {
      setMergeMsg(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMergeBusy(false);
    }
  };

  if (groups.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Family-first review</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Work by variant family: base SKU, axis, values, and pass-2 AI state. Bulk actions apply to all{" "}
            <strong>pending</strong> rows in the family (up to 200 per server action).
          </p>
        </div>
        {conflictFamilyCount > 0 ? (
          <Badge variant="destructive" className="text-xs">
            {conflictFamilyCount} famil{conflictFamilyCount === 1 ? "y" : "ies"} with conflicting match / AI
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground mr-1 self-center">Show:</span>
          {(
            [
              ["all", "All families"],
              ["conflicts", "Conflicts"],
              ["quick_win", "Quick approve"],
              ["ai_ready", "AI suggestion"],
              ["unmatched", "Unmatched"],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              type="button"
              variant={tab === k ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setTab(k)}
            >
              {label}
            </Button>
          ))}
        </div>

        {mergeMsg && (
          <p className="text-xs rounded-md border border-border bg-muted/40 px-3 py-2">{mergeMsg}</p>
        )}

        <div className="space-y-4 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No families match this filter.</p>
          )}
          {filtered.map((g) => {
            const op = g.operator;
            const axisLabel = g.variant_axis ?? "size";
            const conflict = hasFamilyConflict(op);
            return (
              <div
                key={g.family_group_key.slice(0, 120)}
                className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold font-mono">{g.inferred_base_sku || "—"}</span>
                  <Badge variant="secondary" className="text-xs">
                    axis: {axisLabel}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {g.variantCount} rows
                  </Badge>
                  <span className="text-xs text-muted-foreground">group conf. {(g.confidence * 100).toFixed(0)}%</span>
                  {conflict ? (
                    <Badge variant="destructive" className="text-xs">
                      Conflict
                    </Badge>
                  ) : null}
                  {op.sharedAutoApproveMasterId ? (
                    <Badge variant="default" className="text-xs bg-emerald-700 hover:bg-emerald-700">
                      Quick approve
                    </Badge>
                  ) : null}
                  {op.aiSuggestionReadyCount > 0 ? (
                    <Badge variant="secondary" className="text-xs text-violet-800 dark:text-violet-200">
                      AI ready ×{op.aiSuggestionReadyCount}
                    </Badge>
                  ) : null}
                  {op.aiMatchQueuedCount > 0 ? (
                    <Badge variant="outline" className="text-xs border-violet-500/50">
                      AI queued ×{op.aiMatchQueuedCount}
                    </Badge>
                  ) : null}
                </div>

                {g.family_group_meta?.flags?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {g.family_group_meta.flags.map((f) => (
                      <Badge
                        key={f}
                        variant="outline"
                        className="text-[10px] font-normal border-amber-500/50 text-amber-800 dark:text-amber-200"
                      >
                        {f}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <ul className="text-xs space-y-2 border-t border-border/60 pt-2">
                  {g.rows.map((r) => {
                    const val =
                      r.variant_value ?? r.inferred_size ?? (axisLabel === "size" ? r.inferred_size : null) ?? "—";
                    const ai = r.ai_match_status ?? "—";
                    return (
                      <li
                        key={r.id}
                        className="rounded-md border border-border/50 bg-background/60 p-2 space-y-1"
                      >
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-muted-foreground">
                          <span className="text-foreground shrink-0">{r.sku}</span>
                          <span>
                            {axisLabel}=<strong className="text-foreground">{val}</strong>
                          </span>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {r.status}
                          </Badge>
                          <Link href={`/dashboard/review?id=${r.id}`} className="text-primary hover:underline shrink-0">
                            Row review
                          </Link>
                        </div>
                        {r.title ? (
                          <p className="text-[11px] text-muted-foreground truncate" title={r.title}>
                            {r.title}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>
                            <span className="text-foreground/80">AI status:</span> {ai}
                            {r.ai_match_queue_reason ? (
                              <span className="block text-amber-700 dark:text-amber-300">
                                Queue: {r.ai_match_queue_reason}
                              </span>
                            ) : null}
                          </span>
                          <span>
                            <span className="text-foreground/80">AI conf.:</span>{" "}
                            {r.ai_confidence != null ? `${(Number(r.ai_confidence) * 100).toFixed(0)}%` : "—"}
                          </span>
                          <span className="sm:col-span-2">
                            <span className="text-foreground/80">Suggested master:</span>{" "}
                            {r.ai_suggested_master_sku ?? r.ai_suggested_master_product_id ?? "—"}
                            {r.ai_suggested_master_name ? (
                              <span className="text-muted-foreground"> — {r.ai_suggested_master_name}</span>
                            ) : null}
                          </span>
                          <span>
                            <span className="text-foreground/80">Rules match:</span>{" "}
                            {r.master_sku ?? (r.master_product_id ? r.master_product_id.slice(0, 8) : "—")}
                            {r.match_confidence != null ? ` (${(Number(r.match_confidence) * 100).toFixed(0)}%)` : ""}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
                  <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <Link href={rowsHref(g.family_group_key)}>Table view (this family)</Link>
                  </Button>
                  {op.sharedAutoApproveMasterId ? (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-8 text-xs bg-emerald-700 hover:bg-emerald-700"
                      disabled={isPending || op.pendingIds.length === 0}
                      onClick={() =>
                        runFamily(
                          () => bulkApproveStaged(op.pendingIds, op.sharedAutoApproveMasterId!),
                          "Approved family (rules match)."
                        )
                      }
                    >
                      Approve family
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={isPending || op.aiSuggestionReadyCount === 0}
                    title={
                      op.aiSuggestionReadyCount === 0
                        ? "No pending rows with completed AI suggestions"
                        : undefined
                    }
                    onClick={() =>
                      runFamily(
                        () => bulkApproveAiSuggestions(op.pendingIds),
                        "Applied AI suggestions for pending rows."
                      )
                    }
                  >
                    Apply AI (family)
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={isPending || op.pendingIds.length === 0}
                    onClick={() =>
                      runFamily(() => bulkRejectStaged(op.pendingIds), "Rejected pending rows in family.")
                    }
                  >
                    Reject family
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    type="button"
                    onClick={() => setOpenMergeKey((k) => (k === g.family_group_key ? null : g.family_group_key))}
                  >
                    Merge fields…
                  </Button>
                </div>

                {openMergeKey === g.family_group_key && (
                  <div className="rounded-md border border-dashed border-border p-3 space-y-2 bg-muted/30">
                    <p className="text-[11px] text-muted-foreground">
                      Merge into <code className="text-xs">normalized_data</code> for all pending rows in this family
                      (same API as batch merge).
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">canonical_title</Label>
                        <Input className="h-8 text-sm" value={mergeTitle} onChange={(e) => setMergeTitle(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">brand</Label>
                        <Input className="h-8 text-sm" value={mergeBrand} onChange={(e) => setMergeBrand(e.target.value)} />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={mergeBusy}
                      onClick={() => void submitFamilyMerge(g)}
                    >
                      {mergeBusy ? "Merging…" : "Apply merge to family"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {groups.length > filtered.length && tab !== "all" && (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {groups.length} families for this tab.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

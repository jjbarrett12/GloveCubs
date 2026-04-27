"use client";

import {
  useState,
  useTransition,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BatchIngestionWorkflowSummary, BatchOperatorQueueCounts, StagingRow } from "@/lib/review/data";
import {
  bulkApproveStaged,
  bulkApproveAiSuggestions,
  bulkRejectStaged,
  bulkMarkForReview,
  approveAllAboveConfidence,
  approveAllAiSuggestionsInBatch,
  approveAllAutoReadyInBatch,
  bulkPublishStaged,
  publishNextApprovedPublishChunk,
  updateImportPricingOverride,
} from "@/app/actions/review";
import { effectiveImportPricing, type ImportAutoPricingWithOverride } from "@/lib/ingestion/import-pricing";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ApproveAllAutoReadyResult } from "@/app/actions/review";
import { getBulkEligibility } from "./ingestion-bulk-eligibility";
import { isPublishBlocked } from "@/lib/review/publish-blocked";
import { BULK_PUBLISH_CHUNK_SIZE } from "@/lib/review/bulk-publish-config";
const CONFIDENCE_THRESHOLD = 0.85;
const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 100;

type LoadState = "idle" | "loading" | "error";

export type ActionResult =
  | { type: "approve"; result: { succeeded: number; failed: number; errors: string[] } }
  | { type: "reject"; result: { succeeded: number; failed: number; errors: string[] } }
  | { type: "mark_review"; result: { succeeded: number; failed: number; errors: string[] } }
  | { type: "approve_all"; result: { succeeded: number; failed: number; errors: string[] } }
  | { type: "approve_all_auto"; result: ApproveAllAutoReadyResult }
  | {
      type: "publish";
      result: { published: number; succeeded: number; failed: number; publishErrors: string[]; chunks?: number };
    }
  | null;

type RowsApiResponse = {
  rows: StagingRow[];
  total: number;
  limit: number;
  offset: number;
};

const REVIEW_QUEUE_FILTERS = new Set([
  "auto_approvable",
  "unmatched",
  "needs_attention",
  "auto_ready",
  /** Pipeline disposition needs_review (not “every pending row”). */
  "needs_review",
  "needs_review_disposition",
  "missing_image",
  "missing_image_family",
  "low_confidence_match",
  "family_conflict",
]);

function filterToStatusParam(filter: string): string | undefined {
  if (filter === "pending" || filter === "all_pending") return "pending";
  if (filter === "approved") return "approved";
  if (filter === "rejected") return "rejected";
  return undefined;
}

function buildRowsQuery(
  batchId: string,
  opts: { limit: number; offset: number; filter: string; confidence?: string; familyGroupKey?: string }
) {
  const p = new URLSearchParams();
  p.set("limit", String(opts.limit));
  p.set("offset", String(opts.offset));
  if (REVIEW_QUEUE_FILTERS.has(opts.filter)) {
    p.set("review_queue", opts.filter);
  } else {
    const st = filterToStatusParam(opts.filter);
    if (st) p.set("status", st);
  }
  if (opts.confidence === "high") p.set("confidence_min", String(CONFIDENCE_THRESHOLD));
  if (opts.filter === "ai_suggestions") p.set("ai_suggestions_ready", "1");
  if (opts.familyGroupKey?.trim()) p.set("family_group_key", opts.familyGroupKey.trim());
  return `/api/supplier-import/batches/${batchId}/rows?${p.toString()}`;
}

const BatchTableRow = memo(function BatchTableRow({
  row,
  selected,
  onToggle,
  reloadRows,
}: {
  row: StagingRow;
  selected: boolean;
  onToggle: (row: StagingRow) => void;
  reloadRows: () => Promise<void>;
}) {
  const nd = row.normalized_data as {
    sku?: string;
    name?: string;
    supplier_sku?: string;
    canonical_title?: string;
    image_url?: string;
    image_missing?: boolean;
    image_source?: string;
    image_confidence?: number;
    image_search_query?: string;
    family_image_url?: string;
    family_image_source?: string;
    image_inherits_family?: boolean;
    image_variant_override?: boolean;
    image_ownership_status?: "owned" | "failed" | "missing";
    catalog_image_public_url?: string | null;
    supplier_image_hotlink_url?: string | null;
    image_ownership_error?: string | null;
    ingestion_review_reasons?: string[];
    supplier_cost?: number;
    import_auto_pricing?: {
      supplier_cost: number;
      shipping_estimate: number;
      payment_fee_estimate: number;
      landed_cost: number;
      tier_a_price: number;
      tier_b_price: number;
      tier_c_price: number;
      tier_d_price: number;
      display_tier_price: number;
      display_tier: string;
      list_price: number;
      list_price_multiplier: number;
      pricing_rule_version: string;
      pricing_manual_override?: {
        list_price?: number;
        tier_a_price?: number;
        tier_b_price?: number;
        tier_c_price?: number;
        tier_d_price?: number;
        updated_at?: string;
      } | null;
    };
  };
  const sku = nd?.sku ?? nd?.supplier_sku ?? "—";
  const title = nd?.name ?? nd?.canonical_title ?? "—";
  const imgMissing = nd?.image_missing === true;
  const imgSource = nd?.image_source?.trim() ? nd.image_source : "—";
  const imgConf =
    nd?.image_confidence != null && Number.isFinite(Number(nd.image_confidence))
      ? Number(nd.image_confidence).toFixed(2)
      : null;
  const rowImg = (nd?.image_url ?? "").trim();
  const catalogPub = typeof nd?.catalog_image_public_url === "string" ? nd.catalog_image_public_url.trim() : "";
  const displayImgSrc = catalogPub || rowImg;
  const ownStatus = nd?.image_ownership_status;
  const ownErr =
    typeof nd?.image_ownership_error === "string" && nd.image_ownership_error.trim()
      ? nd.image_ownership_error.trim()
      : "";
  const famImg = (nd?.family_image_url ?? "").trim();
  const inheritsFam = nd?.image_inherits_family === true;
  const variantOv = nd?.image_variant_override === true;
  const imgReasons =
    Array.isArray(nd?.ingestion_review_reasons) && nd.ingestion_review_reasons.length > 0
      ? nd.ingestion_review_reasons.join(", ")
      : "";
  const flags =
    (row.normalized_data as { anomaly_flags?: { code: string; message: string }[] })?.anomaly_flags ?? [];
  const blocked = isPublishBlocked(row);
  const displayConf =
    row.ai_confidence != null ? row.ai_confidence : row.match_confidence != null ? row.match_confidence : null;
  const aiStatus = row.ai_match_status ?? "not_needed";
  const ap = nd?.import_auto_pricing;
  const eff = ap ? effectiveImportPricing(ap as ImportAutoPricingWithOverride) : null;
  const [pricingOpen, setPricingOpen] = useState(false);
  const [listEdit, setListEdit] = useState("");
  const [pricingErr, setPricingErr] = useState<string | null>(null);
  const [pricingBusy, startPricingSave] = useTransition();

  const pricingTitle =
    ap != null && eff != null
      ? [
          `supplier_cost ${ap.supplier_cost}`,
          `ship ${ap.shipping_estimate} fee ${ap.payment_fee_estimate}`,
          `landed ${ap.landed_cost}`,
          `min @20% ${eff.min_price_margin_floor}`,
          `A ${eff.tier_a_price} B ${eff.tier_b_price} C ${eff.tier_c_price} D ${eff.tier_d_price}`,
          `list (effective) ${eff.list_price}${eff.is_overridden ? " [override]" : ""}`,
          `list (import calc) ${ap.list_price} = D×${ap.list_price_multiplier}`,
          ap.pricing_rule_version,
        ].join("\n")
      : "";

  return (
    <tr className="border-b border-border hover:bg-muted/30">
      <td className="p-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(row)}
          aria-label={`Select row ${row.id}`}
        />
      </td>
      <td className="p-2 font-mono text-xs">{sku}</td>
      <td className="p-2 max-w-[220px] truncate" title={title}>
        {title}
      </td>
      <td className="p-2 text-xs text-muted-foreground max-w-[160px] align-top">
        {displayImgSrc ? (
          <img
            src={displayImgSrc}
            alt=""
            className="w-10 h-10 object-contain rounded border border-border mb-1 bg-white"
            loading="lazy"
          />
        ) : null}
        {ownStatus === "owned" ? (
          <Badge variant="success" className="text-[10px]">
            Owned
          </Badge>
        ) : ownStatus === "failed" ? (
          <Badge variant="destructive" className="text-[10px]">
            Failed
          </Badge>
        ) : ownStatus === "missing" ? (
          <Badge variant="warning" className="text-[10px]">
            Missing
          </Badge>
        ) : (
          <span className={imgMissing ? "text-amber-700 font-medium" : "text-emerald-700"}>
            {imgMissing ? "Missing" : "OK"}
          </span>
        )}
        {ownErr ? (
          <span className="block text-[9px] text-red-400/90 mt-0.5 line-clamp-2" title={ownErr}>
            {ownErr}
          </span>
        ) : null}
        {inheritsFam ? (
          <span className="ml-1 text-[10px] text-violet-600 font-medium" title="Same hero as family">
            family
          </span>
        ) : null}
        {variantOv ? (
          <span className="ml-1 text-[10px] text-sky-600 font-medium" title="Variant image override">
            override
          </span>
        ) : null}
        <span className="block truncate mt-0.5" title={[imgSource, imgConf != null ? `conf ${imgConf}` : ""].filter(Boolean).join(" · ")}>
          {imgSource}
        </span>
        {famImg && famImg !== rowImg ? (
          <span className="block text-[10px] text-muted-foreground truncate" title={famImg}>
            fam: …{famImg.slice(-24)}
          </span>
        ) : null}
        {imgConf != null ? (
          <span className="block text-[10px] text-muted-foreground/90 mt-0.5" title="image_confidence">
            img {imgConf}
          </span>
        ) : null}
        {imgReasons ? (
          <span className="block text-[10px] text-amber-600/90 mt-0.5 line-clamp-2" title={imgReasons}>
            {imgReasons}
          </span>
        ) : null}
      </td>
      <td className="p-2 text-right">
        {displayConf != null ? (
          <span className={displayConf >= 0.85 ? "text-emerald-600" : "text-amber-600"}>
            {(displayConf * 100).toFixed(0)}%
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="p-2 text-[10px] text-muted-foreground max-w-[140px] align-top leading-tight" title={pricingTitle}>
        {ap && eff ? (
          <>
            <span className="block font-mono text-foreground">
              ${ap.landed_cost.toFixed(2)} <span className="text-muted-foreground">landed</span>
            </span>
            <span className="block font-mono text-emerald-700">
              ${eff.list_price.toFixed(2)}{" "}
              <span className="text-muted-foreground">list{eff.is_overridden ? "*" : ""}</span>
            </span>
            <span className="block text-[9px] mt-0.5">
              D ${eff.tier_d_price.toFixed(2)} · A${eff.tier_a_price.toFixed(0)} B${eff.tier_b_price.toFixed(0)} C
              {eff.tier_c_price.toFixed(0)}
            </span>
            <span className="block text-[9px] text-muted-foreground/80 truncate" title={ap.pricing_rule_version}>
              {ap.pricing_rule_version}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 mt-1 text-[10px] text-primary"
              onClick={() => {
                setPricingErr(null);
                setListEdit(eff.list_price.toFixed(2));
                setPricingOpen(true);
              }}
            >
              Edit list
            </Button>
            <Dialog open={pricingOpen} onOpenChange={setPricingOpen}>
              <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Import list price</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                  Effective list (tier D × {ap.list_price_multiplier}). Minimum ${eff.min_price_margin_floor.toFixed(2)} to keep ≥20%
                  margin on landed.
                </p>
                <Label htmlFor={`list-${row.id}`} className="text-xs">
                  List price
                </Label>
                <Input
                  id={`list-${row.id}`}
                  className="font-mono"
                  value={listEdit}
                  onChange={(e) => setListEdit(e.target.value)}
                  disabled={pricingBusy}
                />
                {pricingErr ? <p className="text-xs text-destructive">{pricingErr}</p> : null}
                <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pricingBusy}
                    onClick={() => {
                      startPricingSave(async () => {
                        setPricingErr(null);
                        const r = await updateImportPricingOverride(row.id, {}, { clear: true });
                        if (!r.success) {
                          setPricingErr(r.error ?? "Failed");
                          return;
                        }
                        setPricingOpen(false);
                        await reloadRows();
                      });
                    }}
                  >
                    Reset auto
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pricingBusy}
                    onClick={() => {
                      startPricingSave(async () => {
                        setPricingErr(null);
                        const n = parseFloat(listEdit.replace(/,/g, ""));
                        if (!Number.isFinite(n) || n < 0) {
                          setPricingErr("Enter a valid number");
                          return;
                        }
                        const r = await updateImportPricingOverride(row.id, { list_price: n });
                        if (!r.success) {
                          setPricingErr(r.error ?? "Failed");
                          return;
                        }
                        setPricingOpen(false);
                        await reloadRows();
                      });
                    }}
                  >
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <span className="text-muted-foreground/70">—</span>
        )}
      </td>
      <td className="p-2 text-xs text-muted-foreground max-w-[140px]">
        {aiStatus === "pending" && <span className="text-violet-600">Queued for AI</span>}
        {aiStatus === "processing" && <span>In progress…</span>}
        {aiStatus === "failed" && <span className="text-destructive">AI failed</span>}
        {aiStatus === "completed" && row.ai_suggested_master_sku && (
          <span title={row.ai_suggested_master_name ?? ""} className="text-violet-700">
            → {row.ai_suggested_master_sku}
          </span>
        )}
        {aiStatus === "completed" && !row.ai_suggested_master_sku && row.ai_suggested_master_product_id && (
          <span className="italic">Suggested (load SKU)</span>
        )}
        {aiStatus === "completed" && !row.ai_suggested_master_product_id && (
          <span className="italic">No suggestion</span>
        )}
        {aiStatus === "not_needed" && "—"}
      </td>
      <td className="p-2">
        <Badge
          variant={
            row.status === "approved" || row.status === "merged"
              ? "success"
              : row.status === "rejected"
                ? "destructive"
                : "secondary"
          }
        >
          {row.status}
        </Badge>
      </td>
      <td className="p-2 text-muted-foreground text-xs max-w-[140px]">
        {row.family_group_key ? (
          <span className="block space-y-0.5" title={row.family_group_key.slice(0, 120)}>
            <span className="font-mono text-[10px] text-violet-700 block truncate">
              {row.inferred_base_sku ?? "—"} · {row.variant_axis ?? "size"}
            </span>
            <span className="text-[10px]">{row.variant_value ?? row.inferred_size ?? "—"}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/70">—</span>
        )}
      </td>
      <td className="p-2 text-muted-foreground text-xs">{row.master_sku ?? (row.master_product_id ? "matched" : "—")}</td>
      <td className="p-2 text-xs text-amber-600">{flags.length > 0 ? `${flags.length} warning(s)` : "—"}</td>
      <td className="p-2">
        {blocked ? (
          <Badge variant="destructive" className="text-xs">
            Blocked
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">OK</span>
        )}
      </td>
      <td className="p-2">
        <Link href={`/dashboard/review?id=${row.id}`} className="text-primary hover:underline">
          Review
        </Link>
      </td>
    </tr>
  );
});

export function IngestionBatchDetailClient({
  batchId,
  currentFilter,
  currentConfidence,
  familyGroupKey,
  operatorQueues,
  approvedCount,
  pendingCount,
  totalRowCount,
  aiMatchPending,
  aiSuggestionsReady,
  workflowSummary,
}: {
  batchId: string;
  currentFilter: string;
  currentConfidence?: string;
  /** When set, row API is scoped to this family_group_key (e.g. from family panel). */
  familyGroupKey?: string;
  operatorQueues: BatchOperatorQueueCounts;
  approvedCount: number;
  pendingCount: number;
  totalRowCount: number;
  aiMatchPending: number;
  aiSuggestionsReady: number;
  workflowSummary: BatchIngestionWorkflowSummary;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState<StagingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Cross-page selection: id → last known row snapshot */
  const [selectedById, setSelectedById] = useState<Record<string, StagingRow>>({});
  const [lastResult, setLastResult] = useState<ActionResult>(null);
  const [mergeTarget, setMergeTarget] = useState<"selected" | "all_pending">("selected");
  const [mergeMaxRows, setMergeMaxRows] = useState(2000);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeResult, setMergeResult] = useState<{
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [aiJobBusy, setAiJobBusy] = useState(false);
  const [aiJobMessage, setAiJobMessage] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishProgress, setPublishProgress] = useState<string | null>(null);
  const mergeFields = useRef({
    brand: "",
    uom: "",
    pack_size: "",
    category_guess: "",
    supplier_sku: "",
    canonical_title: "",
    short_description: "",
    long_description: "",
    image_url: "",
    supplier_cost: "",
    lead_time_days: "",
    stock_status: "",
  });
  const abortRef = useRef<AbortController | null>(null);

  const base = `/dashboard/ingestion/${batchId}`;
  const filterLink = (f: string) => {
    const params = new URLSearchParams();
    if (f !== "all") params.set("filter", f);
    if (familyGroupKey) params.set("family_key", familyGroupKey);
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };
  const confidenceLink = (c: string) => {
    const params = new URLSearchParams();
    if (currentFilter && currentFilter !== "all") params.set("filter", currentFilter);
    if (familyGroupKey) params.set("family_key", familyGroupKey);
    params.set("confidence", c);
    return `${base}?${params.toString()}`;
  };
  const clearFamilyFilterHref = (() => {
    const params = new URLSearchParams();
    if (currentFilter && currentFilter !== "all") params.set("filter", currentFilter);
    if (currentConfidence) params.set("confidence", currentConfidence);
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  })();

  const selectedRowsList = useMemo(() => Object.values(selectedById), [selectedById]);
  const selectedIdsSet = useMemo(() => new Set(Object.keys(selectedById)), [selectedById]);

  const eligibility = useMemo(
    () =>
      getBulkEligibility(
        selectedRowsList,
        selectedIdsSet,
        approvedCount,
        pendingCount,
        isPublishBlocked,
        workflowSummary.ready_to_publish
      ),
    [selectedRowsList, selectedIdsSet, approvedCount, pendingCount, workflowSummary.ready_to_publish]
  );

  const {
    canApproveSelected,
    canRejectSelected,
    canMarkForReview,
    canApproveAllAbove,
    canApproveAiSuggestions,
    canPublishSelected,
    canPublishAll,
    firstMatchMasterId,
    selectedApprovedOrMergedCount,
    selectionComplete,
  } = eligibility;
  const selectedHasMatch = firstMatchMasterId != null;

  const loadRows = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoadState("loading");
    setLoadError(null);
    try {
      const url = buildRowsQuery(batchId, {
        limit: pageSize,
        offset,
        filter: currentFilter,
        confidence: currentConfidence,
        familyGroupKey: familyGroupKey || undefined,
      });
      const res = await fetch(url, { signal: ac.signal });
      const data = (await res.json()) as RowsApiResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      setRows(data.rows ?? []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      setLoadState("idle");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setLoadState("error");
      setLoadError(e instanceof Error ? e.message : "Failed to load rows");
      setRows([]);
    }
  }, [batchId, pageSize, offset, currentFilter, currentConfidence]);

  const reloadRows = useCallback(async () => {
    router.refresh();
    await loadRows();
  }, [router, loadRows]);

  useEffect(() => {
    void loadRows();
    return () => abortRef.current?.abort();
  }, [loadRows]);

  useEffect(() => {
    setOffset(0);
  }, [pageSize]);

  const selectAllRef = useRef<HTMLInputElement>(null);
  const pageIds = rows.map((r) => r.id);
  const selectedOnPageCount = pageIds.filter((id) => selectedById[id]).length;
  const allOnPageSelected = rows.length > 0 && selectedOnPageCount === rows.length;
  const someOnPageSelected = selectedOnPageCount > 0 && selectedOnPageCount < rows.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someOnPageSelected;
  }, [someOnPageSelected]);

  const toggleRow = useCallback((row: StagingRow) => {
    setSelectedById((prev) => {
      const next = { ...prev };
      if (next[row.id]) delete next[row.id];
      else next[row.id] = row;
      return next;
    });
  }, []);

  const toggleSelectAllPage = useCallback(() => {
    setSelectedById((prev) => {
      const next = { ...prev };
      if (allOnPageSelected) {
        for (const r of rows) delete next[r.id];
      } else {
        for (const r of rows) next[r.id] = r;
      }
      return next;
    });
  }, [rows, allOnPageSelected]);

  const clearSelection = useCallback(() => setSelectedById({}), []);

  const runAction = <T,>(fn: () => Promise<T>, then: (data: T) => void) => {
    startTransition(async () => {
      try {
        const data = await fn();
        then(data as T);
        clearSelection();
        router.refresh();
        await loadRows();
      } catch (e) {
        setLastResult({
          type: "reject",
          result: {
            succeeded: 0,
            failed: 1,
            errors: [e instanceof Error ? e.message : "Action failed"],
          },
        });
      }
    });
  };

  const runPublishAllApprovedWithProgress = useCallback(() => {
    startTransition(async () => {
      setPublishBusy(true);
      setPublishProgress("Starting…");
      setLastResult(null);
      let totalPub = 0;
      let totalFail = 0;
      const allErrors: string[] = [];
      let passes = 0;
      const MAX_CHUNKS = 80;
      try {
        for (let i = 0; i < MAX_CHUNKS; i++) {
          passes++;
          const r = await publishNextApprovedPublishChunk(batchId, { chunkSize: BULK_PUBLISH_CHUNK_SIZE });
          totalPub += r.published;
          totalFail += r.failed;
          allErrors.push(...r.publishErrors);
          setPublishProgress(
            `Publishing… pass ${passes}: +${r.published} published this pass (${totalPub} total live)${r.done ? " — queue empty" : ""}`
          );
          if (r.done) break;
        }
        setLastResult({
          type: "publish",
          result: {
            published: totalPub,
            succeeded: totalPub,
            failed: totalFail,
            publishErrors: allErrors,
            chunks: passes,
          },
        });
      } catch (e) {
        setLastResult({
          type: "publish",
          result: {
            published: totalPub,
            succeeded: totalPub,
            failed: totalFail + 1,
            publishErrors: [...allErrors, e instanceof Error ? e.message : "Publish failed"],
            chunks: passes,
          },
        });
      } finally {
        setPublishProgress(null);
        setPublishBusy(false);
        clearSelection();
        router.refresh();
        await loadRows();
      }
    });
  }, [batchId, clearSelection, loadRows, router]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const currentPage = Math.floor(offset / pageSize) + 1;
  const windowStart = total === 0 ? 0 : offset + 1;
  const windowEnd = Math.min(offset + rows.length, offset + pageSize, total);

  const submitBulkMerge = async () => {
    const m = mergeFields.current;
    const merge: Record<string, unknown> = {};
    const setStr = (k: keyof typeof m, key: string) => {
      const v = m[k].trim();
      if (v) merge[key] = v;
    };
    setStr("brand", "brand");
    setStr("uom", "uom");
    setStr("pack_size", "pack_size");
    setStr("category_guess", "category_guess");
    setStr("supplier_sku", "supplier_sku");
    setStr("canonical_title", "canonical_title");
    setStr("short_description", "short_description");
    setStr("long_description", "long_description");
    setStr("image_url", "image_url");
    setStr("stock_status", "stock_status");
    if (m.supplier_cost.trim()) {
      const n = Number(m.supplier_cost);
      if (!Number.isNaN(n)) merge.supplier_cost = n;
    }
    if (m.lead_time_days.trim()) {
      const n = parseInt(m.lead_time_days, 10);
      if (!Number.isNaN(n)) merge.lead_time_days = n;
    }

    if (Object.keys(merge).length === 0) {
      setMergeResult({ updated: 0, skipped: 0, errors: ["Fill at least one field to merge"] });
      return;
    }

    if (mergeTarget === "selected" && selectedIdsSet.size === 0) {
      setMergeResult({ updated: 0, skipped: 0, errors: ["Select rows or switch to “All pending”"] });
      return;
    }

    setMergeBusy(true);
    setMergeResult(null);
    try {
      const body: Record<string, unknown> = {
        merge,
        max_rows: Math.min(5000, Math.max(1, mergeMaxRows)),
      };
      if (mergeTarget === "all_pending") body.all_pending = true;
      else body.normalized_ids = Array.from(selectedIdsSet);

      const res = await fetch(`/api/supplier-import/batches/${batchId}/bulk-merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMergeResult({
          updated: 0,
          skipped: 0,
          errors: [data.error || "bulk-merge failed"],
        });
        return;
      }
      setMergeResult({
        updated: data.updated ?? 0,
        skipped: data.skipped ?? 0,
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
      router.refresh();
      await loadRows();
    } catch (e) {
      setMergeResult({
        updated: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : "Request failed"],
      });
    } finally {
      setMergeBusy(false);
    }
  };

  const runAiMatchingChunk = useCallback(async () => {
    setAiJobBusy(true);
    setAiJobMessage(null);
    try {
      const res = await fetch(`/api/supplier-import/batches/${batchId}/run-ai-matching`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_rows: 40 }),
      });
      const data = (await res.json()) as {
        error?: string;
        succeeded?: number;
        failed?: number;
        remainingPendingEstimate?: number;
        skipped?: number;
      };
      if (!res.ok) throw new Error(data.error || res.statusText);
      setAiJobMessage(
        `AI pass: ${data.succeeded ?? 0} updated, ${data.failed ?? 0} failed, ${data.skipped ?? 0} skipped. ~${data.remainingPendingEstimate ?? "?"} still queued.`
      );
      router.refresh();
      await loadRows();
    } catch (e) {
      setAiJobMessage(e instanceof Error ? e.message : "AI matching failed");
    } finally {
      setAiJobBusy(false);
    }
  }, [batchId, router, loadRows]);

  const highConfActive = currentConfidence === "high";
  const aiSuggestionsActive = currentFilter === "ai_suggestions";
  const autoApprovableActive = currentFilter === "auto_approvable";
  const unmatchedActive = currentFilter === "unmatched";
  const needsAttentionActive =
    currentFilter === "needs_attention" || currentFilter === "low_confidence_match";
  const autoReadyActive = currentFilter === "auto_ready";
  const needsDispActive =
    currentFilter === "needs_review" || currentFilter === "needs_review_disposition";
  const missingImageActive = currentFilter === "missing_image";
  const missingImageFamilyActive = currentFilter === "missing_image_family";
  const familyConflictActive = currentFilter === "family_conflict";

  return (
    <div className="space-y-4">
      {familyGroupKey ? (
        <p className="text-xs rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-2 flex flex-wrap items-center gap-2">
          <strong>Family filter:</strong>
          <code className="text-[10px] max-w-[min(100%,420px)] truncate" title={familyGroupKey}>
            {familyGroupKey.slice(0, 64)}
            {familyGroupKey.length > 64 ? "…" : ""}
          </code>
          <Link href={clearFamilyFilterHref} className="text-primary hover:underline text-xs">
            Clear family filter
          </Link>
        </p>
      ) : null}
      {highConfActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/40 px-3 py-2">
          <strong>Confidence filter:</strong> only rows with match confidence ≥ {CONFIDENCE_THRESHOLD} are loaded. Paging applies
          within this subset. There is no text search on this screen (global search would require scanning the full batch).
        </p>
      )}
      {aiSuggestionsActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-violet-500/10 px-3 py-2">
          <strong>AI suggestions:</strong> pending rows where pass-2 AI proposed a master product. Use{" "}
          <em>Approve selected (AI)</em> to apply each row&apos;s suggested product.
        </p>
      )}
      {autoApprovableActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-emerald-500/10 px-3 py-2">
          <strong>Quick approve queue:</strong> pending rows with a rules match and confidence ≥ {CONFIDENCE_THRESHOLD}. Safe
          to bulk-approve to the linked master.
        </p>
      )}
      {unmatchedActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-amber-500/10 px-3 py-2">
          <strong>Unmatched:</strong> pending rows with no master product yet (pass-1 miss; may be in pass-2 AI queue).
        </p>
      )}
      {needsAttentionActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-amber-500/10 px-3 py-2">
          <strong>Needs attention:</strong> pending rows with a master link but match confidence below {CONFIDENCE_THRESHOLD}{" "}
          (or unset). Review before approve.
        </p>
      )}
      {autoReadyActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-emerald-500/15 px-3 py-2">
          <strong>Auto-ready:</strong> pipeline marked these as <code className="text-[10px]">auto_candidate</code> with a linked
          master. Use <em>Approve all auto-ready</em> for bulk approve.
        </p>
      )}
      {needsDispActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-amber-500/10 px-3 py-2">
          <strong>Needs review (disposition):</strong> pipeline set <code className="text-[10px]">needs_review</code> on these
          pending rows.
        </p>
      )}
      {missingImageActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-amber-500/10 px-3 py-2">
          <strong>Missing image:</strong> pending rows with <code className="text-[10px]">image_missing</code> after enrichment.
          Fix URLs or imagery before publish.
        </p>
      )}
      {missingImageFamilyActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-amber-500/15 px-3 py-2">
          <strong>Missing image (families):</strong> pending variant rows with <code className="text-[10px]">family_group_key</code>{" "}
          set and still <code className="text-[10px]">image_missing</code> — excludes singleton rows. One fix often covers all
          sizes in the family.
        </p>
      )}
      {familyConflictActive && (
        <p className="text-xs text-muted-foreground rounded-md border border-border bg-violet-500/10 px-3 py-2">
          <strong>Family conflicts:</strong> pending rows in variant families where masters or AI suggestions disagree. Align in
          the family panel, then clear this filter.
        </p>
      )}
      {aiJobMessage && (
        <p className="text-xs rounded-md border border-border bg-muted/40 px-3 py-2">{aiJobMessage}</p>
      )}
      {aiMatchPending > 0 && (
        <p className="text-xs text-muted-foreground">
          {aiMatchPending} row(s) queued for deferred AI matching. Run pass 2 in chunks (40 rows per click) to avoid timeouts.
        </p>
      )}

      <Card className="border-primary/20 bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Operator queues</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Target flow: Auto Ready → Approve All Auto-Ready → Missing Image → fix → Publish All Approved.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href={filterLink("auto_ready")}>
            <Button variant={currentFilter === "auto_ready" ? "default" : "outline"} size="sm">
              Auto Ready ({workflowSummary.auto_candidate})
            </Button>
          </Link>
          <Link href={filterLink("needs_review")}>
            <Button
              variant={needsDispActive ? "default" : "outline"}
              size="sm"
            >
              Needs Review ({workflowSummary.needs_review_disposition})
            </Button>
          </Link>
          <Link href={filterLink("missing_image")}>
            <Button variant={currentFilter === "missing_image" ? "default" : "outline"} size="sm">
              Missing Image ({workflowSummary.missing_image})
            </Button>
          </Link>
          <Link href={filterLink("missing_image_family")}>
            <Button variant={currentFilter === "missing_image_family" ? "default" : "outline"} size="sm">
              Missing (families) ({workflowSummary.missing_image_family})
            </Button>
          </Link>
          <Link href={filterLink("unmatched")}>
            <Button variant={currentFilter === "unmatched" ? "default" : "outline"} size="sm">
              Unmatched ({workflowSummary.unmatched})
            </Button>
          </Link>
          <Link href={filterLink("low_confidence_match")}>
            <Button variant={currentFilter === "low_confidence_match" ? "default" : "outline"} size="sm">
              Low Confidence ({workflowSummary.low_confidence_match})
            </Button>
          </Link>
          <Link href={filterLink("family_conflict")}>
            <Button variant={currentFilter === "family_conflict" ? "default" : "outline"} size="sm">
              Family Conflicts ({workflowSummary.family_conflict_rows})
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Bulk actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            disabled={!canApproveSelected || isPending}
            title={
              !selectionComplete
                ? "Load every selected row (or clear selection) to approve — selection spans pages without cached rows."
                : !selectedHasMatch
                  ? "Select at least one row with a match (master product) to approve to that product"
                  : undefined
            }
            onClick={() => {
              if (!firstMatchMasterId) return;
              runAction(
                () => bulkApproveStaged(Array.from(selectedIdsSet), firstMatchMasterId),
                (r) => setLastResult({ type: "approve", result: r }) as void
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
              runAction(() => bulkRejectStaged(Array.from(selectedIdsSet)), (r) =>
                setLastResult({ type: "reject", result: r })
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
              runAction(() => bulkMarkForReview(Array.from(selectedIdsSet)), (r) =>
                setLastResult({ type: "mark_review", result: r }) as void
              );
            }}
          >
            Mark selected for review
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canApproveAllAbove || isPending}
            onClick={() => {
              runAction(
                () => approveAllAboveConfidence(batchId, CONFIDENCE_THRESHOLD),
                (r) => setLastResult({ type: "approve_all", result: r })
              );
            }}
          >
            Approve all with confidence ≥ 0.85
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={workflowSummary.auto_candidate === 0 || isPending}
            title={
              workflowSummary.auto_candidate === 0
                ? "No pending auto_candidate rows with a master"
                : "Approve every pending row with ingestion_disposition auto_candidate and master_product_id"
            }
            onClick={() => {
              runAction(() => approveAllAutoReadyInBatch(batchId), (r) =>
                setLastResult({ type: "approve_all_auto", result: r })
              );
            }}
          >
            Approve All Auto-Ready ({workflowSummary.auto_candidate})
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={aiJobBusy || aiMatchPending === 0}
            title={aiMatchPending === 0 ? "No rows in AI queue" : "Run deferred AI matching for up to 40 queued rows"}
            onClick={() => void runAiMatchingChunk()}
          >
            {aiJobBusy ? "Running AI…" : "Run AI matching (40 rows)"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canApproveAiSuggestions || isPending}
            title={
              !selectionComplete
                ? "Selection incomplete — need a cached row per selected id"
                : !canApproveAiSuggestions
                  ? "Select only pending rows that have an AI suggestion (completed pass 2)"
                  : undefined
            }
            onClick={() => {
              runAction(
                () => bulkApproveAiSuggestions(Array.from(selectedIdsSet)),
                (r) => setLastResult({ type: "approve", result: r }) as void
              );
            }}
          >
            Approve selected (AI)
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={aiSuggestionsReady === 0 || isPending}
            onClick={() => {
              runAction(() => approveAllAiSuggestionsInBatch(batchId, 500), (r) =>
                setLastResult({ type: "approve_all", result: r })
              );
            }}
          >
            Approve all AI suggestions ({Math.min(500, aiSuggestionsReady)})
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!canPublishSelected || isPending}
            title={
              !selectionComplete
                ? "Incomplete selection cache — cannot verify every row"
                : selectedIdsSet.size > 0 && selectedApprovedOrMergedCount < selectedIdsSet.size
                  ? "Only approved/merged rows can be published"
                  : undefined
            }
            onClick={() => {
              runAction(
                () => bulkPublishStaged(Array.from(selectedIdsSet)),
                (r) =>
                  setLastResult({
                    type: "publish",
                    result: {
                      published: r.published,
                      succeeded: r.succeeded,
                      failed: r.failed,
                      publishErrors: r.publishErrors ?? [],
                    },
                  }) as void
              );
            }}
          >
            Publish selected approved
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!canPublishAll || isPending || publishBusy}
            title={
              workflowSummary.ready_to_publish === 0
                ? "Nothing left to sync (or no approved/merged rows)"
                : `${workflowSummary.ready_to_publish} approved/merged row(s) not yet storefront-synced`
            }
            onClick={() => runPublishAllApprovedWithProgress()}
          >
            Publish All Approved ({workflowSummary.ready_to_publish})
          </Button>
          {selectedIdsSet.size > 0 && (
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear selection ({selectedIdsSet.size}
              {!selectionComplete ? " · incomplete cache" : ""})
            </Button>
          )}
          {(isPending || publishBusy) && (
            <span className="text-xs text-muted-foreground">{publishBusy ? "Publishing…" : "Running…"}</span>
          )}
        </CardContent>
      </Card>
      {publishProgress && (
        <p className="text-xs rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-900 dark:text-sky-100">
          {publishProgress}
        </p>
      )}

      {/* Bulk merge normalized_data */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Bulk merge into staging (normalized_data)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Only filled fields are sent. Empty fields are left unchanged. Merging is idempotent for the same values.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="mergeTarget"
                  checked={mergeTarget === "selected"}
                  onChange={() => setMergeTarget("selected")}
                />
                Selected rows ({selectedIdsSet.size})
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="mergeTarget"
                  checked={mergeTarget === "all_pending"}
                  onChange={() => setMergeTarget("all_pending")}
                />
                All pending (cap)
              </label>
            </div>
            {mergeTarget === "all_pending" && (
              <div className="flex items-center gap-2">
                <Label htmlFor="mergeMax" className="text-xs whitespace-nowrap">
                  Max rows
                </Label>
                <Input
                  id="mergeMax"
                  type="number"
                  min={1}
                  max={5000}
                  className="w-24 h-8 text-sm"
                  value={mergeMaxRows}
                  onChange={(e) => setMergeMaxRows(parseInt(e.target.value, 10) || 2000)}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(
              [
                ["brand", "Brand"],
                ["uom", "UOM"],
                ["pack_size", "Pack size"],
                ["category_guess", "Category guess"],
                ["supplier_sku", "Supplier SKU"],
                ["canonical_title", "Title (canonical_title)"],
                ["short_description", "Short description"],
                ["long_description", "Long description"],
                ["image_url", "Image URL"],
                ["supplier_cost", "Supplier cost (number)"],
                ["lead_time_days", "Lead time days (integer)"],
                ["stock_status", "Stock status"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  className="h-8 text-sm"
                  defaultValue=""
                  onChange={(e) => {
                    (mergeFields.current as Record<string, string>)[key] = e.target.value;
                  }}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button size="sm" disabled={mergeBusy} onClick={() => void submitBulkMerge()}>
              {mergeBusy ? "Merging…" : "Apply merge"}
            </Button>
          </div>
          {mergeResult && (
            <div className="text-sm rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <p>
                Updated: <strong>{mergeResult.updated}</strong>, skipped: <strong>{mergeResult.skipped}</strong>
              </p>
              {mergeResult.errors.length > 0 && (
                <p className="text-destructive text-xs break-words">{mergeResult.errors.slice(0, 8).join(" · ")}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="border-primary/50">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium">Last action result</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {lastResult.type === "publish" && (
              <>
                <p>Published (live): {lastResult.result.published}</p>
                {lastResult.result.chunks != null && <p>Publish passes: {lastResult.result.chunks}</p>}
                <p>Failed this run: {lastResult.result.failed}</p>
                {lastResult.result.publishErrors.length > 0 && (
                  <p className="text-destructive">Errors: {lastResult.result.publishErrors.slice(0, 5).join("; ")}</p>
                )}
              </>
            )}
            {lastResult.type === "approve_all_auto" && (
              <>
                <p>Approved: {lastResult.result.approved}</p>
                <p>Skipped (stale / race): {lastResult.result.skipped}</p>
                <p>Blocked (preflight): {lastResult.result.blocked}</p>
                {lastResult.result.blockedSamples.length > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Blocked samples: {lastResult.result.blockedSamples.join(" · ")}
                  </p>
                )}
                {lastResult.result.errors.length > 0 && (
                  <p className="text-destructive">Errors: {lastResult.result.errors.slice(0, 8).join("; ")}</p>
                )}
              </>
            )}
            {(lastResult.type === "approve" ||
              lastResult.type === "reject" ||
              lastResult.type === "mark_review" ||
              lastResult.type === "approve_all") && (
              <>
                <p>Rows processed: {lastResult.result.succeeded + lastResult.result.failed}</p>
                <p>Succeeded: {lastResult.result.succeeded}</p>
                <p>Failed: {lastResult.result.failed}</p>
                {lastResult.result.errors.length > 0 && (
                  <p className="text-destructive">Errors: {lastResult.result.errors.slice(0, 5).join("; ")}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Rows</CardTitle>
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground mr-1">Filters:</span>
            <Link href={base}>
              <Button variant={currentFilter === "all" ? "secondary" : "ghost"} size="sm">
                All
              </Button>
            </Link>
            <Link href={filterLink("pending")}>
              <Button variant={currentFilter === "pending" ? "secondary" : "ghost"} size="sm">
                All pending
              </Button>
            </Link>
            <Link href={filterLink("auto_approvable")}>
              <Button variant={currentFilter === "auto_approvable" ? "secondary" : "ghost"} size="sm" title="Rules match, high confidence">
                Quick approve ({operatorQueues.auto_approvable})
              </Button>
            </Link>
            <Link href={filterLink("unmatched")}>
              <Button variant={currentFilter === "unmatched" ? "secondary" : "ghost"} size="sm">
                Unmatched ({operatorQueues.unmatched})
              </Button>
            </Link>
            <Link href={filterLink("low_confidence_match")}>
              <Button variant={currentFilter === "low_confidence_match" ? "secondary" : "ghost"} size="sm">
                Low conf. match ({workflowSummary.low_confidence_match})
              </Button>
            </Link>
            <Link href={filterLink("auto_ready")}>
              <Button variant={currentFilter === "auto_ready" ? "secondary" : "ghost"} size="sm" title="Pipeline auto_candidate + master">
                Auto-ready ({workflowSummary.auto_candidate})
              </Button>
            </Link>
            <Link href={filterLink("needs_review")}>
              <Button
                variant={
                  currentFilter === "needs_review" || currentFilter === "needs_review_disposition"
                    ? "secondary"
                    : "ghost"
                }
                size="sm"
              >
                Needs review ({workflowSummary.needs_review_disposition})
              </Button>
            </Link>
            <Link href={filterLink("missing_image")}>
              <Button variant={currentFilter === "missing_image" ? "secondary" : "ghost"} size="sm">
                Missing image ({workflowSummary.missing_image})
              </Button>
            </Link>
            <Link href={filterLink("missing_image_family")}>
              <Button variant={currentFilter === "missing_image_family" ? "secondary" : "ghost"} size="sm">
                Missing (families) ({workflowSummary.missing_image_family})
              </Button>
            </Link>
            <Link href={filterLink("family_conflict")}>
              <Button variant={currentFilter === "family_conflict" ? "secondary" : "ghost"} size="sm">
                Family conflicts ({workflowSummary.family_conflict_rows})
              </Button>
            </Link>
            <Link href={filterLink("approved")}>
              <Button variant={currentFilter === "approved" ? "secondary" : "ghost"} size="sm">
                Approved
              </Button>
            </Link>
            <Link href={filterLink("rejected")}>
              <Button variant={currentFilter === "rejected" ? "secondary" : "ghost"} size="sm">
                Rejected
              </Button>
            </Link>
            <Link href={filterLink("ai_suggestions")}>
              <Button variant={currentFilter === "ai_suggestions" ? "secondary" : "ghost"} size="sm">
                AI suggestions ready
              </Button>
            </Link>
            <Link href={confidenceLink("high")}>
              <Button variant={currentConfidence === "high" ? "secondary" : "ghost"} size="sm">
                Conf ≥ 0.85
              </Button>
            </Link>
            <Link href={`/dashboard/review?batch_id=${batchId}`}>
              <Button size="sm">Open in Review</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0 space-y-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/20 text-xs text-muted-foreground">
            <span>
              Showing {windowStart}–{windowEnd} of {total}
              {totalRowCount !== total && currentFilter !== "all" ? ` (filtered; ${totalRowCount} in batch)` : ""}
            </span>
            <div className="flex items-center gap-2">
              {loadState === "loading" && rows.length > 0 && (
                <span className="text-amber-600">Refreshing…</span>
              )}
              <span>Page size</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={offset <= 0 || loadState === "loading"}
                onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
              >
                Previous
              </Button>
              <span className="tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={offset + pageSize >= total || loadState === "loading"}
                onClick={() => setOffset((o) => o + pageSize)}
              >
                Next
              </Button>
            </div>
          </div>

          {loadState === "loading" && rows.length === 0 && (
            <div className="p-12 text-center text-sm text-muted-foreground">Loading rows…</div>
          )}
          {loadState === "error" && (
            <div className="p-8 text-center text-sm text-destructive">
              {loadError ?? "Failed to load"}
              <Button variant="link" className="ml-2 h-auto p-0" onClick={() => void loadRows()}>
                Retry
              </Button>
            </div>
          )}
          {!loadError && total === 0 && loadState !== "loading" && (
            <div className="p-8 text-center text-muted-foreground text-sm">No rows match the current filter.</div>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 z-10">
                  <tr className="border-b border-border">
                    <th className="w-10 p-2">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAllPage}
                        aria-label="Select all rows on this page"
                      />
                    </th>
                    <th className="text-left p-2 font-medium">SKU</th>
                    <th className="text-left p-2 font-medium">Title</th>
                    <th className="text-left p-2 font-medium w-[140px]">Image</th>
                    <th className="text-right p-2 font-medium">Conf.</th>
                    <th className="text-left p-2 font-medium w-[140px]" title="List* = manual list override (≥20% margin on landed)">
                      Import $
                    </th>
                    <th className="text-left p-2 font-medium">AI / suggest</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Family</th>
                    <th className="text-left p-2 font-medium">Match</th>
                    <th className="text-left p-2 font-medium">Warnings</th>
                    <th className="text-left p-2 font-medium">Publish</th>
                    <th className="text-left p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <BatchTableRow
                      key={s.id}
                      row={s}
                      selected={!!selectedById[s.id]}
                      onToggle={toggleRow}
                      reloadRows={reloadRows}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

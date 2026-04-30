"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MasterMatchPreview } from "./MasterMatchPreview";
import { ReviewActionModal } from "./ReviewActionModal";
import {
  overridePricing,
  assignCategory,
  markForReprocessing,
  getAttributeRequirementsForStaged,
  approveResolutionCandidateAction,
  rejectResolutionCandidateAction,
  publishStagedToLive,
  updateNormalizedAttributes,
  updateStagedVariantFields,
  updateSupplierOfferAdmin,
  unpublishLiveProduct,
  publishVariantGroupForNormalized,
} from "@/app/actions/review";
import { isMultiSelectAttribute } from "@/lib/catalogos/attribute-validation";
import { SearchPublishStatusBadge } from "@/components/review/SearchPublishStatusBadge";
import type { PublishReadiness } from "@/lib/review/publish-guards";
import { deriveReviewDecisionStep } from "@/lib/review/review-decision-step";
import { classifyPublishErrorMessage, publishFailureStageTitle } from "@/lib/publish/publish-result-stage";
import {
  buildStagedProductReviewEvidence,
  formatConfidencePct,
  getPackagingMathReview,
  getStagingSizeDisplay,
  getVariantSkuDisplay,
  summarizeEvidenceReview,
  type StagedReviewSourceHint,
} from "@/lib/review/staging-review-evidence";

function StagedReviewMatchPrimaryActions({
  setActionModal,
}: {
  setActionModal: (a: "approve" | "reject" | "create_master" | "merge") => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button size="sm" variant="success" onClick={() => setActionModal("approve")}>
        Approve match
      </Button>
      <Button size="sm" variant="outline" onClick={() => setActionModal("create_master")}>
        Create new master
      </Button>
      <Button size="sm" variant="outline" onClick={() => setActionModal("merge")}>
        Merge with…
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setActionModal("reject")}>
        Reject
      </Button>
    </div>
  );
}

function StagedReviewPublishPrimaryActions({
  normalizedId,
  detail,
  publishBusy,
  setPublishBusy,
  setPublishMessage,
  tier1PublishAllowed,
  refreshDetail,
  router,
}: {
  normalizedId: string | null;
  detail: Record<string, unknown>;
  publishBusy: boolean;
  setPublishBusy: (v: boolean) => void;
  setPublishMessage: (v: string | null) => void;
  tier1PublishAllowed: boolean;
  refreshDetail: () => Promise<void>;
  router: { refresh: () => void };
}) {
  const familyKey = detail.family_group_key;
  const masterProductId = detail.master_product_id as string | undefined;
  const updatedAt = (detail.updated_at as string) ?? null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button
        size="sm"
        disabled={publishBusy || !normalizedId || !tier1PublishAllowed}
        onClick={async () => {
          if (!normalizedId) return;
          setPublishBusy(true);
          setPublishMessage(null);
          const r = await publishStagedToLive(normalizedId, {
            publishedBy: "admin",
            expectedUpdatedAt: updatedAt,
          });
          setPublishBusy(false);
          if (!r.published) {
            const err = r.publishError ?? r.error ?? "Publish failed";
            const stage = classifyPublishErrorMessage(err);
            setPublishMessage(`Publish failed at step: ${publishFailureStageTitle(stage)}. ${err}`.trim());
          } else {
            const fullySynced = r.publishComplete !== false && r.searchPublishStatus === "published_synced";
            setPublishMessage(
              fullySynced
                ? "Published and fully synced."
                : `Publish succeeded for live catalog, but storefront search is not fully synced (status: ${String(r.searchPublishStatus ?? "unknown")}). Confirm the row badge; retry publish if needed.`
            );
            await refreshDetail();
            router.refresh();
          }
        }}
      >
        {publishBusy ? "Publishing…" : "Publish / sync to live"}
      </Button>
      {familyKey ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={publishBusy || !normalizedId || !tier1PublishAllowed}
          onClick={async () => {
            if (!normalizedId) return;
            setPublishBusy(true);
            setPublishMessage(null);
            const r = await publishVariantGroupForNormalized(normalizedId, { publishedBy: "admin" });
            setPublishBusy(false);
            if (!r.success) {
              const err = r.publishError ?? r.errors[0] ?? "Variant group publish failed";
              const stage = classifyPublishErrorMessage(err);
              setPublishMessage(`Variant group publish failed at step: ${publishFailureStageTitle(stage)}. ${err}`.trim());
            } else {
              setPublishMessage(
                "Variant family publish succeeded. Verify each variant in the catalog and storefront search."
              );
              await refreshDetail();
              router.refresh();
            }
          }}
        >
          Publish variant family
        </Button>
      ) : null}
      {masterProductId ? (
        <Button
          size="sm"
          variant="outline"
          className="text-amber-600 border-amber-600/50"
          disabled={publishBusy}
          onClick={async () => {
            if (!window.confirm("Deactivate this live product and all supplier offers for it?")) return;
            setPublishBusy(true);
            const r = await unpublishLiveProduct(masterProductId, { normalizedId: normalizedId ?? undefined, reason: "admin_unpublish" });
            setPublishBusy(false);
            if (!r.success) setPublishMessage(r.error ?? "Unpublish failed");
            else {
              await refreshDetail();
              router.refresh();
            }
          }}
        >
          Unpublish live
        </Button>
      ) : null}
    </div>
  );
}

function ReviewSourceHintBlock({ hint, subLabel }: { hint: StagedReviewSourceHint; subLabel?: string }) {
  const meta = [hint.confidence != null ? `conf ${formatConfidencePct(hint.confidence)}` : null, hint.method]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="space-y-0.5">
      {subLabel ? <p className="text-[10px] uppercase tracking-wide text-muted-foreground/90">{subLabel}</p> : null}
      <p className="break-all text-foreground/90">{hint.rawDisplay}</p>
      {meta ? <p className="text-[10px] text-muted-foreground">{meta}</p> : null}
    </div>
  );
}

function OfferEditRow({
  offer,
  normalizedId,
  disabled,
  onSaved,
  onError,
}: {
  offer: {
    id: string;
    supplier_sku: string;
    cost: number;
    sell_price?: number | null;
    lead_time_days?: number | null;
    is_active: boolean;
  };
  normalizedId: string | null;
  disabled: boolean;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [cost, setCost] = useState(String(offer.cost));
  const [sell, setSell] = useState(offer.sell_price != null ? String(offer.sell_price) : "");
  const [lead, setLead] = useState(offer.lead_time_days != null ? String(offer.lead_time_days) : "");
  const [active, setActive] = useState(offer.is_active);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCost(String(offer.cost));
    setSell(offer.sell_price != null ? String(offer.sell_price) : "");
    setLead(offer.lead_time_days != null ? String(offer.lead_time_days) : "");
    setActive(offer.is_active);
  }, [offer]);

  return (
    <div className="border border-border rounded-md p-2 space-y-2 bg-background/50">
      <p className="text-xs font-mono text-foreground">{offer.supplier_sku}</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] text-muted-foreground block">Cost</label>
          <Input className="h-8 w-24 text-sm" type="number" step="0.0001" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block">Sell</label>
          <Input className="h-8 w-24 text-sm" type="number" step="0.01" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="—" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block">Lead days</label>
          <Input className="h-8 w-20 text-sm" type="number" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="—" />
        </div>
        <label className="flex items-center gap-1.5 text-xs pb-1">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded border-border" />
          Active
        </label>
        <Button
          size="sm"
          disabled={disabled || busy}
          onClick={async () => {
            setBusy(true);
            const c = parseFloat(cost);
            const s = sell.trim() === "" ? null : parseFloat(sell);
            const l = lead.trim() === "" ? null : parseInt(lead, 10);
            const r = await updateSupplierOfferAdmin(
              offer.id,
              {
                cost: Number.isFinite(c) ? c : offer.cost,
                sell_price: s != null && Number.isFinite(s) ? s : sell.trim() === "" ? null : undefined,
                lead_time_days: l != null && Number.isFinite(l) ? l : lead.trim() === "" ? null : undefined,
                is_active: active,
              },
              { normalizedId: normalizedId ?? undefined }
            );
            setBusy(false);
            if (!r.success) onError(r.error ?? "Offer update failed");
            else await onSaved();
          }}
        >
          {busy ? "…" : "Save offer"}
        </Button>
      </div>
    </div>
  );
}

interface StagedProductDetailProps {
  normalizedId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { id: string; slug: string; name: string }[];
}

export function StagedProductDetail({ normalizedId, open, onOpenChange, categories }: StagedProductDetailProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionModal, setActionModal] = useState<"approve" | "reject" | "create_master" | "merge" | null>(null);
  const [overridePrice, setOverridePrice] = useState("");
  const [assignCategoryId, setAssignCategoryId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [reqState, setReqState] = useState<{
    required: string[];
    stronglyPreferred: string[];
    allowedByKey: Record<string, string[]>;
  }>({ required: [], stronglyPreferred: [], allowedByKey: {} });
  const [resolutionBusy, setResolutionBusy] = useState(false);
  const [attrDraft, setAttrDraft] = useState<Record<string, string>>({});
  const [publishBusy, setPublishBusy] = useState(false);
  const [unimplementedCategoryAck, setUnimplementedCategoryAck] = useState(false);
  const [variantBusy, setVariantBusy] = useState(false);
  const [variantBaseSku, setVariantBaseSku] = useState("");
  const [variantSize, setVariantSize] = useState("");
  const [variantFamilyKey, setVariantFamilyKey] = useState("");
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  async function refreshDetail() {
    if (!normalizedId) return;
    const d = await fetch(`/api/review/staging/${normalizedId}`).then((r) => r.json());
    setDetail(d);
  }

  useEffect(() => {
    if (!normalizedId || !open) {
      setDetail(null);
      setReqState({ required: [], stronglyPreferred: [], allowedByKey: {} });
      setAttrDraft({});
      setPublishMessage(null);
      return;
    }
    setLoading(true);
    setUnimplementedCategoryAck(false);
    Promise.all([
      fetch(`/api/review/staging/${normalizedId}`).then((r) => r.json()),
      getAttributeRequirementsForStaged(normalizedId),
    ])
      .then(([d, req]) => {
        setDetail(d);
        if (req.success && req.required && req.stronglyPreferred) {
          setReqState({
            required: req.required,
            stronglyPreferred: req.stronglyPreferred,
            allowedByKey: req.allowedByKey ?? {},
          });
        }
        const attrs = (d.attributes as Record<string, unknown>) ?? {};
        const draft: Record<string, string> = {};
        for (const [k, v] of Object.entries(attrs)) {
          draft[k] = Array.isArray(v) ? (v as string[]).join(", ") : String(v ?? "");
        }
        setAttrDraft(draft);
        setVariantBaseSku(String(d.inferred_base_sku ?? ""));
        setVariantSize(String(d.inferred_size ?? ""));
        setVariantFamilyKey(String(d.family_group_key ?? ""));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [normalizedId, open]);

  function parseAttrValue(key: string, raw: string): unknown {
    const t = raw.trim();
    if (!t) return "";
    if (isMultiSelectAttribute(key)) return t.split(/,\s*/).filter(Boolean);
    return t;
  }

  const attributeEditorKeys = (() => {
    const s = new Set<string>();
    reqState.required.forEach((k) => s.add(k));
    reqState.stronglyPreferred.forEach((k) => s.add(k));
    Object.keys(reqState.allowedByKey).forEach((k) => s.add(k));
    Object.keys(attrDraft).forEach((k) => s.add(k));
    return Array.from(s).sort();
  })();

  const nd = (detail?.normalized_data as Record<string, unknown>) ?? {};
  const raw = (detail?.raw as { raw_payload?: Record<string, unknown> })?.raw_payload ?? {};
  const evidenceRows = useMemo(() => {
    if (!detail) return [];
    const n = (detail.normalized_data as Record<string, unknown>) ?? {};
    const ra = (detail.raw as { raw_payload?: Record<string, unknown> })?.raw_payload ?? {};
    return buildStagedProductReviewEvidence(n, (detail.attributes as Record<string, unknown>) ?? {}, ra);
  }, [detail]);
  const evidenceSummary = useMemo(() => summarizeEvidenceReview(evidenceRows), [evidenceRows]);
  const packagingReview = useMemo(() => getPackagingMathReview(nd), [nd]);
  const master = detail?.master_product as { sku?: string; name?: string } | undefined;
  const supplier = detail?.supplier as { name?: string } | undefined;
  const anomalyFlags = (nd.anomaly_flags as { code: string; message: string; severity: string }[]) ?? [];

  const resolutionCandidates = (detail?.resolution_candidates ?? []) as Array<{
    id: string;
    match_type: string;
    confidence: number;
    reasons_json: string[];
    status: string;
  }>;
  const bestResolution = resolutionCandidates.find((c) => c.status === "pending") ?? resolutionCandidates[0];
  const resolutionPending = bestResolution?.status === "pending";
  const reviewDecision = useMemo(() => {
    if (!detail) return null;
    return deriveReviewDecisionStep({
      masterProductId: detail.master_product_id,
      resolutionPending,
      publishReadiness: detail.publish_readiness as PublishReadiness | undefined,
    });
  }, [detail, resolutionPending]);

  const publishReadiness = detail ? (detail.publish_readiness as PublishReadiness | undefined) : undefined;

  const tier1PublishAllowed =
    publishReadiness?.canPublish === true &&
    (publishReadiness.categoryRequirementsEnforced !== false || unimplementedCategoryAck);
  const adminAudit = (detail?.admin_audit ?? []) as Array<{
    id: string;
    action: string;
    actor?: string;
    details: Record<string, unknown>;
    created_at: string;
  }>;
  const supplierOffers = (detail?.supplier_offers ?? []) as Array<{
    id: string;
    supplier_sku: string;
    cost: number;
    sell_price?: number | null;
    lead_time_days?: number | null;
    is_active: boolean;
  }>;

  function getResolutionSourceLabel(reason: string | undefined): string {
    if (!reason) return "Needs manual review";
    if (reason === "prior_admin_decision") return "Resolved by prior decision";
    if (reason === "exact_supplier_offer") return "Resolved by exact supplier offer";
    if (reason === "exact_variant_sku") return "Resolved by exact variant SKU";
    if (reason === "sku_pattern_family_and_size" || reason === "sku_pattern_family") return "Resolved by SKU pattern memory";
    if (reason === "similarity_brand_title_attributes") return "Manual similarity";
    return "Needs manual review";
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-semibold">Staged product</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : !detail ? (
              <p className="text-muted-foreground text-sm">Failed to load.</p>
            ) : (
              <div className="space-y-5">
                {String(detail.family_group_key ?? "").trim() !== "" ? (
                  <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Staging family</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Import / staging grouping only — not live storefront variants.
                    </p>
                    {(() => {
                      const attrsTop = (detail.attributes as Record<string, unknown>) ?? {};
                      const variantSkuStrip = getVariantSkuDisplay(nd, attrsTop);
                      const sizeStrip = getStagingSizeDisplay(detail.inferred_size, attrsTop);
                      const gc = detail.grouping_confidence;
                      const gcNum = typeof gc === "number" && Number.isFinite(gc) ? gc : null;
                      const parts: string[] = [];
                      if (sizeStrip === "—") parts.push("Size missing");
                      if (variantSkuStrip === "—") parts.push("Variant SKU missing");
                      if (gcNum !== null && gcNum < 0.6) parts.push("Low grouping confidence");
                      const statusLine =
                        parts.length > 0 ? parts.join(" · ") : "Staging identifiers present";
                      return (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            <span>
                              <span className="text-muted-foreground text-xs">Size: </span>
                              {sizeStrip}
                            </span>
                            <span>
                              <span className="text-muted-foreground text-xs">Variant SKU: </span>
                              <span className="font-mono">{variantSkuStrip}</span>
                            </span>
                            <span>
                              <span className="text-muted-foreground text-xs">Status: </span>
                              {statusLine}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono truncate" title={String(detail.family_group_key)}>
                            Key: {String(detail.family_group_key)}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
                {reviewDecision ? (
                  <div className="rounded-md border border-primary/25 bg-muted/30 p-3 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Review flow</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div
                        className={cn(
                          "flex items-center gap-1.5 rounded px-2 py-1",
                          reviewDecision.currentStep === 1 ? "bg-background font-medium text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {reviewDecision.step1Complete ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                        ) : (
                          <span
                            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/50 text-[9px]"
                            aria-hidden
                          >
                            1
                          </span>
                        )}
                        <span>Resolve match</span>
                      </div>
                      <span className="text-muted-foreground" aria-hidden>
                        →
                      </span>
                      <div
                        className={cn(
                          "flex items-center gap-1.5 rounded px-2 py-1",
                          reviewDecision.currentStep === 2 ? "bg-background font-medium text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {reviewDecision.currentStep === 2 && reviewDecision.publishTone === "ready" ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                        ) : (
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px]",
                              reviewDecision.currentStep === 2 && reviewDecision.publishTone !== "ready"
                                ? "border-amber-500/60 text-amber-600 dark:text-amber-400"
                                : "border-muted-foreground/50"
                            )}
                            aria-hidden
                          >
                            2
                          </span>
                        )}
                        <span>Publish to live</span>
                      </div>
                    </div>
                    <p
                      className={cn(
                        "text-sm",
                        reviewDecision.currentStep === 2 &&
                          reviewDecision.publishTone === "blocked" &&
                          "text-amber-600 dark:text-amber-400",
                        reviewDecision.currentStep === 2 &&
                          reviewDecision.publishTone === "warning" &&
                          "text-amber-600 dark:text-amber-400",
                        reviewDecision.currentStep === 2 &&
                          reviewDecision.publishTone === "ready" &&
                          "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {reviewDecision.headline}
                    </p>
                    {reviewDecision.currentStep === 1 ? (
                      <StagedReviewMatchPrimaryActions setActionModal={setActionModal} />
                    ) : (
                      <StagedReviewPublishPrimaryActions
                        normalizedId={normalizedId}
                        detail={detail as Record<string, unknown>}
                        publishBusy={publishBusy}
                        setPublishBusy={setPublishBusy}
                        setPublishMessage={setPublishMessage}
                        tier1PublishAllowed={tier1PublishAllowed}
                        refreshDetail={refreshDetail}
                        router={router}
                      />
                    )}
                  </div>
                ) : null}
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Supplier</p>
                  <p className="font-medium">{supplier?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Supplier SKU</p>
                  <p className="font-mono text-sm">{String(nd.sku ?? raw.sku ?? "—")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Raw title</p>
                  <p className="text-sm text-muted-foreground">{String(raw.name ?? raw.title ?? raw.product_name ?? "—")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Normalized name</p>
                  <p className="font-medium">{String(nd.name ?? "—")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Catalog image</p>
                  {(() => {
                    const own = nd.image_ownership_status as "owned" | "failed" | "missing" | undefined;
                    const pub =
                      typeof nd.catalog_image_public_url === "string" ? nd.catalog_image_public_url.trim() : "";
                    const hot =
                      typeof nd.image_url === "string"
                        ? nd.image_url.trim()
                        : typeof nd.supplier_image_hotlink_url === "string"
                          ? String(nd.supplier_image_hotlink_url).trim()
                          : "";
                    const src = pub || hot;
                    const err =
                      typeof nd.image_ownership_error === "string" && nd.image_ownership_error.trim()
                        ? nd.image_ownership_error.trim()
                        : "";
                    return (
                      <div className="space-y-1.5">
                        {src ? (
                          <img
                            src={src}
                            alt=""
                            className="max-h-28 max-w-full object-contain rounded border border-border bg-white p-1"
                            loading="lazy"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                        {own === "owned" ? (
                          <Badge variant="success">Owned</Badge>
                        ) : own === "failed" ? (
                          <Badge variant="destructive">Failed</Badge>
                        ) : own === "missing" ? (
                          <Badge variant="warning">Missing</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Ownership not run yet</span>
                        )}
                        {err ? <p className="text-xs text-red-400">{err}</p> : null}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Extracted attributes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.attributes != null &&
                    typeof detail.attributes === "object" &&
                    Object.keys(detail.attributes as object).length > 0
                      ? Object.entries(detail.attributes as Record<string, unknown>).map(([k, v]) => {
                          const isRequired = reqState.required.includes(k);
                          const isPreferred = reqState.stronglyPreferred.includes(k);
                          const val = Array.isArray(v) ? (v as string[]).join(", ") : String(v ?? "");
                          return (
                            <span key={k} className="inline-flex items-center gap-1">
                              <Badge variant="secondary">{k}: {val}</Badge>
                              {isRequired && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
                              {!isRequired && isPreferred && <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500">Preferred</Badge>}
                            </span>
                          );
                        })
                      : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Normalization & import evidence</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Staged values are dictionary-normalized. Norm. confidence comes from <span className="font-mono">confidence_by_key</span> when
                    present. URL/OpenClaw hints are read-only and never replace normalized confidence.
                  </p>
                  {evidenceSummary.total > 0 ? (
                    <p className="text-xs font-medium text-foreground mb-2">
                      {evidenceSummary.total} fields reviewed · {evidenceSummary.lowConfidenceCount} low confidence
                    </p>
                  ) : null}
                  <div className="rounded-md border border-border overflow-hidden text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-muted/40 text-left border-b border-border">
                          <th className="p-2 font-medium w-[26%]">Field</th>
                          <th className="p-2 font-medium">Staged value</th>
                          <th className="p-2 font-medium whitespace-nowrap w-[14%]">Norm. conf.</th>
                          <th className="p-2 font-medium w-[34%]">Import / URL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evidenceRows.map((row) => (
                          <tr key={row.id} className="border-b border-border/60 last:border-0 align-top">
                            <td className="p-2 text-muted-foreground">{row.label}</td>
                            <td className="p-2 font-mono break-all">{row.normalizedDisplay}</td>
                            <td className="p-2 whitespace-nowrap">{formatConfidencePct(row.normalizedConfidence)}</td>
                            <td className="p-2 text-muted-foreground">
                              {!row.sourceHint && !row.ontologyHint ? (
                                <span className="text-muted-foreground/70">—</span>
                              ) : (
                                <div className="space-y-2">
                                  {row.sourceHint ? <ReviewSourceHintBlock hint={row.sourceHint} subLabel="Raw / crawl" /> : null}
                                  {row.ontologyHint ? <ReviewSourceHintBlock hint={row.ontologyHint} subLabel="Ontology pass" /> : null}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {Array.isArray(nd.spec_sheet_urls) && (nd.spec_sheet_urls as string[]).length > 0 ? (
                      <div className="border-t border-border px-2 py-2 bg-muted/20">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                          Linked specs / SDS / PDFs
                        </p>
                        <ul className="space-y-1 list-none m-0 p-0">
                          {(nd.spec_sheet_urls as string[]).map((href) => (
                            <li key={href}>
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-400 hover:underline break-all text-xs font-mono"
                              >
                                {href}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "mt-2 rounded-md border px-2 py-2 text-xs",
                      packagingReview.state === "mismatch" && "border-amber-500/50 bg-amber-500/5",
                      packagingReview.state === "incomplete" && "border-amber-500/40 bg-amber-500/5",
                      packagingReview.state === "matches" && "border-border/60 bg-muted/10"
                    )}
                  >
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Packaging check</p>
                    <p className="font-mono text-xs text-foreground">
                      <span className="text-muted-foreground">Computed: </span>
                      {packagingReview.boxes ?? "—"} × {packagingReview.glovesPerBox ?? "—"} ={" "}
                      {packagingReview.computedTotal ?? "—"}
                      <span className="text-muted-foreground"> · Staged total gloves/case: </span>
                      {packagingReview.declaredTotal ?? "—"}
                    </p>
                    {packagingReview.state === "mismatch" ? (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                        Staged total does not equal boxes × gloves per box.
                      </p>
                    ) : packagingReview.state === "incomplete" ? (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                        Cannot verify — need valid boxes per case and gloves per box to match staged total.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pricing: supplier price → conversion → case cost → sell price</p>
                  {nd.pricing && typeof nd.pricing === "object" ? (
                    <div className="text-sm space-y-1.5">
                      <p>
                        <span className="text-muted-foreground">Supplier price: </span>
                        {(nd.pricing as { supplier_price_amount?: number }).supplier_price_amount != null
                          ? `$${Number((nd.pricing as { supplier_price_amount: number }).supplier_price_amount).toFixed(2)}/${(nd.pricing as { supplier_price_basis?: string }).supplier_price_basis ?? "unit"}`
                          : "—"}
                      </p>
                      {(nd.pricing as { conversion_formula?: string }).conversion_formula && (
                        <p className="text-muted-foreground font-mono text-xs">Conversion: {(nd.pricing as { conversion_formula: string }).conversion_formula}</p>
                      )}
                      <p>
                        <span className="text-muted-foreground">Case cost: </span>
                        {(nd.normalized_case_cost ?? (nd.pricing as { normalized_case_cost?: number }).normalized_case_cost) != null
                          ? `$${Number(nd.normalized_case_cost ?? (nd.pricing as { normalized_case_cost: number }).normalized_case_cost).toFixed(2)}/case`
                          : "— (cannot compute)"}
                        {(nd.pricing as { pricing_confidence?: number }).pricing_confidence != null && (
                          <span className="text-muted-foreground"> · Confidence: {((nd.pricing as { pricing_confidence: number }).pricing_confidence * 100).toFixed(0)}%</span>
                        )}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Sell price: </span>
                        {nd.override_sell_price != null && Number.isFinite(Number(nd.override_sell_price))
                          ? `$${Number(nd.override_sell_price).toFixed(2)} (override)`
                          : nd.cost != null
                            ? `$${Number(nd.cost).toFixed(2)}/case (from case cost + markup)`
                            : "—"}
                      </p>
                      {Array.isArray((nd.pricing as { pricing_notes?: string[] }).pricing_notes) && (nd.pricing as { pricing_notes: string[] }).pricing_notes.length > 0 && (
                        <p className="text-xs text-muted-foreground">Notes: {(nd.pricing as { pricing_notes: string[] }).pricing_notes.join(" ")}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm">
                      Cost: {nd.cost != null ? `$${Number(nd.cost).toFixed(2)}` : "—"}
                      {detail.match_confidence != null && ` · Match confidence: ${(Number(detail.match_confidence) * 100).toFixed(0)}%`}
                    </p>
                  )}
                  {detail.match_confidence != null && nd.pricing != null && typeof nd.pricing === "object" ? (
                    <p className="text-xs text-muted-foreground">Match confidence: {(Number(detail.match_confidence) * 100).toFixed(0)}%</p>
                  ) : null}
                </div>
                <div className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Publish to live</p>
                  <p className="text-xs text-muted-foreground">Status: <span className="text-foreground font-medium">{String(detail.status)}</span></p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Storefront search:</span>
                    <SearchPublishStatusBadge status={detail.search_publish_status as string | null | undefined} />
                    {!detail.search_publish_status || detail.search_publish_status === "staged" ? (
                      <span className="text-xs text-muted-foreground">Not yet in storefront sync pipeline</span>
                    ) : null}
                  </div>
                  {publishReadiness?.canPublish ? (
                    <div className="space-y-1">
                      <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Tier 1: Ready for publish attempt</p>
                      <p className="text-xs text-muted-foreground">
                        Passes evaluatePublishReadiness and publish_safe only. This is not a guarantee that publish will finish — the
                        server still runs attribute sync, JSON snapshot, supplier offer, commerce bridge, and storefront search.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm text-amber-600 dark:text-amber-400">
                      <p className="font-medium text-foreground">Preflight blocked — fix the sections below</p>
                      {publishReadiness?.blockerSections?.workflow?.length ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Workflow</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {publishReadiness.blockerSections.workflow.map((b, i) => (
                              <li key={`w-${i}`}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {publishReadiness?.blockerSections?.staging_validation?.length ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Staging / validation</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {publishReadiness.blockerSections.staging_validation.map((b, i) => (
                              <li key={`s-${i}`}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {publishReadiness?.blockerSections?.missing_required_attributes?.length ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Missing required attributes (publish_safe)</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {publishReadiness.blockerSections.missing_required_attributes.map((b, i) => (
                              <li key={`m-${i}`}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {publishReadiness?.blockerSections?.case_pricing?.length ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Case pricing</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {publishReadiness.blockerSections.case_pricing.map((b, i) => (
                              <li key={`c-${i}`}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(() => {
                        const bs = publishReadiness?.blockerSections;
                        const hasSections =
                          !!bs &&
                          (bs.workflow.length > 0 ||
                            bs.staging_validation.length > 0 ||
                            bs.missing_required_attributes.length > 0 ||
                            bs.case_pricing.length > 0);
                        if (hasSections) return null;
                        const bl = publishReadiness?.blockers ?? [];
                        if (bl.length === 0) return <p className="text-xs text-muted-foreground">Loading preflight…</p>;
                        return (
                          <ul className="list-disc pl-4 space-y-0.5">
                            {bl.map((b, i) => (
                              <li key={`fb-${i}`}>{b}</li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                  )}
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
                    <p className="text-xs font-semibold text-foreground">Sync / snapshot (after publish click)</p>
                    <p className="text-xs text-muted-foreground">
                      Preflight cannot detect DB or downstream failures. Failures surface as publish errors with a failure stage label.
                    </p>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      {(publishReadiness?.postClickPipelineNotes ?? []).map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                  {detail.family_group_key ? (
                    <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2 space-y-1">
                      <p className="text-xs font-semibold text-foreground">Variant group</p>
                      <p className="text-xs text-muted-foreground">
                        Variants are not individually validated for required attributes in the variant publish path (publish_safe runs on
                        the first row only). Some variants may publish with incomplete merchandising if per-row attributes differ.
                      </p>
                    </div>
                  ) : null}
                  {publishReadiness?.canPublish && publishReadiness.categoryRequirementsEnforced === false ? (
                    <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-border"
                        checked={unimplementedCategoryAck}
                        onChange={(e) => setUnimplementedCategoryAck(e.target.checked)}
                      />
                      <span>
                        I understand no category-specific required attribute keys are enforced for &quot;{publishReadiness.categorySlug}
                        &quot; before publish.
                      </span>
                    </label>
                  ) : null}
                  {publishReadiness?.warnings?.length ? (
                    <ul className="text-xs text-muted-foreground list-disc pl-4">
                      {publishReadiness.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  {publishMessage && (
                    <p
                      className={
                        publishMessage.includes("Published and fully synced") ||
                        publishMessage.includes("Publish succeeded for live catalog") ||
                        publishMessage.includes("Variant family publish succeeded")
                          ? "text-sm text-emerald-600 dark:text-emerald-400"
                          : "text-sm text-red-400"
                      }
                    >
                      {publishMessage}
                    </p>
                  )}
                  {reviewDecision?.currentStep === 1 ? (
                    <p className="text-[10px] text-muted-foreground">
                      Publish actions move to Review flow after match is resolved (step 2).
                    </p>
                  ) : null}
                </div>
                <div className="rounded-md border border-border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Edit filter attributes</p>
                  <p className="text-xs text-muted-foreground">Values are validated against the category dictionary. Multi-value keys: comma-separated.</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {attributeEditorKeys.map((key) => {
                      const allowed = reqState.allowedByKey[key];
                      const val = attrDraft[key] ?? "";
                      return (
                        <div key={key} className="flex flex-col gap-0.5">
                          <label className="text-xs text-muted-foreground">{key}</label>
                          {allowed && allowed.length > 0 ? (
                            <select
                              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                              value={val}
                              onChange={(e) => setAttrDraft((d) => ({ ...d, [key]: e.target.value }))}
                            >
                              <option value="">(empty)</option>
                              {allowed.map((a) => (
                                <option key={a} value={a}>{a}</option>
                              ))}
                              {val && !allowed.includes(val) ? (
                                <option value={val}>{val} (current)</option>
                              ) : null}
                            </select>
                          ) : (
                            <Input
                              className="h-8 text-sm"
                              value={val}
                              onChange={(e) => setAttrDraft((d) => ({ ...d, [key]: e.target.value }))}
                              placeholder={isMultiSelectAttribute(key) ? "a, b, c" : ""}
                            />
                          )}
                        </div>
                      );
                    })}
                    {attributeEditorKeys.length === 0 && <p className="text-sm text-muted-foreground">No keys yet — assign a category or approve a match.</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={actionBusy || !normalizedId}
                    onClick={async () => {
                      if (!normalizedId) return;
                      setActionBusy(true);
                      const payload: Record<string, unknown> = {};
                      for (const k of attributeEditorKeys) {
                        payload[k] = parseAttrValue(k, attrDraft[k] ?? "");
                      }
                      const r = await updateNormalizedAttributes(normalizedId, payload);
                      setActionBusy(false);
                      if (!r.success) setPublishMessage(r.error ?? "Save failed");
                      else {
                        setPublishMessage(null);
                        await refreshDetail();
                        router.refresh();
                      }
                    }}
                  >
                    Save attributes
                  </Button>
                </div>
                <div className="rounded-md border border-border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Variant grouping (staging)</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-0.5">Inferred base SKU</label>
                      <Input className="h-8 text-sm font-mono" value={variantBaseSku} onChange={(e) => setVariantBaseSku(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-0.5">Inferred size</label>
                      <Input className="h-8 text-sm" value={variantSize} onChange={(e) => setVariantSize(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-0.5">Family group key</label>
                    <Input className="h-8 text-sm font-mono" value={variantFamilyKey} onChange={(e) => setVariantFamilyKey(e.target.value)} />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={variantBusy || !normalizedId}
                    onClick={async () => {
                      if (!normalizedId) return;
                      setVariantBusy(true);
                      const r = await updateStagedVariantFields(normalizedId, {
                        inferred_base_sku: variantBaseSku.trim() || null,
                        inferred_size: variantSize.trim() || null,
                        family_group_key: variantFamilyKey.trim() || null,
                      });
                      setVariantBusy(false);
                      if (!r.success) setPublishMessage(r.error ?? "Update failed");
                      else {
                        await refreshDetail();
                        router.refresh();
                      }
                    }}
                  >
                    Save variant fields
                  </Button>
                </div>
                {supplierOffers.length > 0 && (
                  <div className="rounded-md border border-border p-3 space-y-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Supplier offers (live)</p>
                    {supplierOffers.map((o) => (
                      <OfferEditRow
                        key={o.id}
                        offer={o}
                        normalizedId={normalizedId}
                        disabled={publishBusy}
                        onSaved={async () => {
                          await refreshDetail();
                          router.refresh();
                        }}
                        onError={(msg) => setPublishMessage(msg)}
                      />
                    ))}
                  </div>
                )}
                {adminAudit.length > 0 && (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Admin audit</p>
                    <ul className="text-xs space-y-2 max-h-40 overflow-y-auto border-t border-border pt-2">
                      {adminAudit.map((a) => (
                        <li key={a.id} className="border-b border-border/60 pb-2 last:border-0">
                          <span className="font-medium text-foreground">{a.action}</span>
                          <span className="text-muted-foreground"> · {new Date(a.created_at).toLocaleString()}</span>
                          {Object.keys(a.details ?? {}).length > 0 && (
                            <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap break-all font-mono">
                              {JSON.stringify(a.details, null, 0)}
                            </pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {master && (
                  <MasterMatchPreview masterProductId={detail.master_product_id as string} sku={master.sku} name={master.name} />
                )}
                {bestResolution && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Resolution</p>
                    <p className="text-xs text-muted-foreground mb-0.5">
                      {getResolutionSourceLabel(bestResolution.reasons_json?.[0])}
                    </p>
                    <p className="text-sm">
                      Likely <strong>{bestResolution.match_type.replace("_", " ")}</strong>
                      {bestResolution.confidence > 0 && ` (${(bestResolution.confidence * 100).toFixed(0)}% confidence)`}
                      {bestResolution.reasons_json?.length ? ` · ${bestResolution.reasons_json.join(", ")}` : ""}
                    </p>
                    {bestResolution.status === "pending" && (
                      <div className="flex gap-2 mt-1.5">
                        <Button size="sm" variant="default" disabled={resolutionBusy} onClick={async () => { setResolutionBusy(true); await approveResolutionCandidateAction(bestResolution.id); const res = await fetch(`/api/review/staging/${normalizedId}`).then((r) => r.json()); setDetail(res); setResolutionBusy(false); router.refresh(); }}>Accept resolution</Button>
                        <Button size="sm" variant="outline" disabled={resolutionBusy} onClick={async () => { setResolutionBusy(true); await rejectResolutionCandidateAction(bestResolution.id); setDetail((d) => d ? { ...d, resolution_candidates: resolutionCandidates.map((c) => c.id === bestResolution.id ? { ...c, status: "rejected" } : c) } : d); setResolutionBusy(false); }}>Reject</Button>
                      </div>
                    )}
                  </div>
                )}
                {anomalyFlags.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Anomalies</p>
                    <ul className="space-y-1">
                      {anomalyFlags.map((f, i) => (
                        <li key={i} className={cn("text-sm", f.severity === "error" ? "text-red-400" : "text-amber-400")}>
                          {f.code}: {f.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="pt-3 border-t border-border space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Quick actions</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input type="number" step="0.01" placeholder="Override sell price" className="w-32 h-8 text-sm" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} />
                    <Button size="sm" variant="ghost" disabled={actionBusy || !overridePrice} onClick={async () => { if (!normalizedId) return; setActionBusy(true); await overridePricing(normalizedId, parseFloat(overridePrice)); setActionBusy(false); setOverridePrice(""); }}>Set price</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="h-8 rounded-md border border-border bg-background px-2 text-sm w-40" value={assignCategoryId} onChange={(e) => setAssignCategoryId(e.target.value)}>
                      <option value="">Assign category</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" disabled={actionBusy || !assignCategoryId} onClick={async () => { if (!normalizedId) return; setActionBusy(true); await assignCategory(normalizedId, assignCategoryId); setActionBusy(false); setAssignCategoryId(""); }}>Assign</Button>
                  </div>
                  <Button size="sm" variant="ghost" className="text-amber-400 hover:text-amber-300" disabled={actionBusy} onClick={async () => { if (!normalizedId) return; setActionBusy(true); await markForReprocessing(normalizedId); setActionBusy(false); }}>Mark for reprocessing</Button>
                </div>
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
      {actionModal && normalizedId && (
        <ReviewActionModal
          normalizedId={normalizedId}
          action={actionModal}
          categories={categories}
          initialMasterProductId={detail?.master_product_id as string | undefined}
          initialName={String((detail?.normalized_data as { name?: string })?.name ?? "")}
          onClose={() => setActionModal(null)}
          onSuccess={() => { setActionModal(null); onOpenChange(false); }}
        />
      )}
    </>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  createQuickAddDraft,
  updateQuickAddProductCore,
  type CreateQuickAddDraftInput,
  type UpdateQuickAddCoreInput,
} from "@/app/actions/quick-add";
import { createNewMasterProduct, publishStagedToLive, getAttributeRequirementsForStaged } from "@/app/actions/review";
import { CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID } from "@/lib/publish/ensure-catalog-v2-link";
import {
  effectiveImportPricing,
  type ImportAutoPricingWithOverride,
} from "@/lib/ingestion/import-pricing";
import type { PublishReadiness } from "@/lib/review/publish-guards";
import { QuickAddShellForm } from "./QuickAddShellForm";
import { StagingAttributePanel, type AttributeRequirementsState } from "./StagingAttributePanel";
import { PublishReadinessPanel } from "./PublishReadinessPanel";
import { PublishResultBanner } from "./PublishResultBanner";
import { PublishFailureBanner } from "./PublishFailureBanner";
import { formatMasterProductCreateError } from "./master-create-errors";

type StagingDetail = Record<string, unknown> & {
  publish_readiness?: PublishReadiness;
  updated_at?: string;
  status?: string;
  master_product_id?: string | null;
  search_publish_status?: string | null;
};

type BannerState = { text: string; variant: "success" | "error" | "neutral"; secondaryText?: string };

const EMPTY_ATTRS: Record<string, unknown> = {};

function QuickAddInner({
  suppliers,
  categories,
}: {
  suppliers: { id: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id");

  /** Latest `?id=` from the URL; async handlers compare after `await` so stale completions cannot update another row. */
  const activeNormalizedIdRef = useRef<string | null>(null);
  activeNormalizedIdRef.current = id;

  const [detail, setDetail] = useState<StagingDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unimplementedCategoryAck, setUnimplementedCategoryAck] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  /** Set when publishStagedToLive returns published: false; cleared on successful publish or material staging edits. */
  const [publishFailureRaw, setPublishFailureRaw] = useState<string | null>(null);
  const [attributeRequirements, setAttributeRequirements] = useState<AttributeRequirementsState>({
    required: [],
    stronglyPreferred: [],
    allowedByKey: {},
  });

  /** Monotonic token so an in-flight staging fetch for an old id cannot apply after `id` changes. */
  const stagingFetchTokenRef = useRef(0);

  const refreshDetail = useCallback(async (normalizedId: string) => {
    const token = ++stagingFetchTokenRef.current;
    setLoading(true);
    setLoadErr(null);
    try {
      const r = await fetch(`/api/review/staging/${normalizedId}`);
      if (token !== stagingFetchTokenRef.current) return;
      if (!r.ok) {
        setLoadErr(r.status === 404 ? "Staging row not found." : "Failed to load staging row.");
        setDetail(null);
        return;
      }
      const d = (await r.json()) as StagingDetail;
      if (token !== stagingFetchTokenRef.current) return;
      setDetail(d);
    } catch {
      if (token !== stagingFetchTokenRef.current) return;
      setLoadErr("Failed to load staging row.");
      setDetail(null);
    } finally {
      if (token === stagingFetchTokenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setLoadErr(null);
      setUnimplementedCategoryAck(false);
      setBanner(null);
      setPublishFailureRaw(null);
      setAttributeRequirements({ required: [], stronglyPreferred: [], allowedByKey: {} });
      setActionBusy(false);
      return;
    }
    // New normalized id: never carry publish failure / row-scoped banners from another product.
    setPublishFailureRaw(null);
    setBanner(null);
    setLoadErr(null);
    setDetail(null);
    setActionBusy(false);
    void refreshDetail(id);
  }, [id, refreshDetail]);

  useEffect(() => {
    setUnimplementedCategoryAck(false);
  }, [detail?.publish_readiness?.categorySlug]);

  useEffect(() => {
    if (!id || !detail) return;
    let cancelled = false;
    void getAttributeRequirementsForStaged(id).then((req) => {
      if (cancelled) return;
      if (req.success && Array.isArray(req.required) && Array.isArray(req.stronglyPreferred)) {
        setAttributeRequirements({
          required: req.required,
          stronglyPreferred: req.stronglyPreferred,
          allowedByKey: req.allowedByKey ?? {},
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, detail?.updated_at, detail]);

  const publishReadiness = detail?.publish_readiness;

  const tier1PublishAllowed =
    publishReadiness?.canPublish === true &&
    (publishReadiness.categoryRequirementsEnforced !== false || unimplementedCategoryAck);

  const merchandisingBlocksCreateMaster = (() => {
    const bs = publishReadiness?.blockerSections;
    if (!bs) return true;
    return (
      bs.missing_required_attributes.length > 0 ||
      bs.case_pricing.length > 0 ||
      bs.staging_validation.length > 0
    );
  })();

  const nd = (detail?.normalized_data as Record<string, unknown>) ?? {};
  const shellInitial = useMemo(
    () => ({
      supplier_id: String(detail?.supplier_id ?? ""),
      sku: String(nd.supplier_sku ?? nd.sku ?? ""),
      name: String(nd.name ?? ""),
      category_slug: String(nd.category_slug ?? ""),
      normalized_case_cost:
        nd.normalized_case_cost != null && Number.isFinite(Number(nd.normalized_case_cost))
          ? String(nd.normalized_case_cost)
          : (nd.pricing as { normalized_case_cost?: number } | undefined)?.normalized_case_cost != null
            ? String((nd.pricing as { normalized_case_cost: number }).normalized_case_cost)
            : "",
    }),
    [detail, nd]
  );

  const stagingAttributesForPanel = useMemo(() => {
    if (!detail?.attributes || typeof detail.attributes !== "object") return EMPTY_ATTRS;
    return detail.attributes as Record<string, unknown>;
  }, [detail?.updated_at, detail?.attributes]);

  const facetParseMetaForPanel = useMemo(() => {
    const ndLocal = (detail?.normalized_data as Record<string, unknown>) ?? {};
    const meta = ndLocal.facet_parse_meta;
    return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  }, [detail?.normalized_data, detail?.updated_at]);

  const facetExtractionRefreshHint = useMemo(() => {
    const meta = facetParseMetaForPanel;
    if (!meta) return true;
    const ak = Array.isArray(meta.applied_keys) ? meta.applied_keys : [];
    const sn = Array.isArray(meta.suggested_not_applied) ? meta.suggested_not_applied : [];
    const iss = Array.isArray(meta.issues) ? meta.issues : [];
    return ak.length === 0 && sn.length === 0 && iss.length === 0;
  }, [facetParseMetaForPanel]);

  async function onCreated(values: CreateQuickAddDraftInput) {
    const r = await createQuickAddDraft(values);
    if (!r.success) {
      setBanner({ text: r.error, variant: "error" });
      return;
    }
    setBanner(null);
    router.replace(`/dashboard/products/quick-add?id=${encodeURIComponent(r.normalizedId)}`);
  }

  async function onSaveCore(values: Omit<UpdateQuickAddCoreInput, "normalizedId">) {
    if (!id) return;
    const targetId = id;
    const r = await updateQuickAddProductCore({
      normalizedId: targetId,
      name: values.name,
      sku: values.sku,
      category_slug: values.category_slug,
      normalized_case_cost: values.normalized_case_cost,
    });
    if (activeNormalizedIdRef.current !== targetId) return;
    if (!r.success) {
      setBanner({ text: r.error, variant: "error" });
      return;
    }
    setPublishFailureRaw(null);
    setBanner({ text: "Basics saved.", variant: "neutral" });
    await refreshDetail(targetId);
    if (activeNormalizedIdRef.current !== targetId) return;
  }

  async function onCreateMaster() {
    if (!id || !detail) return;
    const targetId = id;
    const nd = (detail.normalized_data ?? {}) as Record<string, unknown>;
    const catSlug = String(nd.category_slug ?? "").trim();
    const cat = categories.find((c) => c.slug === catSlug);
    if (!cat) {
      setBanner({ text: "Select a valid category before creating the product record.", variant: "error" });
      return;
    }
    const sku = String(nd.supplier_sku ?? nd.sku ?? "").trim();
    const name = String(nd.name ?? "").trim();
    if (!sku || !name) {
      setBanner({ text: "Name and SKU are required.", variant: "error" });
      return;
    }
    const iap = nd.import_auto_pricing as ImportAutoPricingWithOverride | undefined;
    if (!iap) {
      setBanner({
        text: "Import pricing is required before creating a catalog master. Save case pricing and supplier cost first.",
        variant: "error",
      });
      return;
    }
    const eff = effectiveImportPricing(iap);
    const list_price_minor = Math.round(eff.list_price * 100);
    if (!Number.isInteger(list_price_minor) || list_price_minor < 0) {
      setBanner({ text: "Computed list price is invalid; fix import pricing and retry.", variant: "error" });
      return;
    }
    const sc = Number(nd.supplier_cost ?? iap.supplier_cost);
    const unit_cost_minor =
      Number.isFinite(sc) && sc >= 0 ? Math.round(sc * 100) : null;
    setActionBusy(true);
    setBanner(null);
    const r = await createNewMasterProduct(
      targetId,
      {
        sku,
        name,
        category_id: cat.id,
        product_type_id: CATALOG_V2_LEGACY_GLOVE_PRODUCT_TYPE_ID,
        list_price_minor,
        unit_cost_minor,
      },
      { publishToLive: false, publishedBy: "admin" }
    );
    if (activeNormalizedIdRef.current !== targetId) {
      setActionBusy(false);
      return;
    }
    setActionBusy(false);
    if (!r.success) {
      const mapped = formatMasterProductCreateError(r.error);
      setBanner({
        text: mapped.primary,
        variant: "error",
        ...(mapped.secondary ? { secondaryText: mapped.secondary } : {}),
      });
      return;
    }
    setPublishFailureRaw(null);
    setBanner({ text: "Product record created and staging approved.", variant: "success" });
    await refreshDetail(targetId);
    if (activeNormalizedIdRef.current !== targetId) return;
    router.refresh();
  }

  async function onPublish() {
    if (!id || !detail) return;
    const targetId = id;
    setActionBusy(true);
    setBanner(null);
    setPublishFailureRaw(null);
    const r = await publishStagedToLive(targetId, {
      publishedBy: "admin",
      expectedUpdatedAt: (detail.updated_at as string) ?? null,
    });
    if (activeNormalizedIdRef.current !== targetId) {
      setActionBusy(false);
      return;
    }
    setActionBusy(false);
    if (!r.published) {
      const err = r.publishError ?? r.error ?? "Publish failed";
      setPublishFailureRaw(err);
      await refreshDetail(targetId);
      if (activeNormalizedIdRef.current !== targetId) return;
      router.refresh();
      return;
    }
    setPublishFailureRaw(null);
    const fullySynced = r.publishComplete !== false && r.searchPublishStatus === "published_synced";
    setBanner({
      text: fullySynced
        ? "Published and fully synced."
        : `Publish succeeded for live catalog, but storefront search is not fully synced (status: ${String(r.searchPublishStatus ?? "unknown")}). Confirm the row in Review; retry publish if needed.`,
      variant: "success",
    });
    await refreshDetail(targetId);
    if (activeNormalizedIdRef.current !== targetId) return;
    router.refresh();
  }

  if (!id) {
    if (suppliers.length === 0) {
      return (
        <div className="space-y-6 max-w-2xl">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Single product quick add</h1>
            <p className="text-sm text-muted-foreground mt-1">Add at least one supplier before creating drafts.</p>
          </div>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">No suppliers configured</p>
            <p className="text-sm text-muted-foreground">
              Quick add needs a supplier to attach the staging row and offers. Create a supplier first, then return here.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link href="/dashboard/suppliers">Go to suppliers</Link>
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Single product quick add</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Creates a real staging row and uses the same readiness checks and publish pipeline as Review.{" "}
            <Link href="/dashboard/review" className="text-primary underline-offset-2 hover:underline">
              Open review queue
            </Link>
          </p>
        </div>
        <PublishResultBanner
          message={banner?.text ?? null}
          variant={banner?.variant ?? "neutral"}
          secondaryText={banner?.secondaryText}
        />
        <QuickAddShellForm mode="create" suppliers={suppliers} categories={categories} onCreate={onCreated} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quick add</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">{id}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/products/quick-add">New product</Link>
        </Button>
      </div>

      {loadErr ? <p className="text-sm text-destructive">{loadErr}</p> : null}
      {loading && !detail ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {detail ? (
        <>
          <PublishResultBanner
            message={banner?.text ?? null}
            variant={banner?.variant ?? "neutral"}
            secondaryText={banner?.secondaryText}
          />
          {publishFailureRaw ? <PublishFailureBanner rawMessage={publishFailureRaw} /> : null}
          <QuickAddShellForm
            key={String(detail.updated_at)}
            mode="edit"
            suppliers={suppliers}
            categories={categories}
            initial={shellInitial}
            disabled={actionBusy}
            onSaveCore={onSaveCore}
          />
          <StagingAttributePanel
            normalizedId={id}
            detailUpdatedAt={String(detail.updated_at ?? "")}
            stagingAttributes={stagingAttributesForPanel}
            facetParseMeta={facetParseMetaForPanel}
            facetExtractionRefreshHint={facetExtractionRefreshHint}
            attributeRequirements={attributeRequirements}
            disabled={actionBusy}
            onAfterSave={async () => {
              const targetId = id;
              if (!targetId) return;
              setPublishFailureRaw(null);
              setBanner({ text: "Attributes saved.", variant: "neutral" });
              await refreshDetail(targetId);
              if (activeNormalizedIdRef.current !== targetId) return;
              router.refresh();
            }}
            onError={(msg) => {
              const targetId = id;
              if (!targetId || activeNormalizedIdRef.current !== targetId) return;
              setBanner({ text: msg, variant: "error" });
            }}
          />
          <PublishReadinessPanel
            publishReadiness={publishReadiness}
            unimplementedCategoryAck={unimplementedCategoryAck}
            onUnimplementedCategoryAck={setUnimplementedCategoryAck}
          />
          <div className="flex flex-col gap-2 max-w-xl">
            {!detail.master_product_id ? (
              <>
                {merchandisingBlocksCreateMaster && publishReadiness ? (
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    Finish required merchandising and case pricing first, or publish will still fail.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={actionBusy || loading || merchandisingBlocksCreateMaster || !publishReadiness}
                    onClick={() => void onCreateMaster()}
                  >
                    Create product record
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Master linked — you can publish when Tier 1 passes.</p>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="default"
                  disabled={actionBusy || !tier1PublishAllowed || !detail.master_product_id}
                  onClick={() => void onPublish()}
                >
                  {actionBusy ? "Publishing…" : publishFailureRaw ? "Retry publish" : "Publish / sync to live"}
                </Button>
              </div>
              {publishFailureRaw ? (
                <p className="text-xs text-muted-foreground max-w-xl">
                  Retry publish runs the same publish action; staging data was refreshed after the failed attempt.
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function QuickAddPageClient(props: {
  suppliers: { id: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <QuickAddInner {...props} />
    </Suspense>
  );
}

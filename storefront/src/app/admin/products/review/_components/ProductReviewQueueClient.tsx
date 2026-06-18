"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClipboardStagingRow } from "@/lib/admin/clipboard-url-staging";
import type { UnifiedReviewQueueRow } from "@/lib/admin/unified-ingestion-review-queue";
import { modeLabel } from "@/lib/unified-ingestion/labels";
import type { AdminCategoryOption } from "@/lib/admin/product-form-options";
import {
  parseClipboardCatalogosStagingRef,
} from "@/lib/admin/clipboard-staging-catalogos-bridge";
import {
  catalogosReviewBatchUrl,
  catalogosReviewDashboardUrl,
  catalogosUrlImportJobPageUrl,
  isCatalogosImportBatchHandoff,
  isCatalogosUrlImportUnifiedRow,
} from "@/lib/admin/review-queue-catalogos-handoff";
import { EmptyState, StatusBadge, TableCard } from "@/components/admin";
import {
  adminAlertSurface,
  adminCardSurface,
  adminFormInput,
  adminLink,
  adminPrimaryButton,
  adminSecondaryButton,
  adminTableBody,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const deleteButton = cn(
  adminSecondaryButton,
  "border-admin-danger/40 text-admin-danger hover:bg-[var(--admin-danger-surface)]",
);

function reviewStatusForBadge(status: string): string {
  if (status === "converted_to_draft" || status === "promoted_to_draft" || status === "promoted") return "completed";
  if (status === "dismissed") return "cancelled";
  if (status === "failed" || status === "blocked") return "failed";
  if (status === "needs_review" || status === "review_ready" || status === "awaiting_human") return "pending";
  return status;
}

function jobStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function ProductReviewQueueClient({
  useUnifiedQueue,
  unifiedRows,
  clipboardRows,
  categories,
  supabaseConfigured,
  catalogosBaseUrl = "",
  batchId = "",
}: {
  useUnifiedQueue: boolean;
  unifiedRows: UnifiedReviewQueueRow[];
  clipboardRows: ClipboardStagingRow[];
  categories: AdminCategoryOption[];
  supabaseConfigured: boolean;
  catalogosBaseUrl?: string;
  batchId?: string;
}) {
  const router = useRouter();
  const [promoteId, setPromoteId] = React.useState<string | null>(null);
  const [promoteCategory, setPromoteCategory] = React.useState("");
  const [confirmAwaitingHuman, setConfirmAwaitingHuman] = React.useState(false);
  const [promoteBusy, setPromoteBusy] = React.useState(false);
  const [dismissId, setDismissId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onPromoteUnified(stagingVariantId: string, jobStatus: string) {
    if (!promoteCategory.trim()) {
      setError("Pick a category before creating a draft.");
      return;
    }
    if (jobStatus === "awaiting_human" && !confirmAwaitingHuman) {
      setError("Confirm low-confidence review before promoting.");
      return;
    }
    setError(null);
    setPromoteBusy(true);
    try {
      const res = await fetch(
        `/admin/api/products/ingestion/staging/${encodeURIComponent(stagingVariantId)}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: promoteCategory.trim(),
            confirm_awaiting_human: confirmAwaitingHuman || jobStatus !== "awaiting_human",
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        productId?: string;
        existingProductId?: string;
      };
      if (!res.ok) {
        const suffix = data.existingProductId
          ? ` Open the existing draft from Products or retry with link staging.`
          : "";
        setError((data.error ?? `Promote failed (${res.status})`) + suffix);
        return;
      }
      setPromoteId(null);
      setConfirmAwaitingHuman(false);
      router.push(`/admin/products/${data.productId}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPromoteBusy(false);
    }
  }

  async function onPromoteClipboard(stagingId: string) {
    if (!promoteCategory.trim()) {
      setError("Pick a category before creating a draft.");
      return;
    }
    setError(null);
    setPromoteBusy(true);
    try {
      const res = await fetch(`/admin/api/products/url-staging/${encodeURIComponent(stagingId)}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: promoteCategory.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        productId?: string;
        existingProductId?: string;
      };
      if (!res.ok) {
        const suffix = data.existingProductId
          ? ` Open the existing draft from Products or retry with link staging.`
          : "";
        setError((data.error ?? `Promote failed (${res.status})`) + suffix);
        return;
      }
      setPromoteId(null);
      router.push(`/admin/products/${data.productId}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPromoteBusy(false);
    }
  }

  async function onDismissUnified(stagingVariantId: string) {
    setError(null);
    setDismissId(stagingVariantId);
    try {
      const res = await fetch(
        `/admin/api/products/ingestion/staging/${encodeURIComponent(stagingVariantId)}/dismiss`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Dismiss failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDismissId(null);
    }
  }

  async function onDismissClipboard(stagingId: string) {
    setError(null);
    setDismissId(stagingId);
    try {
      const res = await fetch(`/admin/api/products/url-staging/${encodeURIComponent(stagingId)}/dismiss`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Dismiss failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDismissId(null);
    }
  }

  if (!supabaseConfigured) {
    return (
      <div className={adminAlertSurface("warning")}>
        Database is not configured — review queue cannot load.
      </div>
    );
  }

  const empty = useUnifiedQueue ? unifiedRows.length === 0 : clipboardRows.length === 0;
  const batchHandoff = isCatalogosImportBatchHandoff(batchId);
  const catalogosBatchReviewUrl =
    batchHandoff && catalogosBaseUrl ? catalogosReviewBatchUrl(catalogosBaseUrl, batchId) : "";
  const catalogosReviewUrl = catalogosBaseUrl ? catalogosReviewDashboardUrl(catalogosBaseUrl) : "";

  return (
    <div className="space-y-4">
      {batchHandoff ? (
        <div className={adminAlertSurface("info")}>
          <p className="font-semibold text-admin-accent">Review and publish in CatalogOS</p>
          <p className="mt-2 leading-relaxed text-admin-secondary">
            Bridged URL imports are staged in CatalogOS import batches. Finish review in CatalogOS — not via storefront
            promote or publish.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
            {catalogosBatchReviewUrl ? (
              <a
                href={catalogosBatchReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={adminLink}
              >
                Open this batch in CatalogOS review
              </a>
            ) : null}
            {catalogosReviewUrl ? (
              <a
                href={catalogosReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={adminLink}
              >
                CatalogOS review dashboard
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <div className={adminAlertSurface("critical")}>{error}</div> : null}

      <TableCard>
        <div className="border-b border-admin-border bg-admin-surface-muted px-4 py-4">
          <h2 className="text-base font-semibold text-admin-primary">
            {useUnifiedQueue ? "Unified ingestion staging" : "Clipboard URL staging"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-admin-secondary">
            {useUnifiedQueue
              ? "Rows keyed by staging_variant_id. Promoting creates a draft in catalog_v2 only."
              : "Legacy clipboard rows. Enable UNIFIED_REVIEW_QUEUE for Quick/Deep convergence."}
          </p>
        </div>

        {empty ? (
          <EmptyState
            title="No staging rows yet"
            description="Paste URLs under Import from URL or run a Deep crawl."
          />
        ) : useUnifiedQueue ? (
          <UnifiedTable
            rows={unifiedRows}
            categories={categories}
            catalogosBaseUrl={catalogosBaseUrl}
            promoteId={promoteId}
            promoteCategory={promoteCategory}
            confirmAwaitingHuman={confirmAwaitingHuman}
            promoteBusy={promoteBusy}
            dismissId={dismissId}
            onSetPromoteId={setPromoteId}
            onSetPromoteCategory={setPromoteCategory}
            onSetConfirmAwaitingHuman={setConfirmAwaitingHuman}
            onPromote={onPromoteUnified}
            onDismiss={onDismissUnified}
          />
        ) : (
          <ClipboardTable
            rows={clipboardRows}
            categories={categories}
            catalogosBaseUrl={catalogosBaseUrl}
            promoteId={promoteId}
            promoteCategory={promoteCategory}
            promoteBusy={promoteBusy}
            dismissId={dismissId}
            onSetPromoteId={setPromoteId}
            onSetPromoteCategory={setPromoteCategory}
            onPromote={onPromoteClipboard}
            onDismiss={onDismissClipboard}
          />
        )}
      </TableCard>
    </div>
  );
}

function UnifiedTable({
  rows,
  categories,
  catalogosBaseUrl,
  promoteId,
  promoteCategory,
  confirmAwaitingHuman,
  promoteBusy,
  dismissId,
  onSetPromoteId,
  onSetPromoteCategory,
  onSetConfirmAwaitingHuman,
  onPromote,
  onDismiss,
}: {
  rows: UnifiedReviewQueueRow[];
  categories: AdminCategoryOption[];
  catalogosBaseUrl: string;
  promoteId: string | null;
  promoteCategory: string;
  confirmAwaitingHuman: boolean;
  promoteBusy: boolean;
  dismissId: string | null;
  onSetPromoteId: (id: string | null) => void;
  onSetPromoteCategory: (v: string) => void;
  onSetConfirmAwaitingHuman: (v: boolean) => void;
  onPromote: (id: string, jobStatus: string) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
        <thead className={cn(adminTableHead, "border-b border-admin-border")}>
          <tr>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Preview</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Title</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Mode</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Job state</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Source</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Evidence</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Review</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Created</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3 text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody className={adminTableBody}>
          {rows.map((r) => {
            const nameEv = r.evidenceByField.name;
            const conf =
              nameEv && Number.isFinite(nameEv.confidence)
                ? `${Math.round(nameEv.confidence * 100)}%`
                : "—";
            const canAct =
              r.reviewStatus === "needs_review" &&
              (r.jobStatus === "review_ready" || r.jobStatus === "awaiting_human");
            const blocked = r.jobStatus === "blocked" || r.jobStatus === "failed";
            const catalogosHandoff = isCatalogosUrlImportUnifiedRow(r);
            const catalogosJobUrl =
              catalogosHandoff && r.catalogosUrlImportJobId && catalogosBaseUrl
                ? catalogosUrlImportJobPageUrl(catalogosBaseUrl, r.catalogosUrlImportJobId)
                : "";
            const catalogosReviewUrl = catalogosBaseUrl ? catalogosReviewDashboardUrl(catalogosBaseUrl) : "";
            const catalogosBatchUrl =
              r.sourceBatchId && catalogosBaseUrl
                ? catalogosReviewBatchUrl(catalogosBaseUrl, r.sourceBatchId)
                : "";

            return (
              <tr key={r.stagingVariantId} className={cn("align-top", adminTableRowHover)}>
                <td className="px-4 py-3">
                  {r.primaryImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.primaryImageUrl}
                      alt=""
                      className="h-12 w-12 rounded-lg border border-admin-border object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-admin-border text-xs text-admin-muted">
                      —
                    </div>
                  )}
                </td>
                <td className="max-w-[180px] px-4 py-3 font-semibold text-admin-primary">{r.title}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold text-admin-accent">{modeLabel(r.ingestionMode)}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={reviewStatusForBadge(r.jobStatus)} />
                  <span className="sr-only">{jobStatusLabel(r.jobStatus)}</span>
                  {r.blockedReason ? (
                    <div className="mt-1 text-xs text-admin-warning">{r.blockedReason}</div>
                  ) : null}
                  {r.duplicateOf ? (
                    <div className="mt-1 font-mono text-xs text-admin-muted">dup: {r.duplicateOf.slice(0, 8)}…</div>
                  ) : null}
                </td>
                <td className="max-w-[200px] px-4 py-3">
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn("break-all font-mono text-xs", adminLink)}
                  >
                    {r.sourceUrl}
                  </a>
                </td>
                <td className="px-4 py-3 text-xs text-admin-secondary">
                  <div>{conf} · {nameEv?.sourceType ?? "—"}</div>
                  <div className="font-mono text-[10px] text-admin-muted">{r.sourceFingerprint.slice(0, 12)}…</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={reviewStatusForBadge(r.reviewStatus)} />
                  <div className="mt-1 text-xs text-admin-muted">media: {r.mediaStatus}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-admin-muted">{formatWhen(r.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <QueueActions
                    canAct={canAct && !blocked && !catalogosHandoff}
                    blocked={blocked}
                    catalogosHandoff={catalogosHandoff}
                    catalogosJobUrl={catalogosJobUrl}
                    catalogosReviewUrl={catalogosReviewUrl}
                    catalogosBatchUrl={catalogosBatchUrl}
                    promoteId={promoteId}
                    rowId={r.stagingVariantId}
                    promoteCategory={promoteCategory}
                    promoteBusy={promoteBusy}
                    dismissId={dismissId}
                    categories={categories}
                    showAwaitingConfirm={r.jobStatus === "awaiting_human"}
                    confirmAwaitingHuman={confirmAwaitingHuman}
                    onSetConfirmAwaitingHuman={onSetConfirmAwaitingHuman}
                    onSetPromoteId={onSetPromoteId}
                    onSetPromoteCategory={onSetPromoteCategory}
                    onPromote={() => onPromote(r.stagingVariantId, r.jobStatus)}
                    onDismiss={() => onDismiss(r.stagingVariantId)}
                    editHref={
                      r.promotedCatalogProductId
                        ? `/admin/products/${r.promotedCatalogProductId}/edit`
                        : null
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClipboardTable({
  rows,
  categories,
  catalogosBaseUrl,
  promoteId,
  promoteCategory,
  promoteBusy,
  dismissId,
  onSetPromoteId,
  onSetPromoteCategory,
  onPromote,
  onDismiss,
}: {
  rows: ClipboardStagingRow[];
  categories: AdminCategoryOption[];
  catalogosBaseUrl: string;
  promoteId: string | null;
  promoteCategory: string;
  promoteBusy: boolean;
  dismissId: string | null;
  onSetPromoteId: (id: string | null) => void;
  onSetPromoteCategory: (v: string) => void;
  onPromote: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-left text-sm">
        <thead className={cn(adminTableHead, "border-b border-admin-border")}>
          <tr>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Preview</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Title</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Source</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Status</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3")}>Created</th>
            <th className={cn(adminTableHeadCell, "px-4 py-3 text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody className={adminTableBody}>
          {rows.map((r) => {
            const ex = (r.extracted ?? {}) as Record<string, unknown>;
            const catalogosRef = parseClipboardCatalogosStagingRef(ex);
            const catalogosHandoff = catalogosRef != null;
            const catalogosJobUrl =
              catalogosRef && catalogosBaseUrl
                ? catalogosUrlImportJobPageUrl(catalogosBaseUrl, catalogosRef.jobId)
                : "";
            const catalogosReviewUrl = catalogosBaseUrl ? catalogosReviewDashboardUrl(catalogosBaseUrl) : "";
            const title = String(ex.suggested_name ?? ex.page_title ?? "—");
            const thumb =
              (typeof r.image_url === "string" && r.image_url.trim()) ||
              (typeof ex.suggested_image_from_page === "string" ? String(ex.suggested_image_from_page) : null);
            return (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-12 w-12 rounded-lg border object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg border border-dashed border-admin-border" />
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-admin-primary">{title}</td>
                <td className="px-4 py-3">
                  <a href={r.product_page_url} target="_blank" rel="noreferrer" className={cn("font-mono text-xs", adminLink)}>
                    {r.product_page_url}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={reviewStatusForBadge(r.review_status)} />
                </td>
                <td className="px-4 py-3 font-mono text-xs">{formatWhen(r.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <QueueActions
                    canAct={r.review_status === "needs_review" && !catalogosHandoff}
                    blocked={false}
                    catalogosHandoff={catalogosHandoff}
                    catalogosJobUrl={catalogosJobUrl}
                    catalogosReviewUrl={catalogosReviewUrl}
                    catalogosBatchUrl=""
                    promoteId={promoteId}
                    rowId={r.id}
                    promoteCategory={promoteCategory}
                    promoteBusy={promoteBusy}
                    dismissId={dismissId}
                    categories={categories}
                    showAwaitingConfirm={false}
                    confirmAwaitingHuman={false}
                    onSetConfirmAwaitingHuman={() => {}}
                    onSetPromoteId={onSetPromoteId}
                    onSetPromoteCategory={onSetPromoteCategory}
                    onPromote={() => onPromote(r.id)}
                    onDismiss={() => onDismiss(r.id)}
                    editHref={r.created_catalog_product_id ? `/admin/products/${r.created_catalog_product_id}/edit` : null}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QueueActions({
  canAct,
  blocked,
  catalogosHandoff,
  catalogosJobUrl,
  catalogosReviewUrl,
  catalogosBatchUrl,
  promoteId,
  rowId,
  promoteCategory,
  promoteBusy,
  dismissId,
  categories,
  showAwaitingConfirm,
  confirmAwaitingHuman,
  onSetConfirmAwaitingHuman,
  onSetPromoteId,
  onSetPromoteCategory,
  onPromote,
  onDismiss,
  editHref,
}: {
  canAct: boolean;
  blocked: boolean;
  catalogosHandoff: boolean;
  catalogosJobUrl: string;
  catalogosReviewUrl: string;
  catalogosBatchUrl: string;
  promoteId: string | null;
  rowId: string;
  promoteCategory: string;
  promoteBusy: boolean;
  dismissId: string | null;
  categories: AdminCategoryOption[];
  showAwaitingConfirm: boolean;
  confirmAwaitingHuman: boolean;
  onSetConfirmAwaitingHuman: (v: boolean) => void;
  onSetPromoteId: (id: string | null) => void;
  onSetPromoteCategory: (v: string) => void;
  onPromote: () => void;
  onDismiss: () => void;
  editHref: string | null;
}) {
  if (blocked) {
    return <span className="text-xs text-admin-muted">Blocked — cannot promote</span>;
  }
  if (catalogosHandoff) {
    return (
      <div className="flex max-w-[220px] flex-col items-end gap-1.5 text-xs text-admin-secondary">
        <span className="text-right leading-snug">
          This URL import should be reviewed and published in CatalogOS.
        </span>
        {catalogosBatchUrl ? (
          <a
            href={catalogosBatchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={adminLink}
          >
            Open batch in CatalogOS review
          </a>
        ) : null}
        {catalogosJobUrl ? (
          <a
            href={catalogosJobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={adminLink}
          >
            View URL import job
          </a>
        ) : null}
        {catalogosReviewUrl ? (
          <a
            href={catalogosReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={adminLink}
          >
            CatalogOS review dashboard
          </a>
        ) : null}
      </div>
    );
  }
  if (!canAct) {
    return editHref ? (
      <Link href={editHref} className={cn("text-xs font-semibold", adminLink)}>
        Review / edit draft
      </Link>
    ) : (
      <span className="text-xs text-admin-muted">—</span>
    );
  }
  if (promoteId === rowId) {
    return (
      <div className={cn(adminCardSurface, "flex w-[220px] flex-col gap-2 p-3 text-left")}>
        <select
          value={promoteCategory}
          onChange={(e) => onSetPromoteCategory(e.target.value)}
          className={cn(adminFormInput, "w-full")}
        >
          <option value="">Category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {showAwaitingConfirm ? (
          <label className="flex items-start gap-2 text-xs text-admin-warning">
            <input
              type="checkbox"
              checked={confirmAwaitingHuman}
              onChange={(e) => onSetConfirmAwaitingHuman(e.target.checked)}
              className="mt-0.5"
            />
            I reviewed low-confidence fields
          </label>
        ) : null}
        <button
          type="button"
          disabled={promoteBusy}
          onClick={() => void onPromote()}
          className={cn(adminPrimaryButton, "text-xs")}
        >
          {promoteBusy ? "Working…" : "Approve → draft"}
        </button>
        <button type="button" className="text-xs text-admin-muted" onClick={() => onSetPromoteId(null)}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => {
          onSetPromoteId(rowId);
          onSetPromoteCategory("");
          onSetConfirmAwaitingHuman(false);
        }}
        className={cn(adminSecondaryButton, "text-xs")}
      >
        Approve / promote…
      </button>
      <button
        type="button"
        disabled={dismissId === rowId}
        onClick={() => void onDismiss()}
        className={cn(deleteButton, "text-xs")}
      >
        {dismissId === rowId ? "Dismissing…" : "Dismiss"}
      </button>
    </div>
  );
}

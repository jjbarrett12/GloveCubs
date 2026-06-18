"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClipboardStagingRow } from "@/lib/admin/clipboard-url-staging";
import type { AdminCategoryOption } from "@/lib/admin/product-form-options";
import {
  catalogosUrlImportJobPageUrl,
  parseClipboardCatalogosStagingRef,
  storefrontUrlImportBridgeApiPath,
} from "@/lib/admin/clipboard-staging-catalogos-bridge";
import {
  adminAlertSurface,
  adminCardSurface,
  adminFormInput,
  adminFormLabel,
  adminLink,
  adminMutedPanel,
  adminPrimaryButton,
  adminSecondaryButton,
  adminStatusBadgeClasses,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { UrlImportBridgeSuccessBanner } from "./UrlImportBridgeSuccessBanner";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function reviewStatusTone(status: string): "success" | "warning" | "neutral" {
  const lower = status.toLowerCase();
  if (lower.includes("promot") || lower.includes("done") || lower.includes("complete")) return "success";
  if (lower.includes("review") || lower.includes("pending") || lower.includes("need")) return "warning";
  return "neutral";
}

const inputClass = cn(adminFormInput, "mt-2 w-full rounded-lg font-mono shadow-inner");

export function ClipboardUrlStagingClient({
  categories,
  initialRows,
  catalogosBaseUrl = "",
}: {
  categories: AdminCategoryOption[];
  initialRows: ClipboardStagingRow[];
  catalogosBaseUrl?: string;
}) {
  const router = useRouter();
  const [productUrl, setProductUrl] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [promoteId, setPromoteId] = React.useState<string | null>(null);
  const [promoteCategory, setPromoteCategory] = React.useState("");
  const [promoteBusy, setPromoteBusy] = React.useState(false);
  const [promoteRowError, setPromoteRowError] = React.useState<{
    stagingId: string;
    message: string;
    existingProductId?: string;
  } | null>(null);
  const [removeId, setRemoveId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulkRemoving, setBulkRemoving] = React.useState(false);
  const [bulkRemoveError, setBulkRemoveError] = React.useState<string | null>(null);
  const [bridgeRowId, setBridgeRowId] = React.useState<string | null>(null);
  const [bridgeResult, setBridgeResult] = React.useState<{
    stagingId: string;
    kind: "ok" | "error";
    batchId?: string | null;
    message?: string;
  } | null>(null);

  const rows = initialRows;
  const rowIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));

  async function onStage(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/admin/api/products/url-staging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_page_url: productUrl.trim(), image_url: imageUrl.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setProductUrl("");
      setImageUrl("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeStagingImports(stagingIds: string[], deleteLinkedDrafts: boolean) {
    setError(null);
    setBulkRemoveError(null);
    try {
      const res = await fetch("/admin/api/products/url-staging/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staging_ids: stagingIds, delete_linked_drafts: deleteLinkedDrafts }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        removed?: string[];
        failed?: Array<{ stagingId: string; error: string }>;
      };
      if (!res.ok) {
        const msg = data.error ?? `Remove failed (${res.status})`;
        if (stagingIds.length === 1) setError(msg);
        else setBulkRemoveError(msg);
        return false;
      }
      const failed = data.failed ?? [];
      if (failed.length > 0) {
        const msg = `Removed ${data.removed?.length ?? 0}; ${failed.length} failed: ${failed
          .slice(0, 2)
          .map((f) => f.error)
          .join("; ")}${failed.length > 2 ? "…" : ""}`;
        if (stagingIds.length === 1) setError(msg);
        else setBulkRemoveError(msg);
      } else if (stagingIds.length > 1) {
        setSelected(new Set());
      }
      router.refresh();
      return failed.length === 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      if (stagingIds.length === 1) setError(msg);
      else setBulkRemoveError(msg);
      return false;
    }
  }

  async function onRemove(stagingId: string, deleteLinkedDrafts = false) {
    setRemoveId(stagingId);
    await removeStagingImports([stagingId], deleteLinkedDrafts);
    setRemoveId(null);
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (allSelected ? new Set() : new Set(rowIds)));
  }

  async function onBulkRemove(deleteLinkedDrafts: boolean) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const linkedDraftCount = rows.filter((r) => selected.has(r.id) && r.created_catalog_product_id).length;
    const prompt = deleteLinkedDrafts
      ? linkedDraftCount > 0
        ? `Remove ${ids.length} staged import${ids.length === 1 ? "" : "s"} and delete ${linkedDraftCount} linked draft product${linkedDraftCount === 1 ? "" : "s"}? This cannot be undone.`
        : `Remove ${ids.length} staged import${ids.length === 1 ? "" : "s"}? This cannot be undone.`
      : linkedDraftCount > 0
        ? `Remove ${ids.length} staged import${ids.length === 1 ? "" : "s"} from this list? Linked draft products will be kept.`
        : `Remove ${ids.length} staged import${ids.length === 1 ? "" : "s"} from this list?`;
    if (!window.confirm(prompt)) return;
    setBulkRemoving(true);
    await removeStagingImports(ids, deleteLinkedDrafts);
    setBulkRemoving(false);
  }

  async function onBridgeToCatalogos(stagingId: string, jobId: string, productId: string) {
    setError(null);
    setBridgeResult(null);
    setBridgeRowId(stagingId);
    try {
      const res = await fetch(storefrontUrlImportBridgeApiPath(jobId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: [productId] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        batchId?: string;
        normalizedCount?: number;
      };
      if (!res.ok) {
        setBridgeResult({
          stagingId,
          kind: "error",
          message: data.error ?? `Bridge failed (${res.status})`,
        });
        return;
      }
      const batchId = typeof data.batchId === "string" ? data.batchId : null;
      setBridgeResult({ stagingId, kind: "ok", batchId });
    } catch (err) {
      setBridgeResult({
        stagingId,
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setBridgeRowId(null);
    }
  }

  async function onPromote(stagingId: string, openExistingDraft = false) {
    if (!promoteCategory.trim()) {
      setPromoteRowError({ stagingId, message: "Pick a category before creating a draft." });
      return;
    }
    setError(null);
    setPromoteRowError(null);
    setPromoteBusy(true);
    try {
      const res = await fetch(`/admin/api/products/url-staging/${encodeURIComponent(stagingId)}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: promoteCategory.trim(),
          open_existing_draft: openExistingDraft,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        productId?: string;
        existingProductId?: string;
      };
      if (!res.ok) {
        setPromoteRowError({
          stagingId,
          message: data.error ?? `Promote failed (${res.status})`,
          existingProductId: data.existingProductId,
        });
        return;
      }
      setPromoteId(null);
      router.push(`/admin/products/${data.productId}/edit`);
    } catch (err) {
      setPromoteRowError({
        stagingId,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setPromoteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onStage}
        className={cn(adminCardSurface, "border-2 border-admin-accent/25 p-6 ring-1 ring-admin-accent/10")}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-admin-primary">Import from URL</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-admin-secondary">
              Paste a product page URL to stage evidence. CatalogOS-sourced rows can bridge into catalog sync review
              (canonical publish path). Storefront draft promote remains a draft-only fallback—nothing publishes automatically.
            </p>
          </div>
          <ol className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">
            <li className={cn("rounded-lg border border-admin-accent/30 px-3 py-1.5 text-admin-accent shadow-sm", adminStatusBadgeClasses("accent"))}>
              1 · Stage
            </li>
            <li className={cn(adminSecondaryButton, "rounded-lg px-3 py-1.5 text-xs")}>2 · Review</li>
            <li className={cn(adminSecondaryButton, "rounded-lg px-3 py-1.5 text-xs")}>3 · Publish</li>
          </ol>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={adminFormLabel}>Product page URL</span>
            <input
              required
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://…"
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={adminFormLabel}>Image URL (optional)</span>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… direct image"
              className={inputClass}
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-admin-danger">{error}</p> : null}
        <div className="mt-5">
          <button type="submit" disabled={submitting} className={cn(adminPrimaryButton, "px-5 py-2.5")}>
            {submitting ? "Staging…" : "Stage for review"}
          </button>
        </div>
      </form>

      <div className={cn(adminCardSurface, "p-6")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-admin-primary">Staged imports</h3>
          {rows.length > 0 ? (
            <label className="flex items-center gap-2 text-sm text-admin-secondary">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-admin-border text-admin-accent focus:ring-admin-accent/30"
              />
              Select all
            </label>
          ) : null}
        </div>
        {selected.size > 0 ? (
          <div className={cn(adminMutedPanel, "mt-4 flex flex-wrap items-center gap-3 border-solid px-4 py-3 text-sm")}>
            <span className="font-medium text-admin-secondary">
              <span className="font-mono text-admin-primary">{selected.size}</span> selected
            </span>
            <button
              type="button"
              disabled={bulkRemoving}
              onClick={() => void onBulkRemove(false)}
              className={cn(adminSecondaryButton, "border-admin-danger/40 text-xs text-admin-danger")}
            >
              {bulkRemoving ? "Removing…" : "Remove selected"}
            </button>
            <button
              type="button"
              disabled={bulkRemoving}
              onClick={() => void onBulkRemove(true)}
              className={cn(adminSecondaryButton, "border-admin-danger/50 bg-[var(--admin-danger-surface)] text-xs font-semibold text-admin-danger")}
            >
              Remove & delete drafts
            </button>
            <button
              type="button"
              disabled={bulkRemoving}
              onClick={() => setSelected(new Set())}
              className={cn("text-xs font-medium", adminLink)}
            >
              Clear selection
            </button>
            {bulkRemoveError ? <span className="text-xs text-admin-danger">{bulkRemoveError}</span> : null}
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-admin-muted">No staged rows yet. Paste a product URL above.</p>
        ) : (
          <ul className="mt-4 divide-y divide-admin-border-subtle">
            {rows.map((r) => {
              const ex = (r.extracted ?? {}) as Record<string, unknown>;
              const catalogosRef = parseClipboardCatalogosStagingRef(ex);
              const catalogosJobUrl =
                catalogosRef && catalogosBaseUrl
                  ? catalogosUrlImportJobPageUrl(catalogosBaseUrl, catalogosRef.jobId)
                  : "";
              const title = String(ex.suggested_name ?? ex.page_title ?? "—");
              const thumb =
                (typeof r.image_url === "string" && r.image_url.trim()) ||
                (typeof ex.suggested_image_from_page === "string" && ex.suggested_image_from_page.trim()) ||
                null;
              const confRaw = ex.confidence;
              const conf =
                typeof confRaw === "number" && Number.isFinite(confRaw)
                  ? confRaw > 1
                    ? Math.min(1, confRaw / 100)
                    : Math.max(0, confRaw)
                  : null;
              const statusTone = reviewStatusTone(r.review_status);

              return (
                <li key={r.id} className="py-5 first:pt-2">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex shrink-0 items-start pt-1">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select staged import ${r.id}`}
                        className="rounded border-admin-border text-admin-accent focus:ring-admin-accent/30"
                      />
                    </div>
                    <div className="shrink-0">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="h-20 w-20 rounded-lg border border-admin-border bg-admin-surface-muted object-cover shadow-sm"
                        />
                      ) : (
                        <div
                          className={cn(adminMutedPanel, "flex h-20 w-20 items-center justify-center border-solid text-center text-xs font-medium text-admin-muted")}
                          aria-hidden
                        >
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-admin-muted">{r.id}</p>
                      <p className="mt-1 text-sm font-semibold text-admin-primary">{title}</p>
                      <a
                        href={r.product_page_url}
                        className={cn("mt-1 block break-all font-mono text-sm font-medium", adminLink)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.product_page_url}
                      </a>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-admin-secondary">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1",
                            adminStatusBadgeClasses(statusTone),
                          )}
                        >
                          {r.review_status}
                        </span>
                        <span className="font-mono text-xs text-admin-muted">
                          {r.created_catalog_product_id ? "Last edited" : "Staged"}: {formatWhen(r.last_edited_at)}
                        </span>
                        {conf != null ? (
                          <span className="rounded-md border border-admin-border bg-admin-surface-muted px-2 py-0.5 font-mono text-xs text-admin-secondary">
                            Confidence {(conf * 100).toFixed(0)}%
                          </span>
                        ) : null}
                        {r.image_url ? (
                          <a className={cn("font-medium", adminLink)} href={r.image_url} target="_blank" rel="noreferrer">
                            Image URL
                          </a>
                        ) : null}
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm text-admin-secondary sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Suggested brand</dt>
                          <dd className="text-admin-primary">{String(ex.suggested_brand ?? "—")}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Suggested SKU / MPN</dt>
                          <dd className="font-mono text-admin-primary">{String(ex.suggested_sku ?? ex.suggested_mpn ?? "—")}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Suggested image (page)</dt>
                          <dd className="truncate text-admin-primary">{String(ex.suggested_image_from_page ?? "—")}</dd>
                        </div>
                        {ex.fetch_error ? (
                          <div className={cn(adminAlertSurface("warning", "sm:col-span-2 text-sm"))}>
                            Fetch note: {String(ex.fetch_error)}
                          </div>
                        ) : null}
                        {bridgeResult?.stagingId === r.id && bridgeResult.kind === "ok" ? (
                          <UrlImportBridgeSuccessBanner
                            batchId={bridgeResult.batchId ?? null}
                            catalogosBaseUrl={catalogosBaseUrl}
                            jobId={catalogosRef?.jobId ?? null}
                            className="sm:col-span-2"
                          />
                        ) : null}
                        {bridgeResult?.stagingId === r.id && bridgeResult.kind === "error" ? (
                          <div className={cn(adminAlertSurface("critical", "sm:col-span-2 text-sm"))}>
                            Bridge failed: {bridgeResult.message}
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
                      {r.review_status === "needs_review" ? (
                        <>
                          {promoteId === r.id ? (
                            <div className={cn(adminMutedPanel, "flex w-full min-w-[220px] flex-col gap-2 border-solid p-4 sm:w-auto")}>
                              <select
                                value={promoteCategory}
                                onChange={(e) => setPromoteCategory(e.target.value)}
                                className={cn(adminFormInput, "rounded-lg shadow-inner")}
                              >
                                <option value="">Category…</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              {promoteRowError?.stagingId === r.id ? (
                                <div className={adminAlertSurface("critical", "text-sm")}>
                                  <p>{promoteRowError.message}</p>
                                  {promoteRowError.existingProductId ? (
                                    <div className="mt-2 flex flex-col gap-2">
                                      <Link
                                        href={`/admin/products/${promoteRowError.existingProductId}/edit`}
                                        className={cn("font-semibold", adminLink)}
                                      >
                                        Open existing draft
                                      </Link>
                                      <button
                                        type="button"
                                        disabled={promoteBusy}
                                        onClick={() => void onPromote(r.id, true)}
                                        className={cn("text-left text-xs font-medium text-admin-secondary hover:text-admin-primary disabled:opacity-50")}
                                      >
                                        Link this staging row and open draft
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              <button
                                type="button"
                                disabled={promoteBusy}
                                onClick={() => void onPromote(r.id)}
                                className={cn(adminPrimaryButton, "text-sm")}
                              >
                                {promoteBusy ? "Working…" : "Create draft product (fallback)"}
                              </button>
                              <button
                                type="button"
                                className={cn("text-sm font-medium text-admin-muted hover:text-admin-primary")}
                                onClick={() => setPromoteId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              {catalogosRef ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={bridgeRowId === r.id}
                                    onClick={() =>
                                      void onBridgeToCatalogos(
                                        r.id,
                                        catalogosRef.jobId,
                                        catalogosRef.productId
                                      )
                                    }
                                    className={cn(adminPrimaryButton, "text-sm shadow-sm")}
                                  >
                                    {bridgeRowId === r.id ? "Bridging…" : "Bridge to CatalogOS review"}
                                  </button>
                                  {catalogosJobUrl ? (
                                    <a
                                      href={catalogosJobUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn("text-center text-xs font-semibold", adminLink)}
                                    >
                                      View URL import job in CatalogOS
                                    </a>
                                  ) : null}
                                </>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setPromoteId(r.id);
                                  setPromoteCategory("");
                                  setPromoteRowError(null);
                                }}
                                className={cn(adminSecondaryButton, "text-sm")}
                              >
                                {catalogosRef ? "Promote to draft (fallback)…" : "Promote to draft…"}
                              </button>
                              <button
                                type="button"
                                disabled={removeId === r.id}
                                onClick={() => {
                                  if (!window.confirm("Remove this staged import from the list?")) return;
                                  void onRemove(r.id);
                                }}
                                className={cn(adminSecondaryButton, "border-admin-danger/40 text-sm text-admin-danger")}
                              >
                                {removeId === r.id ? "Removing…" : "Remove import"}
                              </button>
                            </>
                          )}
                        </>
                      ) : r.created_catalog_product_id ? (
                        <div className="flex flex-col items-end gap-2">
                          <Link
                            href={`/admin/products/${r.created_catalog_product_id}/edit`}
                            className={cn(adminSecondaryButton, "text-sm", adminLink)}
                          >
                            Edit draft
                          </Link>
                          <button
                            type="button"
                            disabled={removeId === r.id}
                            onClick={() => {
                              if (!window.confirm("Remove this staged import from the list? The draft product will be kept.")) return;
                              void onRemove(r.id);
                            }}
                            className={cn(adminSecondaryButton, "text-sm")}
                          >
                            {removeId === r.id ? "Removing…" : "Remove import"}
                          </button>
                          <button
                            type="button"
                            disabled={removeId === r.id}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Remove this staged import and delete the linked draft product? This cannot be undone."
                                )
                              ) {
                                return;
                              }
                              void onRemove(r.id, true);
                            }}
                            className={cn(adminSecondaryButton, "border-admin-danger/40 text-sm text-admin-danger")}
                          >
                            {removeId === r.id ? "Removing…" : "Remove & delete draft"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

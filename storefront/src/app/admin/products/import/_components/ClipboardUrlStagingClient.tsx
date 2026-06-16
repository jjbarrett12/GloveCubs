"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClipboardStagingRow } from "@/lib/admin/clipboard-url-staging";
import type { AdminCategoryOption } from "@/lib/admin/product-form-options";
import {
  catalogosReviewDashboardUrl,
  catalogosUrlImportJobPageUrl,
  parseClipboardCatalogosStagingRef,
  storefrontUrlImportBridgeApiPath,
} from "@/lib/admin/clipboard-staging-catalogos-bridge";
import { UrlImportBridgeSuccessBanner } from "./UrlImportBridgeSuccessBanner";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

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
        className="rounded-2xl border-2 border-[#f06232]/25 bg-gradient-to-b from-white to-[#fff9f5] p-6 shadow-md ring-1 ring-[#f06232]/10"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import from URL</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Paste a product page URL to stage evidence. CatalogOS-sourced rows can bridge into catalog sync review
              (canonical publish path). Storefront draft promote remains a draft-only fallback—nothing publishes automatically.
            </p>
          </div>
          <ol className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <li className="rounded-lg border border-[#f06232]/30 bg-white px-3 py-1.5 text-[#c2410c] shadow-sm">1 · Stage</li>
            <li className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm">2 · Review</li>
            <li className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm">3 · Publish</li>
          </ol>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Product page URL</span>
            <input
              required
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://…"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Image URL (optional)</span>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… direct image"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20"
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
        <div className="mt-5">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d] disabled:opacity-50"
          >
            {submitting ? "Staging…" : "Stage for review"}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">Staged imports</h3>
          {rows.length > 0 ? (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
              />
              Select all
            </label>
          ) : null}
        </div>
        {selected.size > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
            <span className="font-medium text-slate-700">
              <span className="font-mono text-slate-900">{selected.size}</span> selected
            </span>
            <button
              type="button"
              disabled={bulkRemoving}
              onClick={() => void onBulkRemove(false)}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {bulkRemoving ? "Removing…" : "Remove selected"}
            </button>
            <button
              type="button"
              disabled={bulkRemoving}
              onClick={() => void onBulkRemove(true)}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              Remove & delete drafts
            </button>
            <button
              type="button"
              disabled={bulkRemoving}
              onClick={() => setSelected(new Set())}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Clear selection
            </button>
            {bulkRemoveError ? <span className="text-xs text-red-700">{bulkRemoveError}</span> : null}
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No staged rows yet. Paste a product URL above.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {rows.map((r) => {
              const ex = (r.extracted ?? {}) as Record<string, unknown>;
              const catalogosRef = parseClipboardCatalogosStagingRef(ex);
              const catalogosJobUrl =
                catalogosRef && catalogosBaseUrl
                  ? catalogosUrlImportJobPageUrl(catalogosBaseUrl, catalogosRef.jobId)
                  : "";
              const catalogosReviewUrl = catalogosBaseUrl
                ? catalogosReviewDashboardUrl(catalogosBaseUrl)
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
              const statusLower = r.review_status.toLowerCase();
              const statusClass =
                statusLower.includes("promot") || statusLower.includes("done") || statusLower.includes("complete")
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : statusLower.includes("review") || statusLower.includes("pending") || statusLower.includes("need")
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-slate-200 bg-slate-50 text-slate-800";

              return (
                <li key={r.id} className="py-5 first:pt-2">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex shrink-0 items-start pt-1">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select staged import ${r.id}`}
                        className="rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
                      />
                    </div>
                    <div className="shrink-0">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin-only staging preview; external URLs from validated staging
                        <img
                          src={thumb}
                          alt=""
                          className="h-20 w-20 rounded-lg border border-slate-200 bg-slate-100 object-cover shadow-sm"
                        />
                      ) : (
                        <div
                          className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-xs font-medium text-slate-500"
                          aria-hidden
                        >
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-slate-400">{r.id}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{title}</p>
                      <a
                        href={r.product_page_url}
                        className="mt-1 block break-all font-mono text-sm font-medium text-[#c2410c] hover:text-[#e5582d] hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.product_page_url}
                      </a>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}>
                          {r.review_status}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          {r.created_catalog_product_id ? "Last edited" : "Staged"}: {formatWhen(r.last_edited_at)}
                        </span>
                        {conf != null ? (
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700">
                            Confidence {(conf * 100).toFixed(0)}%
                          </span>
                        ) : null}
                        {r.image_url ? (
                          <a className="font-medium text-[#c2410c] hover:underline" href={r.image_url} target="_blank" rel="noreferrer">
                            Image URL
                          </a>
                        ) : null}
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested brand</dt>
                          <dd className="text-slate-800">{String(ex.suggested_brand ?? "—")}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested SKU / MPN</dt>
                          <dd className="font-mono text-slate-800">{String(ex.suggested_sku ?? ex.suggested_mpn ?? "—")}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested image (page)</dt>
                          <dd className="truncate text-slate-800">{String(ex.suggested_image_from_page ?? "—")}</dd>
                        </div>
                        {ex.fetch_error ? (
                          <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            Fetch note: {String(ex.fetch_error)}
                          </div>
                        ) : null}
                        {bridgeResult?.stagingId === r.id && bridgeResult.kind === "ok" ? (
                          <UrlImportBridgeSuccessBanner
                            batchId={bridgeResult.batchId ?? null}
                            catalogosBaseUrl={catalogosBaseUrl}
                            jobId={catalogosRef?.jobId ?? null}
                            className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
                          />
                        ) : null}
                        {bridgeResult?.stagingId === r.id && bridgeResult.kind === "error" ? (
                          <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                            Bridge failed: {bridgeResult.message}
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
                      {r.review_status === "needs_review" ? (
                        <>
                          {promoteId === r.id ? (
                            <div className="flex w-full min-w-[220px] flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:w-auto">
                              <select
                                value={promoteCategory}
                                onChange={(e) => setPromoteCategory(e.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20"
                              >
                                <option value="">Category…</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              {promoteRowError?.stagingId === r.id ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                                  <p>{promoteRowError.message}</p>
                                  {promoteRowError.existingProductId ? (
                                    <div className="mt-2 flex flex-col gap-2">
                                      <Link
                                        href={`/admin/products/${promoteRowError.existingProductId}/edit`}
                                        className="font-semibold text-[#c2410c] hover:underline"
                                      >
                                        Open existing draft
                                      </Link>
                                      <button
                                        type="button"
                                        disabled={promoteBusy}
                                        onClick={() => void onPromote(r.id, true)}
                                        className="text-left text-xs font-medium text-slate-700 hover:text-slate-900 disabled:opacity-50"
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
                                className="rounded-lg bg-[#f06232] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e5582d] disabled:opacity-50"
                              >
                                {promoteBusy ? "Working…" : "Create draft product (fallback)"}
                              </button>
                              <button
                                type="button"
                                className="text-sm font-medium text-slate-500 hover:text-slate-800"
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
                                    className="rounded-lg bg-[#f06232] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e5582d] disabled:opacity-50"
                                  >
                                    {bridgeRowId === r.id ? "Bridging…" : "Bridge to CatalogOS review"}
                                  </button>
                                  {catalogosJobUrl ? (
                                    <a
                                      href={catalogosJobUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-center text-xs font-semibold text-[#c2410c] hover:underline"
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
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-[#f06232]/40 hover:bg-slate-50"
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
                                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
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
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#c2410c] shadow-sm hover:border-[#f06232]/40 hover:bg-slate-50"
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
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
                            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
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

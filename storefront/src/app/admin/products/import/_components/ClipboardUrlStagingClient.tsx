"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClipboardStagingRow } from "@/lib/admin/clipboard-url-staging";
import type { AdminCategoryOption } from "@/lib/admin/product-form-options";

export function ClipboardUrlStagingClient({
  categories,
  initialRows,
}: {
  categories: AdminCategoryOption[];
  initialRows: ClipboardStagingRow[];
}) {
  const router = useRouter();
  const [productUrl, setProductUrl] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [promoteId, setPromoteId] = React.useState<string | null>(null);
  const [promoteCategory, setPromoteCategory] = React.useState("");
  const [promoteBusy, setPromoteBusy] = React.useState(false);

  const rows = initialRows;

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

  async function onPromote(stagingId: string) {
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
      const data = (await res.json().catch(() => ({}))) as { error?: string; productId?: string };
      if (!res.ok) {
        setError(data.error ?? `Promote failed (${res.status})`);
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
              Paste a product page URL to stage evidence in Supabase. Nothing publishes automatically—promote to a draft, then finish in
              the editor before going live.
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
        <h3 className="text-base font-semibold text-slate-900">Staged imports</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No staged rows yet. Paste a product URL above.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {rows.map((r) => {
              const ex = (r.extracted ?? {}) as Record<string, unknown>;
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
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested image (page)</dt>
                          <dd className="truncate text-slate-800">{String(ex.suggested_image_from_page ?? "—")}</dd>
                        </div>
                        {ex.fetch_error ? (
                          <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            Fetch note: {String(ex.fetch_error)}
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
                              <button
                                type="button"
                                disabled={promoteBusy}
                                onClick={() => void onPromote(r.id)}
                                className="rounded-lg bg-[#f06232] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e5582d] disabled:opacity-50"
                              >
                                {promoteBusy ? "Working…" : "Create draft product"}
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
                            <button
                              type="button"
                              onClick={() => {
                                setPromoteId(r.id);
                                setPromoteCategory("");
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-[#f06232]/40 hover:bg-slate-50"
                            >
                              Promote to draft…
                            </button>
                          )}
                        </>
                      ) : r.created_catalog_product_id ? (
                        <Link
                          href={`/admin/products/${r.created_catalog_product_id}/edit`}
                          className="text-sm font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline"
                        >
                          Open draft product
                        </Link>
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

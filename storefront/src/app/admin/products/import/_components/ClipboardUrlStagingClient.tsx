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
        className="rounded-xl border border-[#f06232]/35 bg-[#161616] p-5 shadow-lg ring-2 ring-[#f06232]/15"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Paste product URL</h2>
            <p className="mt-1 max-w-2xl text-xs text-neutral-400">
              Stage → review → publish: creates a staged row in Supabase with lightweight HTML evidence. Nothing is published
              automatically—promote to a draft product, then finish details in the editor before publishing.
            </p>
          </div>
          <ol className="flex shrink-0 flex-wrap gap-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            <li className="rounded border border-white/10 bg-[#0e0e0e] px-2 py-1 text-[#f06232]">1 Stage</li>
            <li className="rounded border border-white/10 bg-[#0e0e0e] px-2 py-1">2 Review</li>
            <li className="rounded border border-white/10 bg-[#0e0e0e] px-2 py-1">3 Publish</li>
          </ol>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Product page URL</span>
            <input
              required
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded-md border border-white/12 bg-[#0e0e0e] px-3 py-2.5 font-mono text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Image URL (optional)</span>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://… direct image"
              className="mt-1 w-full rounded-md border border-white/12 bg-[#0e0e0e] px-3 py-2 font-mono text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40"
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        <div className="mt-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d] disabled:opacity-50"
          >
            {submitting ? "Staging…" : "Stage for review"}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-white/10 bg-[#161616] p-5 shadow-sm ring-1 ring-white/[0.03]">
        <h3 className="text-sm font-semibold text-white">Staged clipboard imports</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No staged rows yet. Paste a product URL above.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.08]">
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
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                  : statusLower.includes("review") || statusLower.includes("pending") || statusLower.includes("need")
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-100"
                    : "border-white/15 bg-white/[0.06] text-neutral-200";

              return (
                <li key={r.id} className="py-4 first:pt-1">
                  <div className="flex flex-wrap gap-4">
                    <div className="shrink-0">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin-only staging preview; external URLs from validated staging
                        <img
                          src={thumb}
                          alt=""
                          className="h-16 w-16 rounded-md border border-white/10 bg-[#0e0e0e] object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-white/15 bg-[#0e0e0e] text-[10px] text-neutral-600"
                          aria-hidden
                        >
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] text-neutral-600">{r.id}</p>
                      <p className="mt-0.5 text-sm font-medium text-white">{title}</p>
                      <a
                        href={r.product_page_url}
                        className="mt-1 block break-all font-mono text-xs text-[#f06232] hover:text-[#ff8a5c] hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.product_page_url}
                      </a>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}
                        >
                          {r.review_status}
                        </span>
                        {conf != null ? (
                          <span className="rounded border border-white/10 bg-[#0e0e0e] px-2 py-0.5 font-mono text-[10px] text-neutral-300">
                            Confidence {(conf * 100).toFixed(0)}%
                          </span>
                        ) : null}
                        {r.image_url ? (
                          <a className="text-[#f06232] hover:underline" href={r.image_url} target="_blank" rel="noreferrer">
                            Image URL
                          </a>
                        ) : null}
                      </div>
                      <dl className="mt-2 grid gap-1 text-xs text-neutral-400 sm:grid-cols-2">
                        <div>
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">Suggested image (page)</dt>
                          <dd className="truncate text-neutral-300">{String(ex.suggested_image_from_page ?? "—")}</dd>
                        </div>
                        {ex.fetch_error ? (
                          <div className="sm:col-span-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-100">
                            Fetch note: {String(ex.fetch_error)}
                          </div>
                        ) : null}
                      </dl>
                    </div>
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
                      {r.review_status === "needs_review" ? (
                        <>
                          {promoteId === r.id ? (
                            <div className="flex w-full min-w-[200px] flex-col gap-2 rounded-lg border border-white/12 bg-[#0e0e0e] p-3 sm:w-auto">
                              <select
                                value={promoteCategory}
                                onChange={(e) => setPromoteCategory(e.target.value)}
                                className="rounded-md border border-white/12 bg-[#141414] px-2 py-1.5 text-xs text-neutral-100 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40"
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
                                className="rounded-md bg-[#f06232] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e5582d] disabled:opacity-50"
                              >
                                {promoteBusy ? "Working…" : "Create draft product"}
                              </button>
                              <button
                                type="button"
                                className="text-xs text-neutral-500 hover:text-neutral-300"
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
                              className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-neutral-100 hover:border-[#f06232]/40"
                            >
                              Promote to draft…
                            </button>
                          )}
                        </>
                      ) : r.created_catalog_product_id ? (
                        <Link
                          href={`/admin/products/${r.created_catalog_product_id}/edit`}
                          className="text-xs font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline"
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

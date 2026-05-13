"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClipboardStagingRow } from "@/lib/admin/clipboard-url-staging";
import type { AdminCategoryOption } from "@/lib/admin/product-form-options";
import { TableCard } from "@/components/admin";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function confidencePct(ex: Record<string, unknown>): string | null {
  const confRaw = ex.confidence;
  if (typeof confRaw !== "number" || !Number.isFinite(confRaw)) return null;
  const conf = confRaw > 1 ? Math.min(1, confRaw / 100) : Math.max(0, confRaw);
  return `${Math.round(conf * 100)}%`;
}

function statusBadgeClass(status: string): string {
  if (status === "needs_review") return "border-amber-200 bg-amber-50 text-amber-950";
  if (status === "converted_to_draft") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "dismissed") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export function ProductReviewQueueClient({
  rows,
  categories,
  supabaseConfigured,
}: {
  rows: ClipboardStagingRow[];
  categories: AdminCategoryOption[];
  supabaseConfigured: boolean;
}) {
  const router = useRouter();
  const [promoteId, setPromoteId] = React.useState<string | null>(null);
  const [promoteCategory, setPromoteCategory] = React.useState("");
  const [promoteBusy, setPromoteBusy] = React.useState(false);
  const [dismissId, setDismissId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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

  async function onDismiss(stagingId: string) {
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Supabase is not configured — clipboard staging queue cannot load.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      <TableCard>
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4">
          <h2 className="text-base font-semibold text-slate-900">Clipboard URL staging</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Rows from <span className="font-mono text-xs text-slate-800">catalog_v2.admin_url_clipboard_staging</span>. Promoting creates a{" "}
            <strong className="text-slate-900">draft</strong> product only — no storefront publish until you publish from the editor
            with guards satisfied.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">No staging rows yet. Paste URLs under Import from URL.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Preview</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Source type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Publish state</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-800">
                {rows.map((r) => {
                  const ex = (r.extracted ?? {}) as Record<string, unknown>;
                  const title = String(ex.suggested_name ?? ex.page_title ?? "—");
                  const thumb =
                    (typeof r.image_url === "string" && r.image_url.trim()) ||
                    (typeof ex.suggested_image_from_page === "string" && String(ex.suggested_image_from_page).trim()) ||
                    null;
                  const conf = confidencePct(ex);
                  const publishHint =
                    r.review_status === "converted_to_draft"
                      ? "Draft created — finish in editor before publish."
                      : r.review_status === "dismissed"
                        ? "Dismissed — not promoted."
                        : "Awaiting decision — not on storefront.";

                  return (
                    <tr key={r.id} className="align-top transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin staging preview; URLs validated at stage time
                          <img
                            src={thumb}
                            alt=""
                            className="h-12 w-12 rounded-lg border border-slate-200 bg-slate-100 object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                            —
                          </div>
                        )}
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <div className="line-clamp-2 font-semibold text-slate-900" title={title}>
                          {title}
                        </div>
                        {ex.fetch_error ? (
                          <div className="mt-1 text-xs text-amber-800">Fetch: {String(ex.fetch_error)}</div>
                        ) : null}
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <a
                          href={r.product_page_url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all font-mono text-xs font-medium text-[#c2410c] hover:text-[#e5582d] hover:underline"
                        >
                          {r.product_page_url}
                        </a>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-600">{conf ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">Clipboard URL</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(r.review_status)}`}
                        >
                          {r.review_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{formatWhen(r.created_at)}</td>
                      <td className="max-w-[180px] px-4 py-3 text-sm text-slate-600">{publishHint}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {r.review_status === "needs_review" ? (
                            <>
                              {promoteId === r.id ? (
                                <div className="flex w-[200px] flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
                                  <select
                                    value={promoteCategory}
                                    onChange={(e) => setPromoteCategory(e.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
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
                                    className="rounded-lg bg-[#f06232] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#e5582d] disabled:opacity-50"
                                  >
                                    {promoteBusy ? "Working…" : "Approve → draft"}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                                    onClick={() => setPromoteId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPromoteId(r.id);
                                      setPromoteCategory("");
                                    }}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-[#f06232]/40 hover:bg-[#fff7f2]"
                                  >
                                    Approve / promote…
                                  </button>
                                  <button
                                    type="button"
                                    disabled={dismissId === r.id}
                                    onClick={() => void onDismiss(r.id)}
                                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    {dismissId === r.id ? "Dismissing…" : "Dismiss"}
                                  </button>
                                  <Link
                                    href={`/admin/products/import/url`}
                                    className="text-xs font-semibold text-slate-500 hover:text-[#c2410c]"
                                  >
                                    Open URL import
                                  </Link>
                                </>
                              )}
                            </>
                          ) : r.created_catalog_product_id ? (
                            <Link
                              href={`/admin/products/${r.created_catalog_product_id}/edit`}
                              className="text-xs font-semibold text-[#c2410c] hover:underline"
                            >
                              Review / edit draft
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TableCard>
    </div>
  );
}

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
  if (status === "needs_review") return "border-amber-500/40 bg-amber-500/15 text-amber-100";
  if (status === "converted_to_draft") return "border-emerald-500/40 bg-emerald-500/15 text-emerald-100";
  if (status === "dismissed") return "border-neutral-600 bg-neutral-800 text-neutral-300";
  return "border-white/15 bg-white/[0.06] text-neutral-200";
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
      <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        Supabase is not configured — clipboard staging queue cannot load.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
      ) : null}

      <TableCard variant="dark">
        <div className="border-b border-white/10 bg-[#181818] px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Clipboard URL staging</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Rows from <span className="font-mono text-neutral-400">catalog_v2.admin_url_clipboard_staging</span>. Promoting creates a{" "}
            <strong className="text-neutral-300">draft</strong> product only — no storefront publish until you publish from the editor
            with guards satisfied.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-neutral-500">No staging rows yet. Paste URLs under Import from URL.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead className="border-b border-white/10 bg-[#181818] text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Preview</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Source type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Publish state</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] bg-[#141414] text-neutral-200">
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
                    <tr key={r.id} className="align-top hover:bg-white/[0.03]">
                      <td className="px-3 py-2">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin staging preview; URLs validated at stage time
                          <img
                            src={thumb}
                            alt=""
                            className="h-11 w-11 rounded-md border border-white/10 bg-black/40 object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-white/15 text-[9px] text-neutral-600">
                            —
                          </div>
                        )}
                      </td>
                      <td className="max-w-[200px] px-3 py-2">
                        <div className="line-clamp-2 font-medium text-white" title={title}>
                          {title}
                        </div>
                        {ex.fetch_error ? (
                          <div className="mt-1 text-[10px] text-amber-300/90">Fetch: {String(ex.fetch_error)}</div>
                        ) : null}
                      </td>
                      <td className="max-w-[220px] px-3 py-2">
                        <a
                          href={r.product_page_url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all font-mono text-[11px] text-[#f06232] hover:text-[#ff8a5c] hover:underline"
                        >
                          {r.product_page_url}
                        </a>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-neutral-400">{conf ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">Clipboard URL</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(r.review_status)}`}
                        >
                          {r.review_status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-neutral-500">{formatWhen(r.created_at)}</td>
                      <td className="max-w-[180px] px-3 py-2 text-xs text-neutral-400">{publishHint}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {r.review_status === "needs_review" ? (
                            <>
                              {promoteId === r.id ? (
                                <div className="flex w-[200px] flex-col gap-1.5 rounded-md border border-white/12 bg-[#0e0e0e] p-2 text-left">
                                  <select
                                    value={promoteCategory}
                                    onChange={(e) => setPromoteCategory(e.target.value)}
                                    className="rounded border border-white/12 bg-[#141414] px-2 py-1 text-xs text-neutral-100"
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
                                    className="rounded bg-[#f06232] px-2 py-1 text-xs font-semibold text-white hover:bg-[#e5582d] disabled:opacity-50"
                                  >
                                    {promoteBusy ? "Working…" : "Approve → draft"}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-[10px] text-neutral-500 hover:text-neutral-300"
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
                                    className="rounded border border-white/12 bg-white/[0.06] px-2 py-1 text-xs font-medium text-neutral-100 hover:border-[#f06232]/40"
                                  >
                                    Approve / promote…
                                  </button>
                                  <button
                                    type="button"
                                    disabled={dismissId === r.id}
                                    onClick={() => void onDismiss(r.id)}
                                    className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-200/90 hover:bg-red-500/10 disabled:opacity-50"
                                  >
                                    {dismissId === r.id ? "Dismissing…" : "Dismiss"}
                                  </button>
                                  <Link
                                    href={`/admin/products/import/url`}
                                    className="text-[11px] font-medium text-neutral-500 hover:text-[#f06232]"
                                  >
                                    Open URL import
                                  </Link>
                                </>
                              )}
                            </>
                          ) : r.created_catalog_product_id ? (
                            <Link
                              href={`/admin/products/${r.created_catalog_product_id}/edit`}
                              className="text-xs font-medium text-[#f06232] hover:underline"
                            >
                              Review / edit draft
                            </Link>
                          ) : (
                            <span className="text-[11px] text-neutral-600">—</span>
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

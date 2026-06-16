"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ProductListRowActions({
  productId,
  status,
}: {
  productId: string;
  status: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onDelete() {
    const live = status === "active";
    const prompt = live
      ? "This product is live/enabled. Permanently delete it from the catalog? This cannot be undone."
      : "Permanently delete this product? This cannot be undone.";
    if (!window.confirm(prompt)) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/admin/api/products/${encodeURIComponent(productId)}/delete-draft`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Delete failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Link
        href={`/admin/products/${productId}/edit`}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#c2410c] shadow-sm hover:border-[#f06232]/40 hover:bg-slate-50"
      >
        Edit
      </Link>
      <button
        type="button"
        disabled={deleting}
        onClick={() => void onDelete()}
        className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
      {error ? <p className="max-w-[140px] text-right text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

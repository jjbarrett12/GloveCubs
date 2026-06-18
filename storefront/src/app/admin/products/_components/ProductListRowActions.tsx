"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminAlertSurface, adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

const deleteButton = cn(
  adminSecondaryButton,
  "border-admin-danger/40 text-admin-danger hover:bg-[var(--admin-danger-surface)]",
);

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
    <div className="flex min-w-[9rem] flex-col items-end gap-1.5">
      <Link href={`/admin/products/${productId}/edit`} className={cn(adminSecondaryButton, "text-xs")}>
        Edit
      </Link>
      <button type="button" disabled={deleting} onClick={() => void onDelete()} className={cn(deleteButton, "text-xs")}>
        {deleting ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <p role="alert" className={cn(adminAlertSurface("critical", "w-full max-w-xs text-right text-xs leading-snug"))}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { adminFormInput, adminPrimaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { AdminVariantInventoryRow } from "@/lib/admin/admin-variant-inventory";

type Props = {
  row: AdminVariantInventoryRow | null;
  open: boolean;
  onClose: () => void;
};

export function InventoryAdjustModal({ row, open, onClose }: Props) {
  const router = useRouter();
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  React.useEffect(() => {
    if (open) {
      setDelta("");
      setReason("");
      setMsg(null);
    }
  }, [open, row?.catalog_variant_id]);

  if (!open || !row) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = parseInt(delta, 10);
    if (!Number.isFinite(d) || d === 0) {
      setMsg({ kind: "err", text: "Enter a non-zero integer delta." });
      return;
    }
    if (!reason.trim()) {
      setMsg({ kind: "err", text: "Reason is required." });
      return;
    }
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/admin/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog_variant_id: row!.catalog_variant_id,
          delta: d,
          reason: reason.trim(),
          location_code: row!.location_code,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setMsg({ kind: "err", text: j.error ?? res.statusText });
        return;
      }
      setMsg({ kind: "ok", text: "Adjustment recorded." });
      router.refresh();
      onClose();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Adjust failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-admin-border-subtle bg-admin-surface p-4 shadow-lg">
        <h2 className="text-base font-semibold text-admin-primary">Adjust inventory</h2>
        <p className="mt-1 text-xs text-admin-muted">
          {row.variant_sku}
          {row.size_code ? ` · ${row.size_code}` : ""} — on hand {row.quantity_on_hand}, reserved{" "}
          {row.quantity_reserved}
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-admin-muted">Delta (+ add, − subtract)</label>
            <input
              type="number"
              step={1}
              className={cn(adminFormInput, "mt-1 w-full")}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              disabled={pending}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-admin-muted">Reason (required)</label>
            <input
              className={cn(adminFormInput, "mt-1 w-full")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              placeholder="Cycle count, damage, return…"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pending} className={adminPrimaryButton}>
              {pending ? "Saving…" : "Apply adjustment"}
            </button>
            <button type="button" onClick={onClose} disabled={pending} className="text-sm text-admin-muted hover:text-admin-primary">
              Cancel
            </button>
          </div>
          {msg ? (
            <p className={cn("text-xs", msg.kind === "ok" ? "text-admin-success" : "text-admin-danger")}>{msg.text}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

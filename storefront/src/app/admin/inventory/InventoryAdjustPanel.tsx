"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { adminFormInput, adminPrimaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Props = {
  productId: string;
  sku: string;
  name: string;
  onHand: number;
};

export function InventoryAdjustPanel({ productId, sku, name, onHand }: Props) {
  const router = useRouter();
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = parseInt(delta, 10);
    if (!Number.isFinite(d) || d === 0) {
      setMsg({ kind: "err", text: "Enter a non-zero integer delta (+ add, − subtract)." });
      return;
    }
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/admin/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          delta: d,
          reason: reason.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        const text = j.error ? (j.code ? `${j.error} (${j.code})` : j.error) : res.statusText;
        setMsg({ kind: "err", text });
        return;
      }
      setMsg({ kind: "ok", text: "Stock adjusted." });
      setDelta("");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Adjust failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-2 flex flex-wrap items-end gap-2 border-t border-admin-border-subtle pt-2">
      <span className="w-full text-xs text-admin-muted">
        Adjust <span className="font-medium text-admin-primary">{sku}</span> — {name} (on hand: {onHand})
      </span>
      <div>
        <label className="block text-[10px] font-medium text-admin-muted">Delta</label>
        <input
          type="number"
          step="1"
          className={cn(adminFormInput, "mt-0.5 w-24")}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          disabled={pending}
          placeholder="+10"
        />
      </div>
      <div className="min-w-[140px] flex-1">
        <label className="block text-[10px] font-medium text-admin-muted">Reason</label>
        <input
          className={cn(adminFormInput, "mt-0.5 w-full")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          placeholder="Recv PO, damage…"
        />
      </div>
      <button type="submit" disabled={pending} className={adminPrimaryButton}>
        {pending ? "…" : "Apply"}
      </button>
      {msg ? (
        <span className={cn("text-xs", msg.kind === "ok" ? "text-admin-success" : "text-admin-danger")}>{msg.text}</span>
      ) : null}
    </form>
  );
}

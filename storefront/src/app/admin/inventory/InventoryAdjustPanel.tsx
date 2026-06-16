"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={(e) => void submit(e)} className="mt-2 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-2">
      <span className="w-full text-xs text-gray-500">
        Adjust <span className="font-medium text-gray-800">{sku}</span> — {name} (on hand: {onHand})
      </span>
      <div>
        <label className="block text-[10px] font-medium text-gray-500">Delta</label>
        <input
          type="number"
          step="1"
          className="mt-0.5 w-24 rounded border border-gray-300 px-2 py-1 text-sm"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          disabled={pending}
          placeholder="+10"
        />
      </div>
      <div className="min-w-[140px] flex-1">
        <label className="block text-[10px] font-medium text-gray-500">Reason</label>
        <input
          className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          placeholder="Recv PO, damage…"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "…" : "Apply"}
      </button>
      {msg ? (
        <span className={`text-xs ${msg.kind === "ok" ? "text-green-800" : "text-red-700"}`}>{msg.text}</span>
      ) : null}
    </form>
  );
}

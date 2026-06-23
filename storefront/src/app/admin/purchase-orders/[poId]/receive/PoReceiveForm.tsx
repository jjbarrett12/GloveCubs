"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFormInput, adminPrimaryButton, adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { PoLineVariantCandidate } from "@/lib/fulfillment/po-line-variant-resolution";
import { poLinesReadyForWarehouseReceive } from "@/lib/fulfillment/po-line-variant-resolution";

type LineState = {
  line_index: number;
  catalog_variant_id: string | null;
  sku?: string;
  name?: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_remaining: number;
  receive_now: string;
  damaged: string;
  bin_location: string;
  notes: string;
  needs_sku_assignment: boolean;
  candidate_variants: PoLineVariantCandidate[];
  selected_variant_id: string;
  quantity_uom: string;
};

type Props = {
  poId: number;
  poNumber: string;
  lines: LineState[];
};

export function PoReceiveForm({ poId, poNumber, lines: initialLines }: Props) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initialLines);
  const [receiptNotes, setReceiptNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [assigning, setAssigning] = React.useState<number | null>(null);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const ready = poLinesReadyForWarehouseReceive(
    rows.map((r) => ({
      line_index: r.line_index,
      line: {},
      catalog_variant_id: r.catalog_variant_id,
      needs_sku_assignment: r.needs_sku_assignment,
      auto_assignable_variant_id: null,
      candidate_variants: r.candidate_variants,
    })),
  );

  function updateRow(index: number, patch: Partial<LineState>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function assignVariant(lineIndex: number, variantId: string) {
    setAssigning(lineIndex);
    setMsg(null);
    try {
      const res = await fetch(`/admin/api/purchase-orders/${poId}/assign-variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_index: lineIndex, catalog_variant_id: variantId }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ kind: "err", text: j.error ?? res.statusText });
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.line_index === lineIndex
            ? {
                ...r,
                catalog_variant_id: variantId,
                needs_sku_assignment: false,
                selected_variant_id: variantId,
                sku: r.candidate_variants.find((c) => c.catalog_variant_id === variantId)?.variant_sku ?? r.sku,
              }
            : r,
        ),
      );
      router.refresh();
    } finally {
      setAssigning(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) {
      setMsg({ kind: "err", text: "Assign SKU/variant on every line before receiving." });
      return;
    }

    const payload = rows
      .filter((r) => r.catalog_variant_id)
      .map((r) => ({
        catalog_variant_id: r.catalog_variant_id!,
        quantity_received: Math.max(0, parseInt(r.receive_now, 10) || 0),
        quantity_damaged: Math.max(0, parseInt(r.damaged, 10) || 0),
        bin_location: r.bin_location.trim() || undefined,
        notes: r.notes.trim() || undefined,
      }))
      .filter((l) => l.quantity_received > 0 || (l.quantity_damaged ?? 0) > 0);

    if (payload.length === 0) {
      setMsg({ kind: "err", text: "Enter case quantities received and/or damaged for at least one line." });
      return;
    }

    setPending(true);
    setMsg(null);
    try {
      const res = await fetch(`/admin/api/purchase-orders/${poId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: payload,
          idempotency_key: `receive-${poId}-${Date.now()}`,
          receipt_notes: receiptNotes.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setMsg({ kind: "err", text: j.error ? (j.code ? `${j.error} (${j.code})` : j.error) : res.statusText });
        return;
      }
      router.push("/admin/inventory?tab=warehouse");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Receive failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <p className="text-sm text-admin-secondary">
        Inbound PO <span className="font-medium text-admin-primary">{poNumber}</span> — quantities are{" "}
        <strong>sellable cases</strong>. Receipts post to variant warehouse inventory only.
      </p>

      <div className="overflow-x-auto rounded-md border border-admin-border-subtle">
        <table className="min-w-[1040px] w-full text-sm">
          <thead className="bg-admin-surface-raised text-left text-xs text-admin-muted">
            <tr>
              {["SKU / assign", "Ordered (cases)", "Received", "Receive now", "Damaged", "Bin", "Notes"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.line_index} className="border-t border-admin-border-subtle align-top">
                <td className="px-3 py-2">
                  {r.needs_sku_assignment ? (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-admin-danger">Needs SKU assignment</span>
                      {r.name ? <span className="block text-xs text-admin-muted">{r.name}</span> : null}
                      <select
                        className={cn(adminFormInput, "w-full text-xs")}
                        value={r.selected_variant_id}
                        onChange={(e) => updateRow(i, { selected_variant_id: e.target.value })}
                        disabled={assigning !== null}
                      >
                        <option value="">Select variant…</option>
                        {r.candidate_variants.map((c) => (
                          <option key={c.catalog_variant_id} value={c.catalog_variant_id}>
                            {c.variant_sku}{c.size_code ? ` (${c.size_code})` : ""}
                          </option>
                        ))}
                      </select>
                      {r.candidate_variants.length === 1 ? (
                        <button
                          type="button"
                          className={adminSecondaryButton}
                          disabled={assigning !== null}
                          onClick={() => void assignVariant(r.line_index, r.candidate_variants[0]!.catalog_variant_id)}
                        >
                          Assign {r.candidate_variants[0]!.variant_sku}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={adminSecondaryButton}
                          disabled={!r.selected_variant_id || assigning !== null}
                          onClick={() => void assignVariant(r.line_index, r.selected_variant_id)}
                        >
                          {assigning === r.line_index ? "Assigning…" : "Assign SKU"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <span className="font-mono text-xs">{r.sku || r.catalog_variant_id?.slice(0, 8)}</span>
                      {r.name ? <span className="block text-xs text-admin-muted">{r.name}</span> : null}
                    </>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.quantity_ordered}</td>
                <td className="px-3 py-2 tabular-nums">{r.quantity_received}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    max={r.quantity_remaining}
                    className={cn(adminFormInput, "w-20")}
                    value={r.receive_now}
                    onChange={(e) => updateRow(i, { receive_now: e.target.value })}
                    disabled={pending || r.needs_sku_assignment || r.quantity_remaining <= 0}
                    placeholder={String(r.quantity_remaining)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    className={cn(adminFormInput, "w-20")}
                    value={r.damaged}
                    onChange={(e) => updateRow(i, { damaged: e.target.value })}
                    disabled={pending || r.needs_sku_assignment}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className={cn(adminFormInput, "w-24")}
                    value={r.bin_location}
                    onChange={(e) => updateRow(i, { bin_location: e.target.value })}
                    disabled={pending || r.needs_sku_assignment}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className={cn(adminFormInput, "w-full min-w-[120px]")}
                    value={r.notes}
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    disabled={pending || r.needs_sku_assignment}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <label className="block text-xs font-medium text-admin-muted">Receipt notes (optional)</label>
        <textarea className={cn(adminFormInput, "mt-1 w-full max-w-xl")} rows={2} value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} disabled={pending} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !ready} className={adminPrimaryButton}>
          {pending ? "Receiving…" : "Receive warehouse shipment (cases)"}
        </button>
        <Link href="/admin/inventory?tab=incoming" className={adminSecondaryButton}>Cancel</Link>
      </div>

      {msg ? <p className={cn("text-xs", msg.kind === "ok" ? "text-admin-success" : "text-admin-danger")}>{msg.text}</p> : null}
    </form>
  );
}

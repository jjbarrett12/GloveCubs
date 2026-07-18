"use client";

import * as React from "react";
import { adminFormInput, adminFormLabel, adminPrimaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export type VariantFulfillmentRow = {
  id: string;
  variantSku: string;
  sizeCode: string | null;
  fulfillmentMode: "stocked" | "dropship";
  inventoryVisibility: "hidden" | "status" | "quantity";
  stockEnforcement: boolean;
  reorderPoint: number;
  defaultBinLocation: string | null;
};

type Props = {
  productId: string;
  variants: VariantFulfillmentRow[];
};

export function VariantFulfillmentPanel({ productId, variants }: Props) {
  const active = variants.filter((v) => v.id);
  if (active.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-admin-primary">Fulfillment (per SKU)</h3>
        <p className="text-xs text-admin-muted">
          GloveCubs-manufactured variants use <strong>stocked</strong> (warehouse cases). Third-party variants stay{" "}
          <strong>dropship</strong>. Inventory visibility defaults to hidden on storefront.
        </p>
      </div>
      {active.map((v) => (
        <VariantFulfillmentRowEditor key={v.id} productId={productId} row={v} />
      ))}
    </div>
  );
}

function VariantFulfillmentRowEditor({ productId, row }: { productId: string; row: VariantFulfillmentRow }) {
  const [mode, setMode] = React.useState(row.fulfillmentMode);
  const [visibility, setVisibility] = React.useState(row.inventoryVisibility);
  const [enforce, setEnforce] = React.useState(row.stockEnforcement);
  const [reorder, setReorder] = React.useState(String(row.reorderPoint || 0));
  const [bin, setBin] = React.useState(row.defaultBinLocation ?? "");
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function save() {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch(`/admin/api/products/${productId}/variants/${row.id}/fulfillment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fulfillment_mode: mode,
          inventory_visibility: visibility,
          stock_enforcement: enforce,
          reorder_point: mode === "stocked" ? parseInt(reorder, 10) || 0 : 0,
          default_bin_location: mode === "stocked" ? bin.trim() || null : null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg(j.error ?? res.statusText);
        return;
      }
      setMsg("Saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("rounded-lg border border-admin-border-subtle p-3 text-sm")}>
      <div className="font-mono text-xs text-admin-primary">
        {row.variantSku}
        {row.sizeCode ? ` · ${row.sizeCode}` : ""}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className={adminFormLabel}>Fulfillment mode</span>
          <select className={cn(adminFormInput, "mt-1 w-full")} value={mode} onChange={(e) => setMode(e.target.value as "stocked" | "dropship")} disabled={pending}>
            <option value="dropship">Dropship (third-party)</option>
            <option value="stocked">Stocked (GloveCubs warehouse)</option>
          </select>
        </label>
        <label className="block">
          <span className={adminFormLabel}>Storefront visibility</span>
          <select className={cn(adminFormInput, "mt-1 w-full")} value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} disabled={pending}>
            <option value="hidden">Hidden (default)</option>
            <option value="status">Status only</option>
            <option value="quantity">Quantity (explicit)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} disabled={pending} />
          <span className="text-xs text-admin-secondary">Stock enforcement (off by default)</span>
        </label>
        {mode === "stocked" ? (
          <>
            <label className="block">
              <span className={adminFormLabel}>Reorder point (cases)</span>
              <input type="number" min={0} className={cn(adminFormInput, "mt-1 w-full")} value={reorder} onChange={(e) => setReorder(e.target.value)} disabled={pending} />
            </label>
            <label className="block">
              <span className={adminFormLabel}>Default bin</span>
              <input className={cn(adminFormInput, "mt-1 w-full")} value={bin} onChange={(e) => setBin(e.target.value)} disabled={pending} />
            </label>
          </>
        ) : null}
      </div>
      <button type="button" className={cn(adminPrimaryButton, "mt-2")} disabled={pending} onClick={() => void save()}>
        {pending ? "Saving…" : "Save fulfillment"}
      </button>
      {msg ? <p className="mt-1 text-xs text-admin-muted">{msg}</p> : null}
    </div>
  );
}

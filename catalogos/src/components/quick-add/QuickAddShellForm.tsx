"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COST_SOURCE_TYPE_LABELS,
  COST_SOURCE_TYPES,
  LANDED_CASE_COST_HINT,
  LANDED_CASE_COST_LABEL,
  parseCostSourceType,
  type CostSourceType,
} from "@/lib/pricing/landed-cost-provenance";

export interface QuickAddShellFormProps {
  mode: "create" | "edit";
  suppliers: { id: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
  initial?: {
    supplier_id: string;
    sku: string;
    name: string;
    category_slug: string;
    normalized_case_cost: string;
    cost_source_type?: string;
    cost_source_reference?: string;
    landed_cost_trusted?: boolean;
  };
  disabled?: boolean;
  onCreate?: (values: {
    supplier_id: string;
    sku: string;
    name: string;
    category_slug: string;
    normalized_case_cost: number;
    cost_source_type: CostSourceType;
    cost_source_reference?: string | null;
  }) => Promise<void>;
  onSaveCore?: (values: {
    sku: string;
    name: string;
    category_slug: string;
    normalized_case_cost: number;
    cost_source_type: CostSourceType;
    cost_source_reference?: string | null;
  }) => Promise<void>;
}

export function QuickAddShellForm({
  mode,
  suppliers,
  categories,
  initial,
  disabled,
  onCreate,
  onSaveCore,
}: QuickAddShellFormProps) {
  const [supplierId, setSupplierId] = useState(initial?.supplier_id ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [categorySlug, setCategorySlug] = useState(initial?.category_slug ?? "");
  const [caseCost, setCaseCost] = useState(initial?.normalized_case_cost ?? "");
  const [sourceType, setSourceType] = useState(initial?.cost_source_type ?? "");
  const [sourceReference, setSourceReference] = useState(initial?.cost_source_reference ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const cost = parseFloat(caseCost);
    if (!Number.isFinite(cost) || cost < 0) {
      setErr("Landed case cost must be a valid non-negative number.");
      return;
    }
    const parsedType = parseCostSourceType(sourceType);
    if (!parsedType) {
      setErr("Select how this landed case cost was obtained.");
      return;
    }
    if (mode === "create") {
      if (!supplierId) {
        setErr("Select a supplier.");
        return;
      }
      if (!onCreate) return;
      setBusy(true);
      try {
        await onCreate({
          supplier_id: supplierId,
          sku,
          name,
          category_slug: categorySlug,
          normalized_case_cost: cost,
          cost_source_type: parsedType,
          cost_source_reference: sourceReference.trim() || null,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Create failed");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!onSaveCore) return;
    setBusy(true);
    try {
      await onSaveCore({
        sku,
        name,
        category_slug: categorySlug,
        normalized_case_cost: cost,
        cost_source_type: parsedType,
        cost_source_reference: sourceReference.trim() || null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4 max-w-xl">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Product basics</h2>
        <p className="text-xs text-muted-foreground mt-1">Case-only catalog: enter landed case cost, not a public list price.</p>
      </div>
      {mode === "create" ? (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Supplier</label>
          <select
            className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={supplierId}
            disabled={disabled || busy}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Supplier SKU</label>
          <Input className="h-9 text-sm font-mono" value={sku} disabled={disabled || busy} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Category</label>
          <select
            className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={categorySlug}
            disabled={disabled || busy}
            onChange={(e) => setCategorySlug(e.target.value)}
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name} ({c.slug})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Display name</label>
        <Input className="h-9 text-sm" value={name} disabled={disabled || busy} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5 max-w-xs">
        <label className="text-xs text-muted-foreground">{LANDED_CASE_COST_LABEL}</label>
        <Input
          className="h-9 text-sm"
          type="number"
          step="0.0001"
          min={0}
          value={caseCost}
          disabled={disabled || busy}
          onChange={(e) => setCaseCost(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">{LANDED_CASE_COST_HINT}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Cost source</label>
          <select
            className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={sourceType}
            disabled={disabled || busy}
            onChange={(e) => setSourceType(e.target.value)}
          >
            <option value="">Select source…</option>
            {COST_SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {COST_SOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Cost source reference</label>
          <Input
            className="h-9 text-sm"
            value={sourceReference}
            disabled={disabled || busy}
            onChange={(e) => setSourceReference(e.target.value)}
            placeholder="Quote 2026-09-14"
          />
        </div>
      </div>
      {initial?.landed_cost_trusted === false ? (
        <p className="text-xs text-destructive">
          This cost is not yet trusted as landed case cost. Confirm the number, source, and reference, then save.
        </p>
      ) : null}
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      <Button type="button" disabled={disabled || busy} onClick={() => void submit()}>
        {busy ? "…" : mode === "create" ? "Create draft" : "Save basics"}
      </Button>
    </div>
  );
}

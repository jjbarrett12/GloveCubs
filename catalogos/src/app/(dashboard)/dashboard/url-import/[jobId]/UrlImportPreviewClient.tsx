"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { UrlImportProductRow } from "@/lib/url-import/admin-data";

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function firstImageUrl(payload: Record<string, unknown>): string | null {
  const imgs = payload.images;
  if (Array.isArray(imgs)) {
    for (const x of imgs) {
      const s = String(x).trim();
      if (s.startsWith("http://") || s.startsWith("https://")) return s;
    }
  }
  const u = payload.image_url;
  if (typeof u === "string") {
    const t = u.trim();
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
  }
  return null;
}

function skuOrItem(p: UrlImportProductRow): string {
  const pl = p.normalized_payload ?? {};
  return (
    str(pl.sku) ||
    str(pl.supplier_sku) ||
    str(pl.item_number) ||
    str(pl.id) ||
    p.inferred_base_sku ||
    "—"
  );
}

function descriptionFrom(pl: Record<string, unknown>): string {
  return (
    str(pl.description) ||
    str(pl.long_description) ||
    str(pl.short_description) ||
    str(pl.name) ||
    str(pl.title) ||
    str(pl.product_name) ||
    "—"
  );
}

function uomFrom(pl: Record<string, unknown>): string {
  return str(pl.uom) || str(pl.sell_uom) || str(pl.unit) || str(pl.pack_uom) || "—";
}

function colorFrom(pl: Record<string, unknown>): string {
  const attrs = pl.attributes;
  if (attrs && typeof attrs === "object" && attrs !== null && "color" in attrs) {
    const c = (attrs as Record<string, unknown>).color;
    if (str(c)) return str(c);
  }
  return str(pl.color) || "—";
}

function thicknessFrom(pl: Record<string, unknown>): string {
  const t = pl.thickness_mil ?? pl.thickness;
  if (typeof t === "number" && Number.isFinite(t)) return `${t} mil`;
  const s = str(t);
  return s || "—";
}

function keyAttributesSummary(p: UrlImportProductRow): string {
  const pl = p.normalized_payload ?? {};
  const parts: string[] = [];
  const m = str(pl.material);
  if (m) parts.push(`material: ${m}`);
  const size = str(p.inferred_size) || str(pl.size);
  if (size) parts.push(`size: ${size}`);
  const grade = str(pl.grade) || str(pl.glove_type);
  if (grade) parts.push(`grade: ${grade}`);
  if (pl.powder_free === true) parts.push("powder-free");
  const bq = str(pl.box_qty);
  const cq = str(pl.case_qty);
  if (bq) parts.push(`box: ${bq}`);
  if (cq) parts.push(`case: ${cq}`);
  return parts.length ? parts.join(" · ") : "—";
}

export function UrlImportPreviewClient({
  jobId,
  products,
}: {
  jobId: string;
  products: UrlImportProductRow[];
}) {
  const router = useRouter();
  const [bridging, setBridging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(products.map((p) => p.id))
  );
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el || products.length === 0) return;
    const n = selectedIds.size;
    el.indeterminate = n > 0 && n < products.length;
  }, [selectedIds, products.length]);

  function selectAll() {
    setSelectedIds(new Set(products.map((p) => p.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function toggleHeaderCheckbox() {
    if (selectedIds.size === products.length) deselectAll();
    else selectAll();
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApproveForImport() {
    setError(null);
    const product_ids = [...selectedIds];
    if (product_ids.length === 0) {
      setError("Select at least one product to import.");
      return;
    }
    setBridging(true);
    try {
      const res = await fetch(`/api/admin/url-import/${jobId}/bridge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bridge failed");
      router.push(`/dashboard/batches/${data.batchId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bridge failed");
    } finally {
      setBridging(false);
    }
  }

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        No extracted products for this job. Nothing to import.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">Review extracted products</h2>
          <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
            Select all
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={deselectAll}>
            Deselect all
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleApproveForImport}
            disabled={bridging || selectedIds.size === 0}
          >
            {bridging ? "Importing…" : `Import selected (${selectedIds.size})`}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 p-2 text-left">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={products.length > 0 && selectedIds.size === products.length}
                    onChange={toggleHeaderCheckbox}
                    aria-label="Select or deselect all products"
                  />
                </th>
                <th className="text-left p-3 font-medium">Image</th>
                <th className="text-left p-3 font-medium">SKU / item #</th>
                <th className="text-left p-3 font-medium min-w-[160px]">Description</th>
                <th className="text-left p-3 font-medium">UOM</th>
                <th className="text-left p-3 font-medium">Color</th>
                <th className="text-left p-3 font-medium">Thickness</th>
                <th className="text-left p-3 font-medium min-w-[180px]">Key attributes</th>
                <th className="text-left p-3 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const pl = p.normalized_payload ?? {};
                const img = firstImageUrl(pl);
                const conf =
                  typeof p.confidence === "number" && Number.isFinite(p.confidence)
                    ? `${Math.round(p.confidence * 100)}%`
                    : "—";
                return (
                  <tr key={p.id} className="border-b border-border hover:bg-muted/40">
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleRow(p.id)}
                        aria-label={`Select product ${skuOrItem(p)}`}
                      />
                    </td>
                    <td className="p-2 align-top w-[72px]">
                      {img ? (
                        <img
                          src={img}
                          alt=""
                          className="h-14 w-14 rounded border border-border object-contain bg-muted"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 align-top font-mono text-xs max-w-[120px] break-all">
                      {skuOrItem(p)}
                    </td>
                    <td className="p-3 align-top max-w-[280px]">
                      <span className="line-clamp-3" title={descriptionFrom(pl)}>
                        {descriptionFrom(pl)}
                      </span>
                    </td>
                    <td className="p-3 align-top text-xs">{uomFrom(pl)}</td>
                    <td className="p-3 align-top text-xs">{colorFrom(pl)}</td>
                    <td className="p-3 align-top text-xs">{thicknessFrom(pl)}</td>
                    <td className="p-3 align-top text-xs text-muted-foreground max-w-[240px]">
                      <span className="line-clamp-2" title={keyAttributesSummary(p)}>
                        {keyAttributesSummary(p)}
                      </span>
                    </td>
                    <td className="p-3 align-top text-xs">{conf}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { applyStagedSkuProposalsAction } from "@/app/actions/review-sku";
import { getCatalogOsSkuProposals, type CatalogOsSkuProposalsV1 } from "@/lib/sku-intelligence/types";
import { SKU_PROPOSAL_SAFE_CONFIDENCE } from "@glove-sku-intelligence";
import { cn } from "@/lib/utils";

function confidenceBadge(conf: number | null | undefined) {
  if (conf == null || !Number.isFinite(conf)) return "Review";
  return conf >= SKU_PROPOSAL_SAFE_CONFIDENCE ? "High" : "Review";
}

export function StagedSkuProposalPanel({
  normalizedId,
  normalizedData,
  onApplied,
}: {
  normalizedId: string;
  normalizedData: Record<string, unknown>;
  onApplied?: () => void;
}) {
  const proposals = React.useMemo(
    () => getCatalogOsSkuProposals(normalizedData),
    [normalizedData]
  );
  const [busy, setBusy] = React.useState(false);
  const [confirmReplace, setConfirmReplace] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  if (!proposals?.proposed_parent_sku && (proposals?.variants?.length ?? 0) === 0) {
    return null;
  }

  async function apply(overwrite: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await applyStagedSkuProposalsAction(normalizedId, { overwrite });
      if (!r.success) {
        setMessage(r.error ?? "Apply failed");
        return;
      }
      setConfirmReplace(false);
      setMessage("SKU proposals applied to staging.");
      onApplied?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[#f06232]/25 bg-[#fffaf7] p-3 space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">GLV SKU proposals</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Manufacturer SKUs remain evidence only — GloveCubs SKUs apply on safe fill or confirmed replace.
        </p>
      </div>

      <div className="text-[11px] space-y-1">
        <p>
          <span className="text-muted-foreground">Parent proposal: </span>
          <span className="font-mono font-medium">{proposals?.proposed_parent_sku ?? "—"}</span>
          {proposals?.parent_confidence != null ? (
            <span
              className={cn(
                "ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                proposals.parent_confidence >= SKU_PROPOSAL_SAFE_CONFIDENCE
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-900"
              )}
            >
              {confidenceBadge(proposals.parent_confidence)}
            </span>
          ) : null}
        </p>
        {proposals?.applied_parent_sku ? (
          <p className="text-emerald-700">
            Applied parent: <span className="font-mono">{proposals.applied_parent_sku}</span>
          </p>
        ) : null}
        {(proposals?.parent_warnings?.length ?? 0) > 0 ? (
          <ul className="list-inside list-disc text-amber-800">
            {proposals!.parent_warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {(proposals?.variants?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-[10px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pr-2 py-1">Size</th>
                <th className="pr-2 py-1">Manufacturer</th>
                <th className="pr-2 py-1">GloveCubs</th>
                <th className="py-1">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {proposals!.variants.map((row) => (
                <tr key={`${row.size_code}-${row.manufacturer_sku}`} className="font-mono">
                  <td className="pr-2 py-0.5">{row.size_code ?? "—"}</td>
                  <td className="pr-2 py-0.5">{row.manufacturer_sku ?? "—"}</td>
                  <td className="pr-2 py-0.5">{row.proposed_glovecubs_sku ?? "—"}</td>
                  <td className="py-0.5">{confidenceBadge(row.confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => apply(false)}
          className="rounded border border-[#f06232]/40 bg-white px-2.5 py-1 text-[10px] font-semibold text-[#c2410c] hover:bg-[#fff7f3] disabled:opacity-50"
        >
          Apply SKU proposals (empty only)
        </button>
        {!confirmReplace ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmReplace(true)}
            className="rounded border border-amber-400 bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
          >
            Replace existing SKUs…
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => apply(true)}
            className="rounded border border-red-400 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
          >
            Confirm replace SKUs
          </button>
        )}
      </div>
      {message ? <p className="text-[11px] text-muted-foreground">{message}</p> : null}
    </div>
  );
}

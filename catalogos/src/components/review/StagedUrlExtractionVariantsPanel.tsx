"use client";

import type { ProductUrlExtractionV2, ProductUrlExtractionV2Summary } from "@/lib/product-extraction/types";
import { formatConfidencePct, formatTrustLabel } from "@/lib/review/staging-review-evidence";

function fmt(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

export function StagedUrlExtractionVariantsPanel({
  summary,
  full,
}: {
  summary: ProductUrlExtractionV2Summary;
  full: ProductUrlExtractionV2 | null;
}) {
  if (!full) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variants</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
          <div>
            <p className="text-muted-foreground text-[10px]">Proposed variants</p>
            <p className="font-medium">{summary.proposedVariantCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[10px]">Dimensions</p>
            <p className="font-medium">
              {summary.variantDimensions.length > 0 ? summary.variantDimensions.join(", ") : "—"}
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Detailed variant evidence is available on the family anchor row.
        </p>
        {summary.proposedVariantCount <= 1 && summary.variantDimensions.length === 0 ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Single-family only — no multi-dimension variant evidence detected.
          </p>
        ) : null}
      </div>
    );
  }

  const variants = full.variants ?? { dimensions: [], options: [], proposedVariants: [], unresolvedVariantNotes: [] };
  const dimensions = variants.dimensions ?? [];
  const proposed = variants.proposedVariants ?? [];
  const notes = variants.unresolvedVariantNotes ?? [];
  const singleFamilyOnly = summary.proposedVariantCount <= 1 && dimensions.length === 0;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variants</p>

      {dimensions.length > 0 ? (
        <div className="rounded-md border border-border overflow-hidden text-[11px]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/40 text-left border-b border-border">
                <th className="p-2 font-medium">Dimension</th>
                <th className="p-2 font-medium">Options</th>
                <th className="p-2 font-medium whitespace-nowrap">Conf.</th>
                <th className="p-2 font-medium">Trust</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((d) => (
                <tr key={d.name} className="border-b border-border/60 last:border-0 align-top">
                  <td className="p-2 font-mono">{d.name}</td>
                  <td className="p-2">{d.options.length > 0 ? d.options.join(", ") : "—"}</td>
                  <td className="p-2 whitespace-nowrap">{formatConfidencePct(d.confidence)}</td>
                  <td className="p-2">{formatTrustLabel(d.trust)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No variant dimensions detected.</p>
      )}

      {proposed.length > 0 ? (
        <div className="rounded-md border border-border overflow-hidden text-[11px]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted/40 text-left border-b border-border">
                <th className="p-2 font-medium">Size</th>
                <th className="p-2 font-medium">Color</th>
                <th className="p-2 font-medium">Material</th>
                <th className="p-2 font-medium">Pack</th>
                <th className="p-2 font-medium">Mfr SKU</th>
                <th className="p-2 font-medium">Supplier SKU</th>
                <th className="p-2 font-medium whitespace-nowrap">Conf.</th>
                <th className="p-2 font-medium">Trust</th>
              </tr>
            </thead>
            <tbody>
              {proposed.map((v, i) => (
                <tr key={v.sourceVariantId ?? `${v.size ?? ""}-${i}`} className="border-b border-border/60 last:border-0 align-top">
                  <td className="p-2 font-mono">{fmt(v.size)}</td>
                  <td className="p-2">{fmt(v.color)}</td>
                  <td className="p-2">{fmt(v.material)}</td>
                  <td className="p-2">{fmt(v.pack)}</td>
                  <td className="p-2 font-mono">{fmt(v.manufacturerSku)}</td>
                  <td className="p-2 font-mono">{fmt(v.supplierSku)}</td>
                  <td className="p-2 whitespace-nowrap">{formatConfidencePct(v.confidence)}</td>
                  <td className="p-2">{formatTrustLabel(v.trust)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No proposed variants from URL.</p>
      )}

      {notes.length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      {singleFamilyOnly ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          Single-family only — no multi-dimension variant evidence detected.
        </p>
      ) : null}
    </div>
  );
}

"use client";

import * as React from "react";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import type { EditorVariantRow } from "@/lib/admin/variant-generation";
import { variantReadinessIssues } from "@/lib/admin/variant-generation";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import { proposeVariantsFromImport } from "@/lib/admin/variant-generation";

type Props = {
  variants: EditorVariantRow[];
  quoteOnly: boolean;
  importDraft: ImportDraftProductV1 | null;
  onChange: (variants: EditorVariantRow[]) => void;
};

export function VariantSizeMatrix({ variants, quoteOnly, importDraft, onChange }: Props) {
  const issues = variantReadinessIssues(variants);
  const hasOs = variants.some((v) => v.sizeCode.trim().toUpperCase() === "OS");
  const [confirmOsReplace, setConfirmOsReplace] = React.useState(false);

  function patch(i: number, patch: Partial<EditorVariantRow>) {
    onChange(variants.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange([...variants, { sizeCode: "", variantSku: "", listPrice: "" }]);
  }

  function removeRow(i: number) {
    if (variants.length <= 1) return;
    onChange(variants.filter((_, idx) => idx !== i));
  }

  function generateFromImport(replaceOs: boolean) {
    if (!importDraft) return;
    const proposal = proposeVariantsFromImport(importDraft, variants, { replaceOs });
    onChange(proposal.proposed);
    setConfirmOsReplace(false);
  }

  return (
    <PremiumSectionCard title="Variants & pricing" description="Size truth lives on catalog_variants.size_code." dense>
      <div className="mb-3 flex flex-wrap gap-2">
        {importDraft && importDraft.variants.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => generateFromImport(false)}
              className="rounded-lg border border-[#f06232]/30 bg-[#fff7f2] px-3 py-1.5 text-xs font-semibold text-[#c2410c] hover:bg-[#f06232]/15"
            >
              Generate from import ({importDraft.variants.length} sizes)
            </button>
            {hasOs ? (
              <button
                type="button"
                onClick={() => setConfirmOsReplace(true)}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                Replace OS with import sizes
              </button>
            ) : null}
          </>
        ) : null}
        <button type="button" onClick={addRow} className="text-xs font-semibold text-[#c2410c] hover:underline">
          + Add size
        </button>
      </div>

      {confirmOsReplace ? (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="font-medium">Replace OS variant with sizes from import evidence?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => generateFromImport(true)}
              className="rounded bg-amber-800 px-2 py-1 text-[11px] font-semibold text-white"
            >
              Confirm replace
            </button>
            <button type="button" onClick={() => setConfirmOsReplace(false)} className="text-[11px] font-medium underline">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <ul className="mb-3 space-y-1 text-xs text-amber-800">
          {issues.map((issue) => (
            <li key={issue}>⚠ {issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">SKU</th>
              <th className="px-2 py-2">List price</th>
              <th className="px-2 py-2 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {variants.map((row, i) => (
              <tr key={row.id ?? `new-${i}`} className="bg-white">
                <td className="px-2 py-1.5">
                  <input
                    value={row.sizeCode}
                    onChange={(e) => patch(i, { sizeCode: e.target.value })}
                    placeholder="M"
                    className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs uppercase"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={row.variantSku}
                    onChange={(e) => patch(i, { variantSku: e.target.value })}
                    placeholder="Auto"
                    className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-[11px]"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={row.listPrice}
                    onChange={(e) => patch(i, { listPrice: e.target.value })}
                    disabled={quoteOnly}
                    className="w-full rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={variants.length <= 1}
                    className="text-[10px] font-medium text-slate-500 hover:text-red-600 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PremiumSectionCard>
  );
}

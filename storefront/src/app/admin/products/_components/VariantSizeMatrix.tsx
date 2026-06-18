"use client";

import * as React from "react";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import {
  adminAlertSurface,
  adminFormInput,
  adminLink,
  adminMutedPanel,
  adminPrimaryButton,
  adminSecondaryButton,
  adminTableBody,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { EditorVariantRow } from "@/lib/admin/variant-generation";
import {
  hasManualManufacturerSkuEdits,
  hasManualVariantSkuEdits,
  proposeVariantsFromImport,
  sortVariantsByGloveSize,
  variantReadinessIssues,
  type ManufacturerSkuSource,
} from "@/lib/admin/variant-generation";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";

type Props = {
  variants: EditorVariantRow[];
  quoteOnly: boolean;
  importDraft: ImportDraftProductV1 | null;
  onChange: (variants: EditorVariantRow[]) => void;
};

function manufacturerSkuStatusLabel(source?: ManufacturerSkuSource, needsReview?: boolean): string {
  if (needsReview || source === "missing") return "missing / needs review";
  if (source === "imported") return "imported";
  if (source === "derived") return "derived";
  if (source === "manual") return "manual";
  return "—";
}

const cellInput = cn(adminFormInput, "w-full rounded px-2 py-1 shadow-inner");

export function VariantSizeMatrix({ variants, quoteOnly, importDraft, onChange }: Props) {
  const issues = variantReadinessIssues(variants);
  const hasOs = variants.some((v) => v.sizeCode.trim().toUpperCase() === "OS");
  const [confirmOsReplace, setConfirmOsReplace] = React.useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = React.useState(false);

  function patch(i: number, patch: Partial<EditorVariantRow>) {
    onChange(variants.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange(sortVariantsByGloveSize([...variants, { sizeCode: "", variantSku: "", listPrice: "" }]));
  }

  function removeRow(i: number) {
    if (variants.length <= 1) return;
    onChange(variants.filter((_, idx) => idx !== i));
  }

  function generateFromImport(replaceOs: boolean, preserveManualSkus = true) {
    if (!importDraft) return;
    const proposal = proposeVariantsFromImport(importDraft, variants, { replaceOs, preserveManualSkus });
    onChange(proposal.proposed);
    setConfirmOsReplace(false);
    setConfirmRegenerate(false);
  }

  function requestGenerateFromImport(replaceOs: boolean) {
    if (hasManualManufacturerSkuEdits(variants) || hasManualVariantSkuEdits(variants)) {
      setConfirmRegenerate(true);
      return;
    }
    generateFromImport(replaceOs);
  }

  return (
    <PremiumSectionCard title="Variants & pricing" description="Size truth lives on catalog_variants.size_code." dense>
      {importDraft ? (
        <p className="mb-3 text-[11px] text-admin-secondary">
          Manufacturer SKU is the supplier/manufacturer&apos;s SKU. GloveCubs SKU is our internal catalog SKU.
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {importDraft && importDraft.variants.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => requestGenerateFromImport(false)}
              className={cn(adminSecondaryButton, "text-xs")}
            >
              Generate from import ({importDraft.variants.length} sizes)
            </button>
            {hasOs ? (
              <button
                type="button"
                onClick={() => setConfirmOsReplace(true)}
                className={cn(adminSecondaryButton, "border-admin-warning/40 text-admin-warning text-xs")}
              >
                Replace OS with import sizes
              </button>
            ) : null}
          </>
        ) : null}
        <button type="button" onClick={() => onChange(sortVariantsByGloveSize(variants))} className={cn(adminSecondaryButton, "text-xs")}>
          Re-sort sizes
        </button>
        <button type="button" onClick={addRow} className={cn("text-xs font-semibold", adminLink)}>
          + Add size
        </button>
      </div>

      {confirmRegenerate ? (
        <div className={cn(adminAlertSurface("warning", "mb-3 text-xs"))}>
          <p className="font-medium">Re-generate will overwrite non-manual SKUs. Manual manufacturer and GloveCubs SKU edits are preserved.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => generateFromImport(false, true)} className={cn(adminPrimaryButton, "text-[11px]")}>
              Confirm re-generate
            </button>
            <button type="button" onClick={() => setConfirmRegenerate(false)} className={cn("text-[11px] font-medium", adminLink)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {confirmOsReplace ? (
        <div className={cn(adminAlertSurface("warning", "mb-3 text-xs"))}>
          <p className="font-medium">Replace OS variant with sizes from import evidence?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => generateFromImport(true)} className={cn(adminPrimaryButton, "text-[11px]")}>
              Confirm replace
            </button>
            <button type="button" onClick={() => setConfirmOsReplace(false)} className={cn("text-[11px] font-medium", adminLink)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <ul className="mb-3 space-y-1 text-xs text-admin-warning">
          {issues.map((issue) => (
            <li key={issue}>⚠ {issue}</li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-admin-border">
        <table className="min-w-full text-left text-xs">
          <thead className={cn(adminTableHead, "border-b border-admin-border")}>
            <tr>
              <th className={cn(adminTableHeadCell, "px-2 py-2")}>Size</th>
              <th className={cn(adminTableHeadCell, "px-2 py-2")}>GloveCubs SKU</th>
              {importDraft ? <th className={cn(adminTableHeadCell, "px-2 py-2")}>Manufacturer SKU</th> : null}
              <th className={cn(adminTableHeadCell, "px-2 py-2")}>List price</th>
              <th className={cn(adminTableHeadCell, "w-16 px-2 py-2")} />
            </tr>
          </thead>
          <tbody className={adminTableBody}>
            {variants.map((row, i) => {
              const draftVar = importDraft?.variants.find(
                (v) => v.normalized_size_code.trim().toUpperCase() === row.sizeCode.trim().toUpperCase(),
              );
              const proposedSku = draftVar?.proposed_glovecubs_sku ?? null;
              const showApplyProposal =
                proposedSku &&
                !row.variantSku.trim() &&
                (draftVar?.sku_proposal_confidence ?? importDraft?.sku_proposal_confidence ?? 0) >= 0.7;
              const mfrStatus = manufacturerSkuStatusLabel(row.manufacturerSkuSource, row.manufacturerSkuNeedsReview);
              const sizeMeta =
                draftVar?.size_source && draftVar.size_confidence != null
                  ? `${draftVar.size_source} · ${Math.round(draftVar.size_confidence * 100)}%`
                  : null;
              return (
                <tr key={row.id ?? `new-${i}`} className={adminTableRowHover}>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.sizeCode}
                      onChange={(e) => patch(i, { sizeCode: e.target.value })}
                      placeholder="M"
                      className={cn(cellInput, "font-mono text-xs uppercase")}
                    />
                    {sizeMeta ? <p className="mt-0.5 text-[9px] text-admin-muted">{sizeMeta}</p> : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={row.variantSku}
                      onChange={(e) => patch(i, { variantSku: e.target.value })}
                      placeholder={proposedSku ?? "Auto"}
                      className={cn(cellInput, "font-mono text-[11px]")}
                    />
                    {showApplyProposal ? (
                      <button
                        type="button"
                        onClick={() => patch(i, { variantSku: proposedSku! })}
                        className={cn("mt-0.5 text-[9px] font-semibold", adminLink)}
                      >
                        Apply {proposedSku}
                      </button>
                    ) : null}
                  </td>
                  {importDraft ? (
                    <td className="px-2 py-1.5">
                      <input
                        value={row.manufacturerSku ?? ""}
                        onChange={(e) =>
                          patch(i, {
                            manufacturerSku: e.target.value,
                            manufacturerSkuSource: "manual",
                            manufacturerSkuNeedsReview: false,
                          })
                        }
                        placeholder={draftVar?.manufacturer_sku ?? draftVar?.source_sku ?? "N105ORFM"}
                        className={cn(cellInput, "font-mono text-[11px]")}
                      />
                      <p className="mt-0.5 text-[9px] text-admin-muted">{mfrStatus}</p>
                    </td>
                  ) : null}
                  <td className="px-2 py-1.5">
                    <input
                      value={row.listPrice}
                      onChange={(e) => patch(i, { listPrice: e.target.value })}
                      disabled={quoteOnly}
                      className={cn(cellInput, "disabled:opacity-40")}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      disabled={variants.length <= 1}
                      className="text-[10px] font-medium text-admin-muted hover:text-admin-danger disabled:opacity-30"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PremiumSectionCard>
  );
}

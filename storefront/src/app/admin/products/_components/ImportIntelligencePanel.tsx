"use client";

import * as React from "react";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import {
  adminAlertSurface,
  adminCardSurface,
  adminLink,
  adminMutedPanel,
  adminPrimaryButton,
  adminSecondaryButton,
  adminStatusBadgeClasses,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import type { CommercePackagingV1 } from "@commerce-packaging/types";
import {
  applySuggestionToPatch,
  buildFilterSyncApplyPatch,
  buildImportFieldSuggestions,
  buildSafeApplyAllPatch,
  buildSkuProposalApplyPatch,
  detectFilterSyncGaps,
  filterSafeSuggestions,
  mapImportDraftToAttributes,
  type ImportApplyPatch,
  type ImportFieldSuggestion,
} from "@/lib/admin/import-suggestion-mapper";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import type { EditorVariantRow } from "@/lib/admin/variant-generation";
import {
  deriveSkuProposalsFromImportDraft,
  isSafeGloveCubsSkuProposal,
  SKU_PROPOSAL_SAFE_CONFIDENCE,
} from "@/lib/admin/variant-sku-intelligence";

export type { ImportApplyPatch };

type Props = {
  draft: ImportDraftProductV1 | null;
  sourceUrl: string | null;
  parserVersion: string | null;
  definitions: AttributeDefinitionRow[];
  currentAttributes: Record<string, string | string[]>;
  currentVariants: EditorVariantRow[];
  currentInternalSku?: string;
  commercePackaging?: CommercePackagingV1 | null;
  currentIdentity: {
    name: string;
    brandName: string;
    description: string;
    primaryImageUrl: string;
  };
  onApply: (patch: ImportApplyPatch) => void;
};

export function ImportIntelligencePanel({
  draft,
  sourceUrl,
  parserVersion,
  definitions,
  currentAttributes,
  currentVariants,
  currentInternalSku = "",
  commercePackaging = null,
  currentIdentity,
  onApply,
}: Props) {
  const allowedByKey = React.useMemo(
    () => new Map(definitions.map((d) => [d.attributeKey, d.allowedValues])),
    [definitions]
  );

  const existingState = React.useMemo(
    () => ({
      identity: currentIdentity,
      attributes: currentAttributes,
      variants: currentVariants,
    }),
    [currentIdentity, currentAttributes, currentVariants]
  );

  const variantEvidence = React.useMemo(() => {
    if (!draft?.variants.length) return null;
    const codes = draft.variants.map((v) => v.normalized_size_code).filter(Boolean);
    const mfrCount = draft.variants.filter((v) => v.manufacturer_sku?.trim()).length;
    const sources = Array.from(
      new Set(draft.variants.map((v) => v.size_source).filter(Boolean) as string[])
    );
    const fallbackOnly = sources.length === 1 && sources[0] === "text_fallback";
    const warnings = draft.parse_warnings.filter(
      (w) => /size options came from text fallback/i.test(w) || /multiple sizes/i.test(w)
    );
    return { codes, mfrCount, sources, fallbackOnly, warnings };
  }, [draft]);

  const skuProposals = React.useMemo(
    () => (draft ? deriveSkuProposalsFromImportDraft(draft) : null),
    [draft]
  );
  const skuApplySafe = skuProposals ? isSafeGloveCubsSkuProposal(skuProposals) : false;
  const [confirmReplaceSkus, setConfirmReplaceSkus] = React.useState(false);
  const [lastSkuApplySkipped, setLastSkuApplySkipped] = React.useState<number | null>(null);

  if (!sourceUrl && !draft) return null;

  const suggestions = draft ? buildImportFieldSuggestions(draft) : [];
  const safe = filterSafeSuggestions(suggestions);
  const skipped = draft ? mapImportDraftToAttributes(draft, allowedByKey).skipped : [];
  const missingFilters = draft
    ? detectFilterSyncGaps(draft, currentAttributes, allowedByKey, commercePackaging)
    : [];
  const applicableSafeCount = draft
    ? buildSafeApplyAllPatch(draft, allowedByKey, safe, currentVariants, { existing: existingState })
        .appliedCount
    : 0;

  function applySkuProposals(overwriteExisting = false) {
    if (!draft) return;
    const { patch, applied, skippedCount } = buildSkuProposalApplyPatch(
      draft,
      currentInternalSku,
      currentVariants,
      { overwriteExisting }
    );
    setLastSkuApplySkipped(skippedCount);
    if (applied) onApply(patch);
    if (overwriteExisting) setConfirmReplaceSkus(false);
  }

  function applyFilterSync(gapKey?: string) {
    if (!draft) return;
    const { patch, applied } = buildFilterSyncApplyPatch(
      draft,
      currentAttributes,
      allowedByKey,
      commercePackaging,
      gapKey
    );
    if (applied) onApply(patch);
  }

  function applySuggestion(s: ImportFieldSuggestion) {
    if (!draft) return;
    const { patch, applied } = applySuggestionToPatch(draft, allowedByKey, s, currentVariants, {
      replaceOs: false,
    });
    if (applied) onApply(patch);
  }

  function applyAllSafe() {
    if (!draft) return;
    const { patch, appliedCount } = buildSafeApplyAllPatch(draft, allowedByKey, safe, currentVariants, {
      existing: existingState,
    });
    if (appliedCount === 0) return;
    onApply(patch);
  }

  return (
    <PremiumSectionCard title="Import intelligence" dense>
      <dl className="grid gap-2 text-xs">
        {sourceUrl ? (
          <div>
            <dt className="font-semibold text-admin-muted">Source URL</dt>
            <dd className="break-all font-mono text-[11px] text-admin-secondary">{sourceUrl}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold text-admin-muted">Parser</dt>
          <dd className="text-admin-secondary">{parserVersion ?? "—"}</dd>
        </div>
      </dl>

      {!draft ? (
        <p className="mt-3 text-sm text-admin-muted">No linked staging draft. Re-import via review queue to refresh evidence.</p>
      ) : (
        <>
          {skuProposals?.parent_sku.value ? (
            <div className={cn(adminCardSurface, "mt-3 border-admin-accent/20 px-3 py-2.5 text-xs text-admin-secondary")}>
              <p className="font-semibold text-admin-primary">SKU proposals</p>
              <p className="mt-1">
                Parent:{" "}
                <span className="font-mono font-medium">{skuProposals.parent_sku.value}</span>
                <span
                  className={cn(
                    "ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1",
                    skuProposals.parent_sku.confidence >= SKU_PROPOSAL_SAFE_CONFIDENCE
                      ? adminStatusBadgeClasses("success")
                      : adminStatusBadgeClasses("warning"),
                  )}
                >
                  {skuProposals.parent_sku.confidence >= SKU_PROPOSAL_SAFE_CONFIDENCE ? "High" : "Review"}
                </span>
              </p>
              <p className="mt-0.5 text-admin-muted">
                Source: {skuProposals.parent_sku.source.replace(/_/g, " ")} ·{" "}
                {Math.round(skuProposals.parent_sku.confidence * 100)}%
              </p>
              {skuProposals.variants.length > 0 ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-[10px]">
                    <thead>
                      <tr className="text-left text-admin-muted">
                        <th className="pr-2 py-1">Size</th>
                        <th className="pr-2 py-1">Manufacturer</th>
                        <th className="pr-2 py-1">GloveCubs</th>
                        <th className="py-1">Conf.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skuProposals.variants.map((row) => (
                        <tr key={row.size_code} className="font-mono">
                          <td className="pr-2 py-0.5">{row.size_code}</td>
                          <td className="pr-2 py-0.5">{row.manufacturer_sku ?? "—"}</td>
                          <td className="pr-2 py-0.5">{row.proposed_glovecubs_sku ?? "—"}</td>
                          <td className="py-0.5">
                            {row.confidence >= SKU_PROPOSAL_SAFE_CONFIDENCE ? "High" : "Review"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applySkuProposals(false)}
                  disabled={!skuApplySafe}
                  className={cn(adminPrimaryButton, "border border-admin-accent/30 bg-admin-accent-soft text-[11px] text-admin-accent hover:opacity-90 disabled:opacity-40")}
                >
                  Apply SKU proposals
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReplaceSkus(true)}
                  disabled={!skuApplySafe}
                  className={cn(adminSecondaryButton, "text-[11px] disabled:opacity-40")}
                >
                  Replace existing SKU values
                </button>
              </div>
              {lastSkuApplySkipped != null && lastSkuApplySkipped > 0 ? (
                <p className="mt-1 text-[10px] text-admin-muted">
                  {lastSkuApplySkipped} SKU field{lastSkuApplySkipped === 1 ? "" : "s"} already had values and were not overwritten.
                </p>
              ) : null}
              {!skuApplySafe ? (
                <p className="mt-1 text-[10px] text-admin-warning">Review required before auto-apply</p>
              ) : null}
              {confirmReplaceSkus ? (
                <div className={adminAlertSurface("warning", "mt-2 text-[11px]")}>
                  <p className="font-medium">
                    This changes GloveCubs internal SKUs. Manufacturer SKUs will remain preserved separately.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => applySkuProposals(true)}
                      className={cn(adminPrimaryButton, "text-[10px]")}
                    >
                      Confirm replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReplaceSkus(false)}
                      className={cn("text-[10px] font-medium", adminLink)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {variantEvidence && variantEvidence.codes.length > 0 ? (
            <div className={cn(adminCardSurface, "mt-3 px-3 py-2.5 text-xs text-admin-secondary")}>
              <p className="font-semibold text-admin-primary">Variant evidence</p>
              <p className="mt-1">
                Sizes detected:{" "}
                <span className="font-mono font-medium">{variantEvidence.codes.join(", ")}</span>
              </p>
              {variantEvidence.sources.length > 0 ? (
                <p className="mt-0.5 text-admin-muted">
                  Source: {variantEvidence.sources.join(", ").replace(/_/g, " ")}
                </p>
              ) : null}
              <p className="mt-0.5 text-admin-muted">
                Manufacturer SKUs detected: {variantEvidence.mfrCount}
              </p>
              {variantEvidence.fallbackOnly || variantEvidence.warnings.length > 0 ? (
                <ul className="mt-1.5 list-inside list-disc text-admin-warning">
                  {variantEvidence.fallbackOnly ? (
                    <li>Size options came from text fallback — review before publish</li>
                  ) : null}
                  {variantEvidence.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {missingFilters.length > 0 ? (
            <div className={adminAlertSurface("warning", "mt-3 text-xs")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Missing storefront filter fields</p>
                <button
                  type="button"
                  onClick={() => applyFilterSync()}
                  className={cn(adminSecondaryButton, "shrink-0 text-[10px]")}
                >
                  Apply all filter sync
                </button>
              </div>
              <ul className="mt-1.5 space-y-1">
                {missingFilters.map((m) => (
                  <li key={m.key} className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <span className="font-medium">{m.label}</span> — source: &quot;{m.sourceValue}&quot; · storefront:{" "}
                      {m.storefrontValue || "empty"} · {m.recommendedAction}
                    </span>
                    <button
                      type="button"
                      onClick={() => applyFilterSync(m.key)}
                      className={cn(adminSecondaryButton, "shrink-0 text-[10px]")}
                    >
                      Apply
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyAllSafe}
              disabled={applicableSafeCount === 0}
              className="rounded-lg bg-admin-accent-soft px-3 py-1.5 text-xs font-semibold text-admin-accent hover:bg-admin-accent/20 disabled:opacity-40"
            >
              Apply all safe ({applicableSafeCount})
            </button>
          </div>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pb-24 md:pb-4">
            {suggestions.map((s) => {
              const isSafe = safe.some((x) => x.id === s.id);
              const isMissingFilter =
                s.target === "attributes" &&
                s.applyKey &&
                missingFilters.some((m) => m.key === s.applyKey);
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2",
                    isMissingFilter
                      ? "border-admin-warning/30 bg-[var(--admin-warning-surface)]"
                      : cn(adminCardSurface, "border-admin-border-subtle"),
                  )}
                >
                  <div className="min-w-0 text-xs">
                    <p className="font-semibold text-admin-primary">
                      {s.label}
                      {isMissingFilter ? (
                        <span className={cn("ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1", adminStatusBadgeClasses("warning"))}>
                          Filter gap
                        </span>
                      ) : null}
                      {!isSafe ? (
                        <span className={cn("ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1", adminStatusBadgeClasses("neutral"))}>
                          Low confidence
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-admin-secondary">{String(s.value)}</p>
                    <p className="mt-0.5 text-[10px] text-admin-muted">
                      {Math.round(s.confidence * 100)}% · {s.source}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className={cn(adminSecondaryButton, "shrink-0 text-[10px]")}
                  >
                    Apply
                  </button>
                </li>
              );
            })}
          </ul>
          {skipped.length > 0 ? (
            <div className={cn(adminMutedPanel, "mt-3 border-solid px-2.5 py-2 text-[11px] text-admin-secondary")}>
              <p className="font-semibold text-admin-primary">Skipped</p>
              <ul className="mt-1 list-inside list-disc">
                {skipped.map((s, i) => (
                  <li key={i}>
                    {s.field}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </PremiumSectionCard>
  );
}

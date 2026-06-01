"use client";

import * as React from "react";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import {
  applySuggestionToPatch,
  buildImportFieldSuggestions,
  buildSafeApplyAllPatch,
  detectMissingImportFilterAttributes,
  filterSafeSuggestions,
  mapImportDraftToAttributes,
  type ImportApplyPatch,
  type ImportFieldSuggestion,
} from "@/lib/admin/import-suggestion-mapper";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import type { EditorVariantRow } from "@/lib/admin/variant-generation";

export type { ImportApplyPatch };

type Props = {
  draft: ImportDraftProductV1 | null;
  sourceUrl: string | null;
  parserVersion: string | null;
  definitions: AttributeDefinitionRow[];
  currentAttributes: Record<string, string | string[]>;
  currentVariants: EditorVariantRow[];
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

  if (!sourceUrl && !draft) return null;

  const suggestions = draft ? buildImportFieldSuggestions(draft) : [];
  const safe = filterSafeSuggestions(suggestions);
  const skipped = draft ? mapImportDraftToAttributes(draft, allowedByKey).skipped : [];
  const missingFilters = draft
    ? detectMissingImportFilterAttributes(draft, currentAttributes, allowedByKey)
    : [];
  const applicableSafeCount = draft
    ? buildSafeApplyAllPatch(draft, allowedByKey, safe, currentVariants, { existing: existingState })
        .appliedCount
    : 0;

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
    <PremiumSectionCard title="Import intelligence" dense className="border-[#f06232]/15 bg-gradient-to-b from-[#fffaf7] to-white">
      <dl className="grid gap-2 text-xs">
        {sourceUrl ? (
          <div>
            <dt className="font-semibold text-slate-500">Source URL</dt>
            <dd className="break-all font-mono text-[11px] text-slate-700">{sourceUrl}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold text-slate-500">Parser</dt>
          <dd>{parserVersion ?? "—"}</dd>
        </div>
      </dl>

      {!draft ? (
        <p className="mt-3 text-sm text-slate-500">No linked staging draft. Re-import via review queue to refresh evidence.</p>
      ) : (
        <>
          {missingFilters.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
              <p className="font-semibold">Missing storefront filter fields</p>
              <ul className="mt-1.5 space-y-1">
                {missingFilters.map((m) => (
                  <li key={m.key}>
                    <span className="font-medium">{m.label}</span> — import has &quot;{m.importValue}&quot; but product_attributes is empty
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
              className="rounded-lg bg-[#f06232]/10 px-3 py-1.5 text-xs font-semibold text-[#c2410c] hover:bg-[#f06232]/20 disabled:opacity-40"
            >
              Apply all safe ({applicableSafeCount})
            </button>
          </div>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {suggestions.map((s) => {
              const isSafe = safe.some((x) => x.id === s.id);
              const isMissingFilter =
                s.target === "attributes" &&
                s.applyKey &&
                missingFilters.some((m) => m.key === s.applyKey);
              return (
                <li
                  key={s.id}
                  className={`flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 ${
                    isMissingFilter
                      ? "border-amber-300 bg-amber-50/80"
                      : "border-slate-100 bg-white"
                  }`}
                >
                  <div className="min-w-0 text-xs">
                    <p className="font-semibold text-slate-800">
                      {s.label}
                      {isMissingFilter ? (
                        <span className="ml-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                          Filter gap
                        </span>
                      ) : null}
                      {!isSafe ? (
                        <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">
                          Low confidence
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-slate-600">{String(s.value)}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {Math.round(s.confidence * 100)}% · {s.source}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="shrink-0 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Apply
                  </button>
                </li>
              );
            })}
          </ul>
          {skipped.length > 0 ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
              <p className="font-semibold text-slate-700">Skipped</p>
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

"use client";

import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateNormalizedAttributes } from "@/app/actions/review";
import { isMultiSelectAttribute } from "@/lib/catalogos/attribute-validation";

export interface AttributeRequirementsState {
  required: string[];
  stronglyPreferred: string[];
  allowedByKey: Record<string, string[]>;
}

interface SuggestedNotAppliedRow {
  key: string;
  reason: "below_threshold" | "already_set";
  value: unknown;
}

interface StagingAttributePanelProps {
  normalizedId: string;
  /** Server `updated_at` — when it changes, drafts reset from `stagingAttributes`. */
  detailUpdatedAt: string;
  /** From parent staging detail (`detail.attributes`); single source with review API payload. */
  stagingAttributes: Record<string, unknown>;
  /** `normalized_data.facet_parse_meta` — merge honesty + parser notes. */
  facetParseMeta?: Record<string, unknown> | null;
  /** When true and there is no active extraction summary, show how to refresh auto-extract. */
  facetExtractionRefreshHint?: boolean;
  attributeRequirements: AttributeRequirementsState;
  disabled?: boolean;
  onAfterSave: () => Promise<void>;
  onError: (msg: string) => void;
}

function formatReason(reason: SuggestedNotAppliedRow["reason"]): string {
  if (reason === "below_threshold") {
    return "Below auto-apply confidence — not written to merchandising fields. Enter manually if correct.";
  }
  return "This field already had a value — extractor did not overwrite it.";
}

export function StagingAttributePanel({
  normalizedId,
  detailUpdatedAt,
  stagingAttributes,
  facetParseMeta,
  facetExtractionRefreshHint = false,
  attributeRequirements,
  disabled,
  onAfterSave,
  onError,
}: StagingAttributePanelProps) {
  const [attrDraft, setAttrDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const attrs = stagingAttributes ?? {};
    const draft: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
      draft[k] = Array.isArray(v) ? (v as string[]).join(", ") : String(v ?? "");
    }
    setAttrDraft(draft);
  }, [normalizedId, detailUpdatedAt, stagingAttributes]);

  function parseAttrValue(key: string, raw: string): unknown {
    const t = raw.trim();
    if (!t) return "";
    if (isMultiSelectAttribute(key)) return t.split(/,\s*/).filter(Boolean);
    return t;
  }

  const { required, stronglyPreferred, allowedByKey } = attributeRequirements;

  const facetIssues =
    facetParseMeta && Array.isArray(facetParseMeta.issues)
      ? (facetParseMeta.issues as unknown[]).filter(
          (x): x is { code: string; message: string } =>
            x != null && typeof x === "object" && typeof (x as { code?: unknown }).code === "string"
        )
      : [];

  const appliedKeys =
    facetParseMeta && Array.isArray(facetParseMeta.applied_keys)
      ? (facetParseMeta.applied_keys as unknown[]).filter((k): k is string => typeof k === "string")
      : [];

  const suggestedNotApplied: SuggestedNotAppliedRow[] =
    facetParseMeta && Array.isArray(facetParseMeta.suggested_not_applied)
      ? (facetParseMeta.suggested_not_applied as unknown[]).flatMap((row) => {
          if (!row || typeof row !== "object") return [];
          const o = row as { key?: unknown; reason?: unknown; value?: unknown };
          if (typeof o.key !== "string") return [];
          const reason = o.reason === "below_threshold" || o.reason === "already_set" ? o.reason : null;
          if (!reason) return [];
          return [{ key: o.key, reason, value: o.value }];
        })
      : [];

  /** Include v1 extraction keys so “Suggested / Applied” rows always have a matching editor on this screen. */
  const attributeEditorKeys = (() => {
    const s = new Set<string>();
    required.forEach((k) => s.add(k));
    stronglyPreferred.forEach((k) => s.add(k));
    Object.keys(allowedByKey).forEach((k) => s.add(k));
    Object.keys(attrDraft).forEach((k) => s.add(k));
    appliedKeys.forEach((k) => s.add(k));
    suggestedNotApplied.forEach((row) => s.add(row.key));
    return Array.from(s).sort();
  })();

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 max-w-xl">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Merchandising attributes</h2>
        <p className="text-xs text-muted-foreground mt-1">Values are validated against the category dictionary. Multi-value keys: comma-separated.</p>
      </div>
      {facetExtractionRefreshHint && appliedKeys.length === 0 && suggestedNotApplied.length === 0 && facetIssues.length === 0 ? (
        <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-2 py-1.5">
          Facet extraction summaries refresh when you save product basics (name, SKU, category, cost), or after import creates a row.
        </p>
      ) : null}
      {facetIssues.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-100">
          <p className="font-medium">Parser notes</p>
          <ul className="list-disc pl-4 mt-1 space-y-0.5">
            {facetIssues.map((it, idx) => (
              <li key={`${it.code}-${idx}`}>{it.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {appliedKeys.length > 0 ? (
        <div className="rounded-md border border-emerald-600/30 bg-emerald-600/5 px-2 py-1.5 text-xs">
          <p className="font-medium text-muted-foreground">Applied automatically (v1)</p>
          <p className="text-muted-foreground mt-0.5">
            These values were written into empty merchandising fields on the last extract/save. They match the fields below.
          </p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            {appliedKeys.map((k) => (
              <Fragment key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono">
                  {Array.isArray(stagingAttributes[k])
                    ? (stagingAttributes[k] as string[]).join(", ")
                    : String(stagingAttributes[k] ?? "")}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ) : null}
      {suggestedNotApplied.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
          <p className="font-medium text-muted-foreground">Suggested, not applied (v1)</p>
          <p className="text-muted-foreground mt-0.5">
            The parser found these values but did not write them to merchandising fields (see each line). Use the editors below if you want them on the product.
          </p>
          <ul className="mt-1 space-y-2">
            {suggestedNotApplied.map((row) => (
              <li key={row.key} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div className="font-mono text-foreground">
                  {row.key}:{" "}
                  {Array.isArray(row.value) ? (row.value as string[]).join(", ") : String(row.value ?? "")}
                </div>
                <div className="text-muted-foreground mt-0.5">{formatReason(row.reason)}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {attributeEditorKeys.map((key) => {
          const allowed = allowedByKey[key];
          const val = attrDraft[key] ?? "";
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">{key}</label>
              {allowed && allowed.length > 0 ? (
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                  value={val}
                  disabled={disabled || busy}
                  onChange={(e) => setAttrDraft((d) => ({ ...d, [key]: e.target.value }))}
                >
                  <option value="">(empty)</option>
                  {allowed.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  {val && !allowed.includes(val) ? (
                    <option value={val}>
                      {val} (current)
                    </option>
                  ) : null}
                </select>
              ) : (
                <Input
                  className="h-8 text-sm"
                  value={val}
                  disabled={disabled || busy}
                  onChange={(e) => setAttrDraft((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={isMultiSelectAttribute(key) ? "a, b, c" : ""}
                />
              )}
            </div>
          );
        })}
        {attributeEditorKeys.length === 0 ? <p className="text-sm text-muted-foreground">No dictionary keys yet — pick a category above.</p> : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          const payload: Record<string, unknown> = {};
          for (const k of attributeEditorKeys) {
            payload[k] = parseAttrValue(k, attrDraft[k] ?? "");
          }
          const r = await updateNormalizedAttributes(normalizedId, payload);
          setBusy(false);
          if (!r.success) onError(r.error ?? "Save failed");
          else await onAfterSave();
        }}
      >
        {busy ? "Saving…" : "Save attributes"}
      </Button>
    </div>
  );
}

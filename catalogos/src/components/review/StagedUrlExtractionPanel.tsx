"use client";

import { useMemo } from "react";
import type { FieldEvidence, ProductUrlExtractionV2 } from "@/lib/product-extraction/types";
import {
  formatConfidencePct,
  formatFieldEvidenceValue,
  formatTrustLabel,
  resolveUrlExtractionReviewContext,
} from "@/lib/review/staging-review-evidence";
import { StagedUrlExtractionImagesPanel } from "@/components/review/StagedUrlExtractionImagesPanel";
import { StagedUrlExtractionReadinessPanel } from "@/components/review/StagedUrlExtractionReadinessPanel";
import { StagedUrlExtractionVariantsPanel } from "@/components/review/StagedUrlExtractionVariantsPanel";

function fmtDisplay(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function fmtNum(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

function isFieldEvidence(v: unknown): v is FieldEvidence<unknown> {
  return v != null && typeof v === "object" && "value" in v && "confidence" in v;
}

function EvidenceRow({ label, evidence }: { label: string; evidence: unknown }) {
  if (!isFieldEvidence(evidence)) return null;
  const meta = [
    formatTrustLabel(evidence.trust),
    formatConfidencePct(evidence.confidence),
    evidence.source,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="space-y-0.5 border-t border-border/40 pt-2 first:border-0 first:pt-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-[11px] font-medium">{formatFieldEvidenceValue(evidence)}</p>
      {meta ? <p className="text-[10px] text-muted-foreground font-mono">{meta}</p> : null}
      {evidence.quote?.trim() ? (
        <p className="text-[10px] text-muted-foreground italic break-all">&ldquo;{evidence.quote.trim()}&rdquo;</p>
      ) : null}
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-medium text-[11px]">{fmtDisplay(value)}</p>
    </div>
  );
}

function PackagingV2Signals({
  summary,
  full,
}: {
  summary: { unitsPerCase?: number; caseLabel?: string };
  full: ProductUrlExtractionV2 | null;
}) {
  const cp = full?.commercePackaging;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Packaging (V2 signals)</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3">
        <SummaryField label="Units per case" value={summary.unitsPerCase != null ? String(summary.unitsPerCase) : undefined} />
        <SummaryField label="Case label" value={summary.caseLabel} />
        {cp?.innersPerCase ? (
          <SummaryField label="Inners per case" value={fmtNum(cp.innersPerCase.value)} />
        ) : null}
        {cp?.unitsPerInner ? (
          <SummaryField label="Units per inner" value={fmtNum(cp.unitsPerInner.value)} />
        ) : null}
      </div>
      {cp?.packTextRaw ? (
        <EvidenceRow label="Raw pack text" evidence={cp.packTextRaw} />
      ) : null}
      {(cp?.parseWarnings ?? []).length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
          {(cp?.parseWarnings ?? []).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-[10px] text-muted-foreground italic">
        Staged commerce_packaging is shown in Case &amp; Pallet setup below.
      </p>
    </div>
  );
}

export function StagedUrlExtractionPanel({
  normalizedData,
  rawPayload,
}: {
  normalizedData: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
}) {
  const ctx = useMemo(
    () => resolveUrlExtractionReviewContext(normalizedData, rawPayload),
    [normalizedData, rawPayload]
  );

  if (!ctx) return null;

  const { summary, full } = ctx;
  const identity = full?.identity;
  const taxonomy = full?.taxonomy;

  return (
    <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">URL extraction (V2)</p>
        <p className="text-[11px] mt-0.5">
          <a
            href={summary.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 dark:text-sky-400 hover:underline break-all"
          >
            {summary.sourceUrl}
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Identity</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <SummaryField label="Normalized title" value={summary.normalizedTitle} />
          <SummaryField label="Brand" value={summary.brand} />
          <SummaryField label="Manufacturer" value={summary.manufacturer} />
          <SummaryField label="Material" value={summary.material} />
          <SummaryField label="Disposable / reusable" value={summary.disposableReusable} />
          {summary.canonicalUrl ? (
            <SummaryField label="Canonical URL" value={summary.canonicalUrl} />
          ) : null}
        </div>
        {full ? (
          <div className="rounded border border-border/50 bg-background/40 px-2.5 py-2 space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Source evidence</p>
            <EvidenceRow label="Source title" evidence={identity?.sourceTitle} />
            <EvidenceRow label="Brand" evidence={identity?.brand} />
            <EvidenceRow label="Manufacturer" evidence={identity?.manufacturer} />
            <EvidenceRow label="Product type" evidence={taxonomy?.productType} />
            <EvidenceRow label="Glove type" evidence={taxonomy?.gloveType} />
            <EvidenceRow label="Material (taxonomy)" evidence={taxonomy?.material} />
            <EvidenceRow label="Disposable / reusable" evidence={taxonomy?.disposableReusable} />
          </div>
        ) : null}
      </div>

      <StagedUrlExtractionImagesPanel summary={summary} full={full} />

      <StagedUrlExtractionVariantsPanel summary={summary} full={full} />

      <PackagingV2Signals summary={summary} full={full} />

      <StagedUrlExtractionReadinessPanel summary={summary} />
    </div>
  );
}

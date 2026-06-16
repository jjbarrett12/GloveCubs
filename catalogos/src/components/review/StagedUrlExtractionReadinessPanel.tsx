"use client";

import type { ProductUrlExtractionV2Summary } from "@/lib/product-extraction/types";
import { formatConfidencePct } from "@/lib/review/staging-review-evidence";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function yesNoBadge(ok: boolean, yesLabel: string, noLabel: string) {
  return (
    <Badge variant={ok ? "success" : "warning"} className="text-[10px] font-normal">
      {ok ? yesLabel : noLabel}
    </Badge>
  );
}

function hintFlag(label: string, on: boolean) {
  return (
    <span className={cn("text-[11px]", on ? "text-foreground" : "text-muted-foreground")}>
      <span className="font-medium">{label}: </span>
      {on ? "Yes" : "No"}
    </span>
  );
}

export function StagedUrlExtractionReadinessPanel({
  summary,
}: {
  summary: ProductUrlExtractionV2Summary;
}) {
  const { confidence, review } = summary;
  const hints = review.publishReadinessHints;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Readiness</p>

      <div className="flex flex-wrap gap-2">
        <span className="text-[11px] text-muted-foreground">Safe to create master:</span>
        {yesNoBadge(review.safeToCreateMaster, "Yes", "No")}
        <span className="text-[11px] text-muted-foreground">Safe to stage variants:</span>
        {yesNoBadge(review.safeToStageVariants, "Yes", "No")}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
        <ConfField label="Overall" value={confidence.overall} />
        <ConfField label="Identity" value={confidence.identity} />
        <ConfField label="Images" value={confidence.images} />
        <ConfField label="Variants" value={confidence.variants} />
        <ConfField label="Packaging" value={confidence.packaging} />
        <ConfField label="Attributes" value={confidence.attributes} />
      </div>

      {review.blockers.length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-destructive space-y-0.5">
          {review.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}

      {review.warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
          {review.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="rounded border border-border/60 bg-muted/10 px-2.5 py-2 space-y-1.5 text-[11px]">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Publish readiness hints
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {hintFlag("Variant candidates", hints.hasVariantCandidates)}
          {hintFlag("Image candidate", hints.hasImageCandidate)}
          {hintFlag("Packaging signal", hints.hasPackagingSignal)}
          {hintFlag("SKU source separation", hints.hasSkuSourceSeparation)}
        </div>
        {hints.warnings.length > 0 ? (
          <ul className="list-disc pl-4 text-amber-700 dark:text-amber-400 space-y-0.5">
            {hints.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-[10px] text-muted-foreground italic">
          Informational only — publish enforcement still uses existing publish guards.
        </p>
      </div>
    </div>
  );
}

function ConfField({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-medium tabular-nums">{formatConfidencePct(value)}</p>
    </div>
  );
}

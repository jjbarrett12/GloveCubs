"use client";

import type {
  ProductImageCandidate,
  ProductUrlExtractionV2,
  ProductUrlExtractionV2Summary,
} from "@/lib/product-extraction/types";
import { isUsableProductImage } from "@/lib/product-extraction/extraction-v2-bridge";
import { formatConfidencePct, formatTrustLabel } from "@/lib/review/staging-review-evidence";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function roleLabel(role: string): string {
  return role.replace(/_/g, " ");
}

function ImageThumb({
  candidate,
  isPrimary,
}: {
  candidate: ProductImageCandidate;
  isPrimary: boolean;
}) {
  const src = candidate.absoluteUrl || candidate.url;
  return (
    <div
      className={cn(
        "rounded border p-1.5 space-y-1 bg-background/60",
        isPrimary && "border-emerald-500/60 ring-1 ring-emerald-500/30"
      )}
    >
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="secondary" className="text-[9px] font-normal capitalize">
          {roleLabel(candidate.role)}
        </Badge>
        {isPrimary ? (
          <Badge variant="success" className="text-[9px] font-normal">
            Primary
          </Badge>
        ) : null}
      </div>
      {src ? (
        <img
          src={src}
          alt={candidate.alt ?? ""}
          className="h-16 w-16 object-contain rounded border border-border bg-white"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <p className="text-[10px] text-muted-foreground">No URL</p>
      )}
      <p className="text-[10px] text-muted-foreground font-mono truncate" title={src}>
        {formatTrustLabel(candidate.trust)} · {formatConfidencePct(candidate.confidence)}
      </p>
    </div>
  );
}

function ImageGrid({ items, primaryId }: { items: ProductImageCandidate[]; primaryId?: string }) {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground">—</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((c) => (
        <ImageThumb key={c.id} candidate={c} isPrimary={primaryId != null && c.id === primaryId} />
      ))}
    </div>
  );
}

export function StagedUrlExtractionImagesPanel({
  summary,
  full,
}: {
  summary: ProductUrlExtractionV2Summary;
  full: ProductUrlExtractionV2 | null;
}) {
  if (!full) {
    const hasPrimary = Boolean(summary.primaryImageUrl?.trim());
    const noUsableSignal = !hasPrimary && summary.imageCandidateCount === 0;
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Images</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
          <div>
            <p className="text-muted-foreground text-[10px]">Candidate count</p>
            <p className="font-medium">{summary.imageCandidateCount}</p>
          </div>
          {hasPrimary ? (
            <div>
              <p className="text-muted-foreground text-[10px]">Primary image</p>
              <img
                src={summary.primaryImageUrl}
                alt=""
                className="mt-1 h-16 w-16 object-contain rounded border border-border bg-white"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Detailed image roles are available on the family anchor row.
        </p>
        {noUsableSignal ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
            Warning: no usable product image detected.
          </p>
        ) : null}
      </div>
    );
  }

  const candidates = full.images?.candidates ?? [];
  const rejected = full.images?.rejected ?? [];
  const primaryId = full.images?.primaryCandidateId;
  const usable = candidates.filter(isUsableProductImage);
  const noisyFromCandidates = candidates.filter((c) => !isUsableProductImage(c));
  const noisy = [...noisyFromCandidates, ...rejected];
  const total = candidates.length + rejected.length;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Images</p>
      <p className="text-[11px] text-muted-foreground">
        {usable.length} usable · {noisy.length} rejected/noisy · {total} total
      </p>

      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Usable product</p>
        <ImageGrid items={usable} primaryId={primaryId} />
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Rejected / noisy</p>
        <ImageGrid items={noisy} primaryId={undefined} />
      </div>

      {usable.length === 0 ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
          Warning: no usable product image detected.
        </p>
      ) : null}
    </div>
  );
}

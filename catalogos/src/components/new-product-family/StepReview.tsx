"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { familySummaryLines } from "@/lib/new-product-family/summary";
import type { NewProductFamilyDraft } from "@/lib/new-product-family/types";

export function StepReview({
  draft,
  disabled,
  canPromote,
  promoteMessage,
  onChange,
  onPromote,
}: {
  draft: NewProductFamilyDraft;
  disabled?: boolean;
  canPromote: boolean;
  promoteMessage: string | null;
  onChange: (patch: Partial<NewProductFamilyDraft>) => void;
  onPromote: () => void;
}) {
  const summary = familySummaryLines(draft);
  return (
    <div className="space-y-4">
      <ul className="space-y-1 text-sm">
        {summary.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Send to review creates CatalogOS staging rows and one catalog product. It does not publish and does not set a
        customer price. Finish publish from the existing review queue.
      </p>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Product image URL</span>
        <Input
          className="h-8 text-sm"
          disabled={disabled}
          value={draft.imageUrl}
          placeholder="https://"
          onChange={(e) => onChange({ imageUrl: e.target.value })}
        />
      </label>
      <Button type="button" disabled={disabled || !canPromote} onClick={onPromote}>
        Send to review
      </Button>
      {promoteMessage ? <p className="text-xs">{promoteMessage}</p> : null}
      <p className="text-xs">
        <Link className="underline underline-offset-2" href="/dashboard/review">
          Open review queue
        </Link>
      </p>
    </div>
  );
}

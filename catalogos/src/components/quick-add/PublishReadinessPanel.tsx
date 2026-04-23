"use client";

import type { PublishReadiness } from "@/lib/review/publish-guards";

export interface PublishReadinessPanelProps {
  publishReadiness: PublishReadiness | undefined;
  unimplementedCategoryAck: boolean;
  onUnimplementedCategoryAck: (v: boolean) => void;
}

export function PublishReadinessPanel({
  publishReadiness,
  unimplementedCategoryAck,
  onUnimplementedCategoryAck,
}: PublishReadinessPanelProps) {
  if (!publishReadiness) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Loading preflight…</div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 max-w-xl">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Publish readiness</h2>
      {publishReadiness.canPublish ? (
        <div className="space-y-1">
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Tier 1: Ready for publish attempt</p>
          <p className="text-xs text-muted-foreground">
            Passes evaluatePublishReadiness and publish_safe only. This is not a guarantee that publish will finish — the server still runs
            attribute sync, JSON snapshot, supplier offer, commerce bridge, and storefront search.
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-amber-600 dark:text-amber-400">
          <p className="font-medium text-foreground">Preflight blocked — fix the sections below</p>
          {publishReadiness.blockerSections.workflow.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Workflow</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {publishReadiness.blockerSections.workflow.map((b, i) => (
                  <li key={`w-${i}`}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {publishReadiness.blockerSections.staging_validation.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Staging / validation</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {publishReadiness.blockerSections.staging_validation.map((b, i) => (
                  <li key={`s-${i}`}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {publishReadiness.blockerSections.missing_required_attributes.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Missing required attributes (publish_safe)</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {publishReadiness.blockerSections.missing_required_attributes.map((b, i) => (
                  <li key={`m-${i}`}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {publishReadiness.blockerSections.case_pricing.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Case pricing</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {publishReadiness.blockerSections.case_pricing.map((b, i) => (
                  <li key={`c-${i}`}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1">
        <p className="text-xs font-semibold text-foreground">After publish click</p>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
          {publishReadiness.postClickPipelineNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
      {publishReadiness.canPublish && publishReadiness.categoryRequirementsEnforced === false ? (
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border"
            checked={unimplementedCategoryAck}
            onChange={(e) => onUnimplementedCategoryAck(e.target.checked)}
          />
          <span>
            I understand no category-specific required attribute keys are enforced for &quot;{publishReadiness.categorySlug}&quot; before
            publish.
          </span>
        </label>
      ) : null}
      {publishReadiness.warnings.length ? (
        <ul className="text-xs text-muted-foreground list-disc pl-4">
          {publishReadiness.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

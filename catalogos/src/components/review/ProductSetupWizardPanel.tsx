"use client";

import { useCallback, useMemo, useState } from "react";
import { applyProductSetupWizardFields } from "@/app/actions/review-setup-wizard";
import type { PublishReadiness } from "@/lib/review/publish-guards";
import {
  buildProductSetupApplyCandidates,
  type ProductSetupApplyCandidateV1,
} from "@/lib/product-extraction/product-setup-apply-candidates";
import {
  buildProductSetupWizardReadiness,
  resolveWizardContractSummary,
  type ProductSetupWizardField,
  type ProductSetupWizardOverallStatus,
  type ProductSetupWizardReadinessV1,
  type ProductSetupWizardSection,
} from "@/lib/product-extraction/product-setup-wizard-readiness";
import { formatConfidencePct } from "@/lib/review/staging-review-evidence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

const OVERALL_LABELS: Record<ProductSetupWizardOverallStatus, string> = {
  publish_ready: "Ready for setup review",
  needs_pricing: "Needs pricing",
  needs_image_review: "Needs image review",
  needs_variant_review: "Needs variant review",
  needs_packaging_review: "Needs packaging review",
  needs_attribute_review: "Needs attribute review",
  needs_certification_review: "Needs certification review",
  missing_required_fields: "Missing required fields",
};

const STATUS_VARIANT: Record<
  ProductSetupWizardField["status"],
  "success" | "warning" | "destructive" | "secondary"
> = {
  ready: "success",
  needs_review: "warning",
  missing: "destructive",
  blocked: "destructive",
};

const APPLY_STATUS_LABEL: Record<ProductSetupApplyCandidateV1["applyStatus"], string> = {
  safe_to_apply: "Safe to apply",
  needs_review: "Review only",
  blocked: "Blocked",
  already_applied: "Applied",
};

function FieldRow({
  field,
  candidate,
  busy,
  onApplyField,
}: {
  field: ProductSetupWizardField;
  candidate?: ProductSetupApplyCandidateV1;
  busy: boolean;
  onApplyField: (fieldKey: string) => void;
}) {
  const canApply = candidate?.applyStatus === "safe_to_apply";
  const isApplied = candidate?.applyStatus === "already_applied";
  const isLocked =
    candidate?.applyStatus === "blocked" ||
    candidate?.applyStatus === "needs_review" ||
    !candidate;

  return (
    <div className="grid grid-cols-1 gap-0.5 border-t border-border/30 pt-1.5 first:border-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:gap-x-3 sm:items-start">
      <p className="text-[10px] text-muted-foreground">{field.label}</p>
      <div className="text-[11px]">
        <p className="font-medium break-all">{field.displayValue}</p>
        {field.normalizedValue && field.normalizedValue !== field.displayValue ? (
          <p className="text-[10px] text-muted-foreground">Normalized: {field.normalizedValue}</p>
        ) : null}
        {candidate?.blockReason ? (
          <p className="text-[10px] text-amber-700 dark:text-amber-400">{candidate.blockReason}</p>
        ) : null}
        {field.evidenceText ? (
          <p className="text-[10px] text-muted-foreground italic break-all">&ldquo;{field.evidenceText}&rdquo;</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        {candidate ? (
          <Badge
            variant={
              candidate.applyStatus === "safe_to_apply"
                ? "success"
                : candidate.applyStatus === "already_applied"
                  ? "secondary"
                  : "warning"
            }
            className="text-[9px]"
          >
            {APPLY_STATUS_LABEL[candidate.applyStatus]}
          </Badge>
        ) : (
          <Badge variant={STATUS_VARIANT[field.status]} className="text-[9px] capitalize">
            {field.status.replace(/_/g, " ")}
          </Badge>
        )}
        {field.confidence != null ? (
          <span className="text-[10px] text-muted-foreground font-mono">{formatConfidencePct(field.confidence)}</span>
        ) : null}
        {canApply ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2"
            disabled={busy}
            onClick={() => onApplyField(field.key)}
          >
            Apply
          </Button>
        ) : isApplied ? null : isLocked ? (
          <Lock className="h-3 w-3 text-muted-foreground" aria-label="Review only" />
        ) : null}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  candidatesByField,
  sectionCandidates,
  busy,
  onApplyField,
  onApplySection,
}: {
  section: ProductSetupWizardSection;
  candidatesByField: Map<string, ProductSetupApplyCandidateV1>;
  sectionCandidates: ProductSetupApplyCandidateV1[];
  busy: boolean;
  onApplyField: (fieldKey: string) => void;
  onApplySection: (sectionKey: string) => void;
}) {
  const safeCount = sectionCandidates.filter((c) => c.applyStatus === "safe_to_apply").length;

  return (
    <div className="rounded border border-border/60 bg-background/50 p-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold">{section.label}</p>
        <div className="flex items-center gap-1.5">
          <Badge variant={STATUS_VARIANT[section.status]} className="text-[9px] capitalize">
            {section.status.replace(/_/g, " ")}
          </Badge>
          <span className="text-[10px] text-muted-foreground font-mono">
            {section.completedCount}/{section.totalCount} · {formatConfidencePct(section.confidence)}
          </span>
        </div>
      </div>
      {safeCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px]"
          disabled={busy}
          onClick={() => onApplySection(section.key)}
        >
          Apply safe fields ({safeCount})
        </Button>
      ) : null}
      <div className="space-y-1.5">
        {section.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            candidate={candidatesByField.get(field.key)}
            busy={busy}
            onApplyField={onApplyField}
          />
        ))}
      </div>
      {section.warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-[10px] text-amber-700 dark:text-amber-400 space-y-0.5">
          {section.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ImageCandidatesBlock({ readiness }: { readiness: ProductSetupWizardReadinessV1 }) {
  const candidates = readiness.sections.images.fields.find((f) => f.key === "candidateRoles");
  if (!candidates || candidates.displayValue === "—") return null;
  return (
    <div className="text-[11px] space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Image candidates</p>
      <p className="text-muted-foreground break-all">{candidates.displayValue}</p>
    </div>
  );
}

export function ProductSetupWizardPanel({
  normalizedId,
  normalizedData,
  rawPayload = {},
  publishReadiness,
  onApplied,
}: {
  normalizedId?: string;
  normalizedData: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
  publishReadiness?: PublishReadiness | null;
  onApplied?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const contractSummary = useMemo(
    () => resolveWizardContractSummary(normalizedData, rawPayload),
    [normalizedData, rawPayload]
  );

  const readiness = useMemo(() => {
    if (!contractSummary) return null;
    return buildProductSetupWizardReadiness({
      contractSummary,
      normalizedData,
      publishReadiness,
    });
  }, [contractSummary, normalizedData, publishReadiness]);

  const applyCandidates = useMemo(() => {
    if (!readiness || !contractSummary) return [];
    return buildProductSetupApplyCandidates(readiness, contractSummary, normalizedData);
  }, [readiness, contractSummary, normalizedData]);

  const candidatesByField = useMemo(() => {
    const map = new Map<string, ProductSetupApplyCandidateV1>();
    for (const c of applyCandidates) map.set(c.fieldKey, c);
    return map;
  }, [applyCandidates]);

  const safeApplyCount = applyCandidates.filter((c) => c.applyStatus === "safe_to_apply").length;

  const runApply = useCallback(
    async (opts: { fieldKeys?: string[]; sectionKey?: string; applyAllSafe?: boolean }) => {
      if (!normalizedId) {
        setApplyMessage("Save staging row before applying fields.");
        return;
      }
      setBusy(true);
      setApplyMessage(null);
      try {
        const r = await applyProductSetupWizardFields(normalizedId, opts);
        if (r.appliedFields.length) {
          setApplyMessage(
            `Applied ${r.appliedFields.length} field(s): ${r.appliedFields.join(", ")}` +
              (r.skippedFields.length ? `. Skipped ${r.skippedFields.length}.` : "")
          );
          onApplied?.();
        } else if (r.error) {
          setApplyMessage(r.error);
        } else {
          setApplyMessage(
            r.skippedFields.length
              ? `No fields applied. ${r.skippedFields.map((s) => s.reason).slice(0, 2).join("; ")}`
              : "No safe fields to apply."
          );
        }
      } catch (e) {
        setApplyMessage(e instanceof Error ? e.message : "Apply failed");
      } finally {
        setBusy(false);
      }
    },
    [normalizedId, onApplied]
  );

  if (!readiness) {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Product setup wizard</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          No product setup contract available. Import from a product URL with extraction V2 enabled, or bridge a URL
          import job to staging.
        </p>
      </div>
    );
  }

  const sectionList = [
    readiness.sections.identity,
    readiness.sections.variants,
    readiness.sections.images,
    readiness.sections.commercePackaging,
    readiness.sections.attributes,
    readiness.sections.certifications,
    readiness.sections.sku,
    readiness.sections.pricing,
    readiness.sections.publishReadiness,
  ];

  return (
    <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Product setup wizard</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Apply safe extracted values into staged review data.
          </p>
        </div>
        <Badge
          variant={readiness.overallStatus === "publish_ready" ? "success" : "warning"}
          className="text-[10px] capitalize"
        >
          {OVERALL_LABELS[readiness.overallStatus]}
        </Badge>
      </div>

      {applyMessage ? (
        <p className="text-[11px] text-foreground border border-border/50 rounded px-2 py-1.5 bg-background/60">
          {applyMessage}
        </p>
      ) : null}

      {readiness.warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
          {readiness.warnings.slice(0, 6).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {sectionList.map((section) => (
          <SectionCard
            key={section.key}
            section={section}
            candidatesByField={candidatesByField}
            sectionCandidates={applyCandidates.filter((c) => c.sectionKey === section.key)}
            busy={busy}
            onApplyField={(fieldKey) => void runApply({ fieldKeys: [fieldKey] })}
            onApplySection={(sectionKey) => void runApply({ sectionKey })}
          />
        ))}
      </div>

      <ImageCandidatesBlock readiness={readiness} />

      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="text-[11px] h-7"
          disabled={busy || !normalizedId || safeApplyCount === 0}
          onClick={() => void runApply({ applyAllSafe: true })}
        >
          Apply all safe fields ({safeApplyCount})
        </Button>
        <Button type="button" variant="outline" size="sm" disabled className="text-[11px] h-7 opacity-60">
          Review images — coming next
        </Button>
      </div>
    </div>
  );
}

export { buildProductSetupWizardReadiness, resolveWizardContractSummary };

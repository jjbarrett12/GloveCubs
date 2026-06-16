"use client";

import { useMemo } from "react";
import type { CommercePackagingV1 } from "@commerce-packaging/types";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "@commerce-packaging/types";
import { evaluateCommercePackagingReadiness } from "@commerce-packaging/readiness";
import { getCommercePackagingFromNormalized, resolveCommercePackagingForStagingRow } from "@commerce-packaging/staging-bridge";
import { getPackagingMathReview } from "@/lib/review/staging-review-evidence";
import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function fmt(n: unknown): string {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("en-US");
}

function parseCp(nd: Record<string, unknown>): CommercePackagingV1 {
  const raw = nd.commerce_packaging;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.schema_version === COMMERCE_PACKAGING_SCHEMA_VERSION) {
      return raw as CommercePackagingV1;
    }
  }
  return resolveCommercePackagingForStagingRow(nd, {
    categorySlug: typeof nd.category_slug === "string" ? nd.category_slug : null,
  });
}

export function StagedCommercePackagingPanel({
  normalizedData,
  casePriceFallback,
}: {
  normalizedData: Record<string, unknown>;
  casePriceFallback?: number | null;
}) {
  const cp = useMemo(() => parseCp(normalizedData), [normalizedData]);
  const math = useMemo(() => getPackagingMathReview(normalizedData), [normalizedData]);
  const readiness = useMemo(
    () =>
      evaluateCommercePackagingReadiness(getCommercePackagingFromNormalized(normalizedData), {
        casePriceFallback,
        publishIntent: true,
      }),
    [normalizedData, casePriceFallback]
  );

  const provenanceRows = Object.entries(cp.field_provenance ?? {}).slice(0, 8);

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Case &amp; Pallet setup</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Canonical commerce_packaging for storefront case/pallet selling.</p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3">
        <Field label="Sell by case" value={cp.sell_by_case_enabled ? "Yes" : "No"} />
        <Field label="Sell by pallet" value={cp.sell_by_pallet_enabled ? "Yes" : "No"} />
        <Field label="Case price" value={cp.case_price != null ? usd.format(cp.case_price) : "—"} />
        <Field label="Pallet price" value={cp.pallet_price != null ? usd.format(cp.pallet_price) : "—"} />
        <Field label="Inner unit" value={cp.inner_unit_type ?? "—"} />
        <Field label="Units per inner" value={fmt(cp.units_per_inner)} />
        <Field label="Inners per case" value={fmt(cp.inners_per_case)} />
        <Field label="Units per case" value={fmt(cp.units_per_case)} />
        <Field label="Cases per pallet" value={fmt(cp.cases_per_pallet)} />
        <Field label="Units per pallet" value={fmt(cp.units_per_pallet)} />
        <Field label="Unit noun" value={cp.unit_noun} />
      </div>

      {cp.case_label ? (
        <p className="text-[11px] text-foreground">
          <span className="text-muted-foreground">Case label: </span>
          {cp.case_label}
        </p>
      ) : null}
      {cp.pallet_label ? (
        <p className="text-[11px] text-foreground">
          <span className="text-muted-foreground">Pallet label: </span>
          {cp.pallet_label}
        </p>
      ) : null}

      <div
        className={cn(
          "rounded border px-2.5 py-2 text-[11px]",
          math.state === "mismatch" && "border-amber-500/50 bg-amber-500/5",
          math.state === "incomplete" && "border-amber-500/40 bg-amber-500/5",
          math.state === "matches" && "border-border/60 bg-muted/10"
        )}
      >
        <p className="font-medium text-muted-foreground uppercase text-[10px] tracking-wide mb-1">Packaging math</p>
        {math.computedTotal != null ? (
          <p>
            {math.boxes ?? "—"} × {math.glovesPerBox ?? "—"} = {math.computedTotal}
            {math.declaredTotal != null ? ` (declared ${math.declaredTotal})` : ""}
          </p>
        ) : math.declaredTotal != null ? (
          <p>{fmt(math.declaredTotal)} {cp.unit_noun} per case — inner breakdown unknown</p>
        ) : (
          <p>Incomplete packaging math</p>
        )}
      </div>

      {(cp.parse_warnings ?? []).length > 0 ? (
        <ul className="list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5">
          {(cp.parse_warnings ?? []).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {readiness.blockers.length > 0 || readiness.warnings.length > 0 ? (
        <div className="space-y-1 text-[11px]">
          {readiness.blockers.map((b) => (
            <p key={b.code} className="text-destructive font-medium">
              Blocker: {b.label}
            </p>
          ))}
          {readiness.warnings.map((w) => (
            <p key={w.code} className="text-amber-700 dark:text-amber-400">
              Warning: {w.label}
            </p>
          ))}
        </div>
      ) : null}

      {provenanceRows.length > 0 ? (
        <div className="border-t border-border/50 pt-2 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Parser evidence</p>
          {provenanceRows.map(([key, prov]) => {
            const p = prov as { confidence?: number; evidence_text?: string; source?: string };
            return (
              <p key={key} className="text-[10px] text-muted-foreground font-mono truncate" title={p.evidence_text}>
                {key}: {p.source ?? "—"} · {p.confidence != null ? `${Math.round(p.confidence * 100)}%` : "—"}
              </p>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

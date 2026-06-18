"use client";

import * as React from "react";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import {
  adminAlertSurface,
  adminFormInput,
  adminLink,
  adminMutedPanel,
  adminStatusBadgeClasses,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import { GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS } from "@/lib/catalog/catalog-facet-registry";
import {
  DISPOSABLE_CERTIFICATION_SLUGS,
  SAFETY_CERTIFICATION_SLUGS,
  formatAttributeValueLabel,
} from "@/lib/catalog/attribute-value-labels";
import {
  getFoodSafeYesNo,
  getLatexFreeYesNo,
  getMedicalGradeYesNo,
  getPowderFreeYesNo,
  setFoodSafeYesNo,
  setLatexFreeYesNo,
  setMedicalGradeYesNo,
  setPowderFreeYesNo,
} from "@/lib/admin/disposable-attribute-controls";
import type { LegacyMetadataField } from "@/lib/admin/legacy-metadata-migration";

const lbl = "text-xs font-semibold text-admin-secondary";
const field = cn(adminFormInput, "mt-1 w-full rounded-lg shadow-inner");
const fieldBlocking = cn(
  adminFormInput,
  "mt-1 w-full rounded-lg border-2 border-admin-danger/50 bg-[var(--admin-danger-surface)] shadow-inner focus:border-admin-danger focus:ring-admin-danger/30",
);
const wrapBlocking = "rounded-lg border-2 border-admin-danger/50 bg-[var(--admin-danger-surface)] p-2.5";
const wrapMissing = "rounded-lg border border-admin-warning/30 bg-[var(--admin-warning-surface)] p-2.5";

const DISPOSABLE_CATEGORY_SLUG = "disposable_gloves";

function isMulti(key: string): boolean {
  return (GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS as readonly string[]).includes(key);
}

type Props = {
  categoryId: string;
  categorySlug?: string | null;
  definitions: AttributeDefinitionRow[];
  values: Record<string, string | string[]>;
  legacyFields: LegacyMetadataField[];
  missingFilterKeys?: string[];
  blockingKeys?: string[];
  onChange: (values: Record<string, string | string[]>) => void;
  onMigrateLegacy: () => void;
};

function YesNoSelect({
  label,
  value,
  onChange,
  blocked,
}: {
  label: string;
  value: "yes" | "no" | "";
  onChange: (v: "yes" | "no" | "") => void;
  blocked?: boolean;
}) {
  return (
    <label className={`block ${blocked ? wrapBlocking : ""}`}>
      <span className={lbl}>
        {label}
        {blocked ? <span className="ml-1.5 text-[10px] font-bold uppercase text-admin-danger">Required</span> : null}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as "yes" | "no" | "")}
        className={blocked ? fieldBlocking : field}
      >
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function DisposableQuickControls({
  values,
  onChange,
  blockingKeys,
}: {
  values: Record<string, string | string[]>;
  onChange: (values: Record<string, string | string[]>) => void;
  blockingKeys: Set<string>;
}) {
  return (
    <div className={cn(adminMutedPanel, "mb-4 p-3")}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-admin-muted">Quick specs</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <YesNoSelect
          label="Powder Free"
          value={getPowderFreeYesNo(values)}
          onChange={(choice) => {
            if (choice === "yes" || choice === "no") onChange(setPowderFreeYesNo(values, choice));
          }}
          blocked={blockingKeys.has("powder")}
        />
        <YesNoSelect
          label="Latex Free"
          value={getLatexFreeYesNo(values)}
          onChange={(choice) => {
            if (choice === "yes" || choice === "no") onChange(setLatexFreeYesNo(values, choice));
          }}
          blocked={blockingKeys.has("certifications") && getLatexFreeYesNo(values) !== "yes"}
        />
        <YesNoSelect
          label="Medical Grade"
          value={getMedicalGradeYesNo(values)}
          onChange={(choice) => {
            if (choice === "yes" || choice === "no") onChange(setMedicalGradeYesNo(values, choice));
          }}
          blocked={blockingKeys.has("grade")}
        />
        <YesNoSelect
          label="Food Safe"
          value={getFoodSafeYesNo(values)}
          onChange={(choice) => {
            if (choice === "yes" || choice === "no") onChange(setFoodSafeYesNo(values, choice));
          }}
          blocked={blockingKeys.has("certifications") && getFoodSafeYesNo(values) !== "yes"}
        />
      </div>
    </div>
  );
}

function CertificationChipGroups({
  def,
  values,
  isMissingFilter,
  isBlocking,
  onToggle,
}: {
  def: AttributeDefinitionRow;
  values: Record<string, string | string[]>;
  isMissingFilter: boolean;
  isBlocking: boolean;
  onToggle: (token: string) => void;
}) {
  const raw = values[def.attributeKey];
  const selected = new Set(Array.isArray(raw) ? raw : raw ? [String(raw)] : []);

  const disposableSet = new Set<string>(DISPOSABLE_CERTIFICATION_SLUGS);
  const safetySet = new Set<string>(SAFETY_CERTIFICATION_SLUGS);

  const groups: { title: string; slugs: string[] }[] = [
    {
      title: "Disposable / Medical / Food Contact",
      slugs: def.allowedValues.filter((v) => disposableSet.has(v)),
    },
    {
      title: "Safety / Reusable",
      slugs: def.allowedValues.filter((v) => safetySet.has(v)),
    },
    {
      title: "Other",
      slugs: def.allowedValues.filter((v) => !disposableSet.has(v) && !safetySet.has(v)),
    },
  ].filter((g) => g.slugs.length > 0);

  function renderChip(v: string) {
    const on = selected.has(v);
    return (
      <button
        key={v}
        type="button"
        onClick={() => onToggle(v)}
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs font-medium transition",
          on
            ? cn("border-admin-accent/40 bg-admin-accent-soft text-admin-accent", adminStatusBadgeClasses("accent"))
            : "border-admin-border bg-admin-surface text-admin-secondary hover:border-admin-accent/40",
        )}
      >
        {formatAttributeValueLabel(def.attributeKey, v)}
      </button>
    );
  }

  return (
    <div className={`sm:col-span-2 ${isBlocking ? wrapBlocking : isMissingFilter ? wrapMissing : ""}`}>
      <span className={lbl}>
        {def.label}
        {def.isRequired ? <span className="text-admin-danger"> *</span> : null}
        {isBlocking ? (
          <span className="ml-1.5 text-[10px] font-bold uppercase text-admin-danger">Required</span>
        ) : isMissingFilter ? (
          <span className="ml-1.5 text-[10px] font-bold uppercase text-admin-warning">Missing filter</span>
        ) : null}
      </span>
      <div className="mt-2 space-y-3">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">{g.title}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{g.slugs.map(renderChip)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductAttributeEditor({
  categoryId,
  categorySlug,
  definitions,
  values,
  legacyFields,
  missingFilterKeys = [],
  blockingKeys = [],
  onChange,
  onMigrateLegacy,
}: Props) {
  const missingSet = React.useMemo(() => new Set(missingFilterKeys), [missingFilterKeys]);
  const blockingSet = React.useMemo(() => new Set(blockingKeys), [blockingKeys]);
  const isDisposable = categorySlug === DISPOSABLE_CATEGORY_SLUG;

  const grouped = React.useMemo(() => {
    const map = new Map<string, AttributeDefinitionRow[]>();
    for (const d of definitions) {
      const g = d.displayGroup?.trim() || "Specifications";
      const arr = map.get(g) ?? [];
      arr.push(d);
      map.set(g, arr);
    }
    return Array.from(map.entries());
  }, [definitions]);

  if (!categoryId.trim()) {
    return (
      <PremiumSectionCard title="Storefront filter attributes" description="Select a category to load governed attributes." dense>
        <p className="text-sm text-admin-muted">Category is required before filter attributes can be edited.</p>
      </PremiumSectionCard>
    );
  }

  if (definitions.length === 0) {
    return (
      <PremiumSectionCard title="Storefront filter attributes" dense>
        <p className="text-sm text-admin-muted">No filterable attribute definitions for this category.</p>
      </PremiumSectionCard>
    );
  }

  function setValue(key: string, val: string | string[]) {
    onChange({ ...values, [key]: val });
  }

  function toggleMulti(key: string, token: string) {
    const cur = values[key];
    const arr = Array.isArray(cur) ? [...cur] : cur ? [String(cur)] : [];
    const i = arr.indexOf(token);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(token);
    setValue(key, arr);
  }

  function shouldSkipDef(key: string): boolean {
    return isDisposable && key === "powder";
  }

  return (
    <PremiumSectionCard
      title="Storefront filter attributes"
      description="Values sync to catalogos.product_attributes — what /store filters read."
      dense
    >
      {legacyFields.length > 0 ? (
        <div className={cn(adminAlertSurface("warning", "mb-4 text-sm"))}>
          <p className="font-medium">Legacy metadata values detected</p>
          <p className="mt-1 text-xs text-admin-secondary">
            {legacyFields.map((f) => `${f.attrKey} (${f.rawValue})`).join(", ")} — not in product_attributes yet.
          </p>
          <button
            type="button"
            onClick={onMigrateLegacy}
            className={cn("mt-2 text-xs font-semibold", adminLink)}
          >
            Migrate legacy metadata → storefront attributes
          </button>
        </div>
      ) : null}

      {isDisposable ? (
        <DisposableQuickControls values={values} onChange={onChange} blockingKeys={blockingSet} />
      ) : null}

      <div className="space-y-5">
        {grouped.map(([group, defs]) => (
          <div key={group}>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-admin-muted">{group}</h4>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {defs.map((def) => {
                const key = def.attributeKey;
                if (shouldSkipDef(key)) return null;

                const raw = values[key];
                const isMissingFilter = missingSet.has(key);
                const isBlocking = blockingSet.has(key);

                if (key === "certifications" && isMulti(key)) {
                  return (
                    <CertificationChipGroups
                      key={key}
                      def={def}
                      values={values}
                      isMissingFilter={isMissingFilter}
                      isBlocking={isBlocking}
                      onToggle={(token) => toggleMulti(key, token)}
                    />
                  );
                }

                if (isMulti(key)) {
                  const selected = new Set(Array.isArray(raw) ? raw : raw ? [String(raw)] : []);
                  return (
                    <div
                      key={key}
                      className={`sm:col-span-2 ${isBlocking ? wrapBlocking : isMissingFilter ? wrapMissing : ""}`}
                    >
                      <span className={lbl}>
                        {def.label}
                        {def.isRequired ? <span className="text-admin-danger"> *</span> : null}
                        {isBlocking ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-admin-danger">Required</span>
                        ) : isMissingFilter ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-admin-warning">Missing filter</span>
                        ) : null}
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {def.allowedValues.map((v) => {
                          const on = selected.has(v);
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => toggleMulti(key, v)}
                              className={cn(
                                "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                                on
                                  ? cn(
                                      "border-admin-accent/40 bg-admin-accent-soft text-admin-accent",
                                      adminStatusBadgeClasses("accent"),
                                    )
                                  : "border-admin-border bg-admin-surface text-admin-secondary hover:border-admin-accent/40",
                              )}
                            >
                              {formatAttributeValueLabel(key, v)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                const selectValue = Array.isArray(raw) ? raw[0] ?? "" : (raw ?? "");
                return (
                  <label
                    key={key}
                    className={`block ${isBlocking ? wrapBlocking : isMissingFilter ? wrapMissing : ""}`}
                  >
                    <span className={lbl}>
                      {def.label}
                      {def.isRequired ? <span className="text-admin-danger"> *</span> : null}
                      {isBlocking ? (
                        <span className="ml-1.5 text-[10px] font-bold uppercase text-admin-danger">Required</span>
                      ) : isMissingFilter ? (
                        <span className="ml-1.5 text-[10px] font-bold uppercase text-admin-warning">Missing filter</span>
                      ) : null}
                    </span>
                    <select
                      value={selectValue}
                      onChange={(e) => setValue(key, e.target.value)}
                      className={isBlocking ? fieldBlocking : field}
                    >
                      <option value="">—</option>
                      {def.allowedValues.map((v) => (
                        <option key={v} value={v}>
                          {formatAttributeValueLabel(key, v)}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </PremiumSectionCard>
  );
}

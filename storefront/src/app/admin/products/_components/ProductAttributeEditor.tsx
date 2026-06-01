"use client";

import * as React from "react";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import type { AttributeDefinitionRow } from "@/lib/admin/product-attribute-sync";
import { GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS } from "@/lib/catalog/catalog-facet-registry";
import type { LegacyMetadataField } from "@/lib/admin/legacy-metadata-migration";

const lbl = "text-xs font-semibold text-slate-600";
const field =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-inner focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20";

function isMulti(key: string): boolean {
  return (GLOBAL_MULTI_SELECT_ATTRIBUTE_KEYS as readonly string[]).includes(key);
}

type Props = {
  categoryId: string;
  definitions: AttributeDefinitionRow[];
  values: Record<string, string | string[]>;
  legacyFields: LegacyMetadataField[];
  missingFilterKeys?: string[];
  onChange: (values: Record<string, string | string[]>) => void;
  onMigrateLegacy: () => void;
};

export function ProductAttributeEditor({
  categoryId,
  definitions,
  values,
  legacyFields,
  missingFilterKeys = [],
  onChange,
  onMigrateLegacy,
}: Props) {
  const missingSet = React.useMemo(() => new Set(missingFilterKeys), [missingFilterKeys]);
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
        <p className="text-sm text-slate-500">Category is required before filter attributes can be edited.</p>
      </PremiumSectionCard>
    );
  }

  if (definitions.length === 0) {
    return (
      <PremiumSectionCard title="Storefront filter attributes" dense>
        <p className="text-sm text-slate-500">No filterable attribute definitions for this category.</p>
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

  return (
    <PremiumSectionCard
      title="Storefront filter attributes"
      description="Values sync to catalogos.product_attributes — what /store filters read."
      dense
    >
      {legacyFields.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p className="font-medium">Legacy metadata values detected</p>
          <p className="mt-1 text-xs text-amber-900/90">
            {legacyFields.map((f) => `${f.attrKey} (${f.rawValue})`).join(", ")} — not in product_attributes yet.
          </p>
          <button
            type="button"
            onClick={onMigrateLegacy}
            className="mt-2 text-xs font-semibold text-[#c2410c] hover:underline"
          >
            Migrate legacy metadata → storefront attributes
          </button>
        </div>
      ) : null}

      <div className="space-y-5">
        {grouped.map(([group, defs]) => (
          <div key={group}>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{group}</h4>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {defs.map((def) => {
                const key = def.attributeKey;
                const raw = values[key];
                const isMissingFilter = missingSet.has(key);
                if (isMulti(key)) {
                  const selected = new Set(Array.isArray(raw) ? raw : raw ? [String(raw)] : []);
                  return (
                    <div
                      key={key}
                      className={`sm:col-span-2 ${isMissingFilter ? "rounded-lg border border-amber-300 bg-amber-50/60 p-2.5" : ""}`}
                    >
                      <span className={lbl}>
                        {def.label}
                        {def.isRequired ? <span className="text-red-600"> *</span> : null}
                        {isMissingFilter ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-800">Missing filter</span>
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
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                                on
                                  ? "border-[#f06232]/40 bg-[#fff7f2] text-[#c2410c]"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                              }`}
                            >
                              {v.replace(/_/g, " ")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return (
                  <label
                    key={key}
                    className={`block ${isMissingFilter ? "rounded-lg border border-amber-300 bg-amber-50/60 p-2.5" : ""}`}
                  >
                    <span className={lbl}>
                      {def.label}
                      {def.isRequired ? <span className="text-red-600"> *</span> : null}
                      {isMissingFilter ? (
                        <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-800">Missing filter</span>
                      ) : null}
                    </span>
                    <select
                      value={Array.isArray(raw) ? raw[0] ?? "" : (raw ?? "")}
                      onChange={(e) => setValue(key, e.target.value)}
                      className={field}
                    >
                      <option value="">—</option>
                      {def.allowedValues.map((v) => (
                        <option key={v} value={v}>
                          {v.replace(/_/g, " ")}
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

"use client";

import { Input } from "@/components/ui/input";
import {
  COLOR_VALUES,
  GRADE_VALUES,
  MATERIAL_VALUES,
} from "@/lib/catalogos/attribute-dictionary-types";
import { colorLabel, gradeLabel, materialLabel, suggestFamilyTitle } from "@/lib/new-product-family/title";
import { applyGradeChange } from "@/lib/new-product-family/draft";
import type { NewProductFamilyDraft } from "@/lib/new-product-family/types";
import { BrandSearchSelect } from "./BrandSearchSelect";
import { ChipButton, ChipGroup } from "./ChipGroup";

export function StepIdentity({
  draft,
  brands,
  onChange,
  disabled,
}: {
  draft: NewProductFamilyDraft;
  brands: { id: string; name: string }[];
  onChange: (patch: Partial<NewProductFamilyDraft>) => void;
  disabled?: boolean;
}) {
  function patchStructured(next: Partial<NewProductFamilyDraft>) {
    const merged = { ...draft, ...next };
    if (merged.titleTouched) {
      onChange(next);
      return;
    }
    onChange({
      ...next,
      title: suggestFamilyTitle({
        brand: merged.brand,
        color: merged.color,
        material: merged.material,
        grade: merged.grade,
        powder: merged.powder,
        thicknessMil: merged.thicknessMil,
      }),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Product type</label>
        <select
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          value={draft.productType}
          disabled={disabled}
          onChange={() => patchStructured({ productType: "disposable_gloves" })}
        >
          <option value="disposable_gloves">Disposable gloves</option>
        </select>
        <p className="text-[10px] text-muted-foreground">Phase 1 is disposable gloves only.</p>
      </div>
      <BrandSearchSelect
        brands={brands}
        value={draft.brand}
        brandId={draft.brandId}
        disabled={disabled}
        onChange={({ name, brandId }) => patchStructured({ brand: name, brandId })}
      />
      <ChipGroup label="Material">
        {MATERIAL_VALUES.map((slug) => (
          <ChipButton
            key={slug}
            selected={draft.material === slug}
            disabled={disabled}
            onClick={() => patchStructured({ material: slug })}
          >
            {materialLabel(slug)}
          </ChipButton>
        ))}
      </ChipGroup>
      <ChipGroup label="Grade / primary use">
        {GRADE_VALUES.map((slug) => (
          <ChipButton
            key={slug}
            selected={draft.grade === slug}
            disabled={disabled}
            onClick={() => {
              const next = applyGradeChange(draft, slug);
              patchStructured({
                grade: next.grade,
                aql: next.aql,
                sterility: next.sterility,
                certifications: next.certifications,
              });
            }}
          >
            {gradeLabel(slug)}
          </ChipButton>
        ))}
      </ChipGroup>
      <ChipGroup label="Color">
        {COLOR_VALUES.map((slug) => (
          <ChipButton
            key={slug}
            selected={draft.color === slug}
            disabled={disabled}
            onClick={() => patchStructured({ color: slug })}
          >
            {colorLabel(slug)}
          </ChipButton>
        ))}
      </ChipGroup>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-muted-foreground">Display title</label>
          {draft.titleTouched ? (
            <button
              type="button"
              className="text-[10px] text-primary underline-offset-2 hover:underline"
              disabled={disabled}
              onClick={() =>
                onChange({
                  titleTouched: false,
                  title: suggestFamilyTitle({
                    brand: draft.brand,
                    color: draft.color,
                    material: draft.material,
                    grade: draft.grade,
                    powder: draft.powder,
                    thicknessMil: draft.thicknessMil,
                  }),
                })
              }
            >
              Reset to suggested
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground">Suggested from selections</span>
          )}
        </div>
        <Input
          className="h-9 text-sm"
          value={draft.title}
          disabled={disabled}
          onChange={(e) => onChange({ title: e.target.value, titleTouched: true })}
        />
      </div>
    </div>
  );
}

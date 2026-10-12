"use client";

import { Input } from "@/components/ui/input";
import { BOXES_PER_CASE_PRESETS, GLOVES_PER_BOX_PRESETS } from "@/lib/new-product-family/types";
import type { FamilyPackaging, FamilySizeSlug, NewProductFamilyDraft } from "@/lib/new-product-family/types";
import { derivedUnitsPerCase, packagingForSize } from "@/lib/new-product-family/packaging";
import { ChipButton, ChipGroup } from "./ChipGroup";

const SIZE_LABEL: Record<string, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  xxl: "XXL",
  xxxl: "XXXL",
};

function PackEditor({
  pack,
  disabled,
  onChange,
}: {
  pack: FamilyPackaging;
  disabled?: boolean;
  onChange: (next: FamilyPackaging) => void;
}) {
  const units = derivedUnitsPerCase(pack);
  const innerCustom =
    pack.unitsPerInner != null && !(GLOVES_PER_BOX_PRESETS as readonly number[]).includes(pack.unitsPerInner);
  const innersCustom =
    pack.innersPerCase != null && !(BOXES_PER_CASE_PRESETS as readonly number[]).includes(pack.innersPerCase);

  return (
    <div className="space-y-3">
      <ChipGroup label="Gloves per box">
        {GLOVES_PER_BOX_PRESETS.map((n) => (
          <ChipButton
            key={n}
            selected={pack.unitsPerInner === n && !innerCustom}
            disabled={disabled}
            onClick={() => onChange({ ...pack, unitsPerInner: n })}
          >
            {n}
          </ChipButton>
        ))}
      </ChipGroup>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Custom</span>
        <Input
          className="h-8 w-24 text-sm"
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          value={innerCustom ? String(pack.unitsPerInner ?? "") : ""}
          placeholder="e.g. 90"
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            onChange({ ...pack, unitsPerInner: Number.isInteger(n) && n > 0 ? n : null });
          }}
        />
      </div>
      <ChipGroup label="Boxes per case">
        {BOXES_PER_CASE_PRESETS.map((n) => (
          <ChipButton
            key={n}
            selected={pack.innersPerCase === n && !innersCustom}
            disabled={disabled}
            onClick={() => onChange({ ...pack, innersPerCase: n })}
          >
            {n}
          </ChipButton>
        ))}
      </ChipGroup>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Custom</span>
        <Input
          className="h-8 w-24 text-sm"
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          value={innersCustom ? String(pack.innersPerCase ?? "") : ""}
          placeholder="e.g. 8"
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            onChange({ ...pack, innersPerCase: Number.isInteger(n) && n > 0 ? n : null });
          }}
        />
      </div>
      <p className="text-sm font-medium">
        {pack.unitsPerInner ?? "—"} gloves / box × {pack.innersPerCase ?? "—"} boxes / case ={" "}
        {units != null ? units.toLocaleString("en-US") : "—"} gloves / case
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Cases per pallet (optional)</span>
        <Input
          className="h-8 w-24 text-sm"
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          value={pack.casesPerPallet != null ? String(pack.casesPerPallet) : ""}
          placeholder="Unknown"
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange({ ...pack, casesPerPallet: null });
              return;
            }
            const n = Number.parseInt(raw, 10);
            onChange({ ...pack, casesPerPallet: Number.isInteger(n) && n > 0 ? n : null });
          }}
        />
      </div>
    </div>
  );
}

export function StepPackaging({
  draft,
  onChange,
  disabled,
}: {
  draft: NewProductFamilyDraft;
  onChange: (next: NewProductFamilyDraft) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={draft.samePackagingForAllSizes}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, samePackagingForAllSizes: e.target.checked })}
        />
        Same packaging for all sizes
      </label>
      {draft.samePackagingForAllSizes ? (
        <PackEditor
          pack={draft.packaging}
          disabled={disabled}
          onChange={(packaging) => onChange({ ...draft, packaging })}
        />
      ) : (
        <div className="space-y-4">
          {draft.sizes.map((size: FamilySizeSlug) => (
            <div key={size} className="rounded-md border border-border/70 p-3">
              <p className="mb-2 text-xs font-semibold">{SIZE_LABEL[size]}</p>
              <PackEditor
                pack={packagingForSize(draft, size)}
                disabled={disabled}
                onChange={(pack) =>
                  onChange({
                    ...draft,
                    packagingBySize: { ...draft.packagingBySize, [size]: pack },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

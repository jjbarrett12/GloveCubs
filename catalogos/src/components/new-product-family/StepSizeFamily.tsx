"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SIZE_VALUES } from "@/lib/catalogos/attribute-dictionary-types";
import type { FamilySizeSlug, NewProductFamilyDraft } from "@/lib/new-product-family/types";
import { XS_XL_FAMILY_SIZES } from "@/lib/new-product-family/types";
import { applySupplierSkuMirror, syncDraftSizes } from "@/lib/new-product-family/draft";
import {
  acceptAllManufacturerSuggestions,
  applyManufacturerSuggestions,
  deriveFamilyGloveCubsSkus,
  effectiveSupplierSku,
  sizeRowUiStatus,
  suggestManufacturerSkusFromExample,
  type SkuCollisionInput,
} from "@/lib/new-product-family/sku-assist";
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

export function StepSizeFamily({
  draft,
  collisions,
  onChange,
  disabled,
}: {
  draft: NewProductFamilyDraft;
  collisions: SkuCollisionInput;
  onChange: (next: NewProductFamilyDraft) => void;
  disabled?: boolean;
}) {
  const derived = deriveFamilyGloveCubsSkus(draft);

  function toggleSize(size: FamilySizeSlug) {
    const selected = draft.sizes.includes(size)
      ? draft.sizes.filter((s) => s !== size)
      : [...draft.sizes, size];
    const ordered = SIZE_VALUES.filter((s) => selected.includes(s));
    onChange(applySupplierSkuMirror(syncDraftSizes(draft, ordered)));
  }

  function applyExample() {
    const result = suggestManufacturerSkusFromExample(draft.manufacturerSkuExample, draft.sizes);
    onChange(applySupplierSkuMirror(applyManufacturerSuggestions(draft, result.suggestions, result.exampleSize)));
  }

  function confirmRow(size: FamilySizeSlug) {
    const row = draft.variants[size];
    if (!row?.manufacturerSku.trim()) return;
    onChange(
      applySupplierSkuMirror({
        ...draft,
        variants: {
          ...draft.variants,
          [size]: { ...row, manufacturerConfirmed: true, suggestedManufacturerSku: null },
        },
      })
    );
  }

  return (
    <div className="space-y-4">
      <ChipGroup label="Sizes">
        {SIZE_VALUES.map((size) => (
          <ChipButton
            key={size}
            selected={draft.sizes.includes(size)}
            disabled={disabled}
            onClick={() => toggleSize(size)}
          >
            {SIZE_LABEL[size]}
          </ChipButton>
        ))}
        <ChipButton
          selected={XS_XL_FAMILY_SIZES.every((s) => draft.sizes.includes(s)) && draft.sizes.length === XS_XL_FAMILY_SIZES.length}
          disabled={disabled}
          onClick={() => onChange(applySupplierSkuMirror(syncDraftSizes(draft, [...XS_XL_FAMILY_SIZES])))}
        >
          XS–XL
        </ChipButton>
      </ChipGroup>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Manufacturer SKU example</label>
        <div className="flex flex-wrap gap-2">
          <Input
            className="h-9 max-w-xs font-mono text-sm"
            value={draft.manufacturerSkuExample}
            disabled={disabled}
            placeholder="GL-N125F-S"
            onChange={(e) => onChange({ ...draft, manufacturerSkuExample: e.target.value })}
          />
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={applyExample}>
            Suggest sizes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(applySupplierSkuMirror(acceptAllManufacturerSuggestions(draft)))}
          >
            Accept all suggestions
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Suggestions stay unconfirmed until you accept them. If the pattern cannot be parsed, type each row.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={draft.supplierSkuMirrorsManufacturer}
          disabled={disabled}
          onChange={(e) =>
            onChange(applySupplierSkuMirror({ ...draft, supplierSkuMirrorsManufacturer: e.target.checked }))
          }
        />
        Supplier SKU = manufacturer SKU
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-2">Size</th>
              <th className="py-2 pr-2">Manufacturer SKU</th>
              <th className="py-2 pr-2">Supplier SKU</th>
              <th className="py-2 pr-2">UPC / GTIN</th>
              <th className="py-2 pr-2">GloveCubs SKU</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {draft.sizes.map((size) => {
              const row = draft.variants[size];
              const status = sizeRowUiStatus(draft, size, collisions);
              const statusLabel =
                status === "ready" ? "✓ Ready" : status === "conflict" ? "✕ Conflict" : "⚠ Needs confirmation";
              return (
                <tr key={size} className="border-b border-border/60">
                  <td className="py-2 pr-2 font-medium">{SIZE_LABEL[size]}</td>
                  <td className="py-2 pr-2">
                    <Input
                      className="h-8 font-mono text-xs"
                      value={row?.manufacturerSku ?? ""}
                      disabled={disabled}
                      onChange={(e) => {
                        const manufacturerSku = e.target.value;
                        onChange(
                          applySupplierSkuMirror({
                            ...draft,
                            variants: {
                              ...draft.variants,
                              [size]: {
                                ...(row ?? {
                                  size,
                                  supplierSku: "",
                                  manufacturerConfirmed: false,
                                  suggestedManufacturerSku: null,
                                }),
                                manufacturerSku,
                                manufacturerConfirmed: false,
                              },
                            },
                          })
                        );
                      }}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    {draft.supplierSkuMirrorsManufacturer ? (
                      <span className="font-mono text-muted-foreground">{effectiveSupplierSku(draft, size) || "—"}</span>
                    ) : (
                      <Input
                        className="h-8 font-mono text-xs"
                        value={row?.supplierSku ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          onChange({
                            ...draft,
                            variants: {
                              ...draft.variants,
                              [size]: { ...(row as NonNullable<typeof row>), supplierSku: e.target.value },
                            },
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      className="h-8 font-mono text-xs"
                      value={row?.gtin ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        onChange({
                          ...draft,
                          variants: {
                            ...draft.variants,
                            [size]: { ...(row as NonNullable<typeof row>), gtin: e.target.value },
                          },
                        })
                      }
                    />
                  </td>
                  <td className="py-2 pr-2 font-mono text-[11px]">{derived.bySize[size] ?? "—"}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          status === "ready"
                            ? "text-emerald-600"
                            : status === "conflict"
                              ? "text-red-600"
                              : "text-amber-700 dark:text-amber-400"
                        }
                      >
                        {statusLabel}
                      </span>
                      {status !== "ready" && row?.manufacturerSku.trim() ? (
                        <Button type="button" variant="outline" size="sm" className="h-6 px-2" disabled={disabled} onClick={() => confirmRow(size)}>
                          Confirm
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

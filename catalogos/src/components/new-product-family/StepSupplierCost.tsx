"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { COST_SOURCE_TYPES, COST_SOURCE_TYPE_LABELS } from "@/lib/pricing/landed-cost-provenance";
import type { FamilySizeSlug, NewProductFamilyDraft } from "@/lib/new-product-family/types";

const SIZE_LABEL: Record<string, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
  xxl: "XXL",
  xxxl: "XXXL",
};

function moneyInputValue(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseMoney(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function CostPair({
  quoted,
  landed,
  disabled,
  onQuoted,
  onLanded,
}: {
  quoted: number | null;
  landed: number | null;
  disabled?: boolean;
  onQuoted: (value: number | null) => void;
  onLanded: (value: number | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Supplier quoted case cost (USD)</span>
        <Input
          className="h-8 text-sm"
          type="number"
          min={0}
          step="0.01"
          disabled={disabled}
          value={moneyInputValue(quoted)}
          onChange={(e) => onQuoted(parseMoney(e.target.value))}
        />
      </label>
      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Landed case cost (USD)</span>
        <Input
          className="h-8 text-sm"
          type="number"
          min={0}
          step="0.01"
          disabled={disabled}
          value={moneyInputValue(landed)}
          onChange={(e) => onLanded(parseMoney(e.target.value))}
        />
      </label>
    </div>
  );
}

export function StepSupplierCost({
  draft,
  suppliers,
  disabled,
  onChange,
}: {
  draft: NewProductFamilyDraft;
  suppliers: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (patch: Partial<NewProductFamilyDraft>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Quoted cost and landed case cost are internal. Neither becomes the customer price.
      </p>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Supplier</span>
        <select
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
          disabled={disabled}
          value={draft.supplierId ?? ""}
          onChange={(e) => onChange({ supplierId: e.target.value || null })}
        >
          <option value="">Select a supplier</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs">
        <Link className="underline underline-offset-2" href="/dashboard/suppliers">
          Add a supplier
        </Link>{" "}
        if this vendor is not in the list, then return here.
      </p>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Cost source</span>
        <select
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
          disabled={disabled}
          value={draft.costSourceType}
          onChange={(e) => onChange({ costSourceType: e.target.value })}
        >
          {COST_SOURCE_TYPES.map((source) => (
            <option key={source} value={source}>
              {COST_SOURCE_TYPE_LABELS[source]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Source reference</span>
        <Input
          className="h-8 text-sm"
          disabled={disabled}
          value={draft.costSourceReference}
          placeholder="Quote, invoice, or price-sheet id"
          onChange={(e) => onChange({ costSourceReference: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={draft.sameCostForAllSizes}
          disabled={disabled}
          onChange={(e) => onChange({ sameCostForAllSizes: e.target.checked })}
        />
        Same case cost for every size
      </label>
      {draft.sameCostForAllSizes ? (
        <CostPair
          quoted={draft.quotedCaseCost}
          landed={draft.landedCaseCost}
          disabled={disabled}
          onQuoted={(quotedCaseCost) => onChange({ quotedCaseCost })}
          onLanded={(landedCaseCost) => onChange({ landedCaseCost, landedCostConfirmed: false })}
        />
      ) : (
        <div className="space-y-3">
          {draft.sizes.map((size: FamilySizeSlug) => {
            const row = draft.costBySize[size] ?? { quotedCaseCost: null, landedCaseCost: null };
            return (
              <div key={size} className="rounded-md border border-border/70 p-3">
                <p className="mb-2 text-xs font-semibold">{SIZE_LABEL[size] ?? size.toUpperCase()}</p>
                <CostPair
                  quoted={row.quotedCaseCost}
                  landed={row.landedCaseCost}
                  disabled={disabled}
                  onQuoted={(quotedCaseCost) =>
                    onChange({
                      costBySize: { ...draft.costBySize, [size]: { ...row, quotedCaseCost } },
                    })
                  }
                  onLanded={(landedCaseCost) =>
                    onChange({
                      landedCostConfirmed: false,
                      costBySize: { ...draft.costBySize, [size]: { ...row, landedCaseCost } },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      )}
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={draft.landedCostConfirmed}
          disabled={disabled}
          onChange={(e) => onChange({ landedCostConfirmed: e.target.checked })}
        />
        <span>
          I confirm this landed case cost is the real cost for one case after freight and duties. It is not the
          customer price.
        </span>
      </label>
    </div>
  );
}

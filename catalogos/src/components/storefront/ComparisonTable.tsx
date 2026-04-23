"use client";

import Link from "next/link";
import { useCompare, type CompareItem } from "./CompareContext";

function getAttr(item: CompareItem, key: string): string {
  const v = item.attributes?.[key];
  if (v == null) return "—";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v).replace(/_/g, " ");
}

function formatLabel(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ROWS: { key: keyof CompareItem["attributes"] | "name" | "price_per_glove" | "price_per_case"; label: string }[] = [
  { key: "name", label: "Product" },
  { key: "material", label: "Material" },
  { key: "thickness_mil", label: "Thickness (mil)" },
  { key: "color", label: "Color" },
  { key: "powder", label: "Powder" },
  { key: "texture", label: "Texture" },
  { key: "grade", label: "Grade" },
  { key: "box_qty", label: "Pack size" },
  { key: "price_per_glove", label: "Price per glove" },
  { key: "price_per_case", label: "Price per case" },
];

export function ComparisonTable() {
  const { items, remove } = useCompare();

  if (items.length === 0) return null;

  const pricePerGloves = items.map((i) => i.pricePerGlove.price_per_glove).filter((p): p is number => p != null && p > 0);
  const minPricePerGlove = pricePerGloves.length ? Math.min(...pricePerGloves) : null;
  const casePrices = items.map((i) => i.best_price).filter((p): p is number => p != null && p > 0);
  const minCasePrice = casePrices.length ? Math.min(...casePrices) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Compare gloves</h2>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Attribute</th>
              {items.map((item) => (
                <th key={item.id} className="max-w-[180px] px-3 py-2 text-left font-medium">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/product/${item.slug ?? item.id}`} className="line-clamp-2 hover:underline">
                      {item.name}
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="Remove from comparison"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, label }) => (
              <tr key={key} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium text-muted-foreground">{label}</td>
                {items.map((item) => {
                  let value: string;
                  let isBest = false;
                  if (key === "name") value = item.name;
                  else if (key === "price_per_glove") {
                    value = item.pricePerGlove.display_per_glove;
                    isBest = minPricePerGlove != null && item.pricePerGlove.price_per_glove === minPricePerGlove;
                  } else if (key === "price_per_case") {
                    value = item.pricePerGlove.display_case;
                    isBest = minCasePrice != null && item.best_price === minCasePrice;
                  } else value = getAttr(item, key);
                  return (
                    <td
                      key={item.id}
                      className={`max-w-[180px] px-3 py-2 ${isBest ? "bg-primary/10 font-medium" : ""}`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

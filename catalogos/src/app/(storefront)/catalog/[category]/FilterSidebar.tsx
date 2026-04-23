"use client";

import Link from "next/link";
import { buildCatalogSearchString } from "@/lib/catalog/params";
import type { StorefrontFilterParams } from "@/lib/catalog/types";
import type { FacetCounts } from "@/lib/catalog/types";

interface FacetDef {
  attribute_key: string;
  label: string;
  display_group: string | null;
  sort_order: number;
  cardinality: string;
}

interface FilterSidebarProps {
  basePath: string;
  facets: FacetCounts;
  facetDefinitions: FacetDef[];
  selectedParams: StorefrontFilterParams;
  priceBounds: { min: number; max: number };
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function FilterSidebar({ basePath, facets, facetDefinitions, selectedParams, priceBounds }: FilterSidebarProps) {
  const groups = new Map<string | null, FacetDef[]>();
  for (const def of facetDefinitions) {
    const g = def.display_group ?? null;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(def);
  }
  const groupOrder = Array.from(groups.keys()).sort((a, b) => (a ?? "").localeCompare(b ?? ""));

  return (
    <nav className="space-y-6">
      <h2 className="text-sm font-semibold text-foreground">Filters</h2>

      {priceBounds.max > priceBounds.min && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Price range</p>
          <p className="text-sm text-foreground">
            ${priceBounds.min.toFixed(0)} – ${priceBounds.max.toFixed(0)}
          </p>
        </div>
      )}

      {groupOrder.map((group) => {
        const defs = groups.get(group)!;
        return (
          <div key={group ?? "ungrouped"} className="space-y-3">
            {group && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</p>}
            {defs.map((def) => {
              const values = facets[def.attribute_key] ?? [];
              if (values.length === 0) return null;
              const selected = (selectedParams[def.attribute_key as keyof StorefrontFilterParams] as string[] | undefined) ?? [];
              return (
                <div key={def.attribute_key} className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">{def.label}</p>
                  <ul className="space-y-0.5">
                    {values.map(({ value, count }) => {
                      const isSelected = selected.includes(value);
                      const newParams = { ...selectedParams };
                      let nextArr: string[];
                      if (isSelected) {
                        nextArr = selected.filter((v) => v !== value);
                      } else {
                        nextArr = def.cardinality === "multi" ? [...selected, value] : [value];
                      }
                      (newParams as unknown as Record<string, string[]>)[def.attribute_key] = nextArr;
                      const url = basePath + buildCatalogSearchString(newParams, { page: 1 });
                      return (
                        <li key={value}>
                          <Link
                            href={url}
                            className={`block text-sm ${isSelected ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {formatLabel(value)} ({count})
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

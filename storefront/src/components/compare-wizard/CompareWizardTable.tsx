"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { CompareWizardRow } from "@/lib/catalog/compare-wizard-utils.types";
import {
  filterCompareWizardRows,
  sortCompareWizardRows,
  uniqueIndividualSizeOptions,
  type CompareWizardSortDir,
  type CompareWizardSortKey,
} from "@/lib/catalog/compare-wizard-utils";
import { cn } from "@/lib/utils";

type ColumnDef = {
  key: CompareWizardSortKey;
  label: string;
  align?: "right";
};

const COLUMNS: ColumnDef[] = [
  { key: "sku", label: "SKU" },
  { key: "name", label: "Product Name" },
  { key: "boxesPerCase", label: "Boxes/Case" },
  { key: "sizes", label: "Sizes" },
  { key: "material", label: "Material" },
  { key: "color", label: "Color" },
  { key: "thicknessMil", label: "Thickness" },
  { key: "grade", label: "Grade" },
  { key: "certifications", label: "Certifications" },
  { key: "casePrice", label: "Case Price", align: "right" },
  { key: "palletPrice", label: "Pallet Price", align: "right" },
  { key: "bestFor", label: "Best For" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const COLOR_DOT: Record<string, string> = {
  black: "#111827",
  blue: "#2563eb",
  clear: "#cbd5e1",
  green: "#16a34a",
  orange: "#ea580c",
  white: "#f8fafc",
  natural: "#d4a574",
  tan: "#d4a574",
  mixed: "linear-gradient(90deg,#2563eb,#111827,#16a34a)",
};

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function badgeClass(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("closeout")) return "bg-red-100 text-red-800";
  if (lower.includes("deal") || lower.includes("value")) return "bg-orange-100 text-orange-800";
  if (lower.includes("seller") || lower.includes("rated") || lower.includes("safe")) return "bg-emerald-100 text-emerald-800";
  if (lower.includes("exam") || lower.includes("sampler")) return "bg-sky-100 text-sky-800";
  if (lower.includes("margin")) return "bg-violet-100 text-violet-800";
  if (lower.includes("moq")) return "bg-cyan-100 text-cyan-800";
  return "bg-neutral-100 text-neutral-700";
}

function colorDotStyle(colorLabel: string | null): React.CSSProperties | undefined {
  if (!colorLabel) return undefined;
  const key = colorLabel.toLowerCase().split(/[\s,/]+/)[0];
  const fill = COLOR_DOT[key];
  if (!fill) return undefined;
  if (fill.startsWith("linear-gradient")) return { background: fill };
  return { backgroundColor: fill, border: key === "white" || key === "clear" ? "1px solid #cbd5e1" : undefined };
}

function uniqueFilterValues(rows: CompareWizardRow[], key: "material" | "grade" | "color"): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const val = row[key];
    if (typeof val === "string" && val.trim()) set.add(val.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function CompareWizardTable({ rows }: { rows: CompareWizardRow[] }) {
  const [material, setMaterial] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [grade, setGrade] = React.useState("");
  const [color, setColor] = React.useState("");
  const [size, setSize] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<CompareWizardSortKey>("name");
  const [sortDir, setSortDir] = React.useState<CompareWizardSortDir>("asc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);

  const materialOptions = React.useMemo(() => uniqueFilterValues(rows, "material"), [rows]);
  const gradeOptions = React.useMemo(() => uniqueFilterValues(rows, "grade"), [rows]);
  const colorOptions = React.useMemo(() => uniqueFilterValues(rows, "color"), [rows]);
  const sizeOptions = React.useMemo(() => uniqueIndividualSizeOptions(rows), [rows]);
  const industryOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      for (const label of row.industries) set.add(label);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = React.useMemo(
    () =>
      filterCompareWizardRows(rows, {
        material: material || undefined,
        industry: industry || undefined,
        grade: grade || undefined,
        color: color || undefined,
        size: size || undefined,
        search,
      }),
    [rows, material, industry, grade, color, size, search]
  );

  const sorted = React.useMemo(() => sortCompareWizardRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [material, grade, color, size, industry, search, pageSize]);

  function toggleSort(key: CompareWizardSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearFilters() {
    setMaterial("");
    setIndustry("");
    setGrade("");
    setColor("");
    setSize("");
    setSearch("");
  }

  const hasFilters = Boolean(material || industry || grade || color || size || search.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
        <FilterSelect label="Material" value={material} onChange={setMaterial} options={materialOptions} />
        <FilterSelect label="Industry" value={industry} onChange={setIndustry} options={industryOptions} />
        <FilterSelect label="Grade" value={grade} onChange={setGrade} options={gradeOptions} />
        <FilterSelect label="Color" value={color} onChange={setColor} options={colorOptions} />
        <FilterSelect label="Size" value={size} onChange={setSize} options={sizeOptions} />
        <div className="min-w-[140px] flex-1 basis-[160px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Search</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search within results…"
            className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none ring-[#f06232]/30 focus:border-[#f06232] focus:ring-2"
          />
        </div>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasFilters}
          className="h-9 shrink-0 rounded-md border border-neutral-300 px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear filters
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="min-w-[1200px] w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-neutral-50 text-[11px] font-bold uppercase tracking-wide text-neutral-600 shadow-[0_1px_0_0_rgb(229_229_229)]">
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className={cn("border-b border-neutral-200 px-3 py-2.5", col.align === "right" && "text-right")}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-[#f06232]",
                        col.align === "right" && "ml-auto",
                      )}
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />
                      )}
                    </button>
                  </th>
                ))}
                <th className="border-b border-neutral-200 px-3 py-2.5">Deal / Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-neutral-500">
                    No products match your filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-neutral-100 odd:bg-white even:bg-neutral-50/60 hover:bg-orange-50/40">
                    <td className="px-3 py-2.5 font-mono text-[13px]">
                      {row.sku ? (
                        <Link href={row.pdpHref} className="font-semibold text-[#2563eb] hover:underline">
                          {row.sku}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <Link href={row.pdpHref} className="font-medium text-[#2563eb] hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.boxesPerCase ?? "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{row.sizes ?? "—"}</td>
                    <td className="px-3 py-2.5">{row.material ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        {row.color ? (
                          <>
                            <span
                              aria-hidden
                              className="inline-block h-3 w-3 shrink-0 rounded-full"
                              style={colorDotStyle(row.color)}
                            />
                            {row.color}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{row.thicknessMil ?? "—"}</td>
                    <td className="px-3 py-2.5">{row.grade ?? "—"}</td>
                    <td className="max-w-[180px] px-3 py-2.5 text-xs leading-snug">{row.certifications ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatPrice(row.casePrice)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatPrice(row.palletPrice)}</td>
                    <td className="max-w-[180px] px-3 py-2.5 text-xs leading-snug">{row.bestFor ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {row.badges.length ? (
                          row.badges.map((badge) => (
                            <span
                              key={badge}
                              className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", badgeClass(badge))}
                            >
                              {badge}
                            </span>
                          ))
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
        <p>
          Showing {sorted.length === 0 ? 0 : pageStart + 1} to {Math.min(pageStart + pageSize, sorted.length)} of {sorted.length} products
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}
              className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[4rem] text-center tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="min-w-[120px] flex-1 basis-[130px] sm:flex-none sm:basis-auto sm:min-w-[130px]">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

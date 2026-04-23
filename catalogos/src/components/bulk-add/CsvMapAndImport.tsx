"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBulkCsvImport, type BulkCsvImportRowResult } from "@/app/actions/bulk-csv-add";
import { parseCsvLoose } from "./parse-csv-loose";
import { BulkImportResultsTable } from "./BulkImportResultsTable";

type MappableField = "sku" | "name" | "category_slug" | "cost";

const FIELD_META: { key: MappableField; label: string; required: boolean }[] = [
  { key: "sku", label: "SKU", required: true },
  { key: "name", label: "Name", required: true },
  { key: "category_slug", label: "Category slug", required: false },
  { key: "cost", label: "Case cost (USD)", required: false },
];

function guessMapping(headers: string[]): Record<MappableField, number | ""> {
  const lower = headers.map((h) => h.toLowerCase().replace(/\s+/g, "_").replace(/#/g, "number"));
  const pick = (...needles: string[]) => {
    for (const n of needles) {
      const i = lower.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return "" as const;
  };
  return {
    sku: pick("sku", "item", "part_number", "partnumber", "style"),
    name: pick("name", "title", "product_name", "description"),
    category_slug: pick("category_slug", "category", "slug", "cat"),
    cost: pick("normalized_case_cost", "case_cost", "cost", "price", "unit_cost"),
  };
}

function colLabel(headers: string[], idx: number) {
  const h = headers[idx]?.trim();
  return h ? `${h} (col ${idx + 1})` : `Column ${idx + 1}`;
}

export function CsvMapAndImport({ supplierId }: { supplierId: string }) {
  const [matrix, setMatrix] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<MappableField, number | "">>({
    sku: "",
    name: "",
    category_slug: "",
    cost: "",
  });
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [results, setResults] = useState<BulkCsvImportRowResult[] | null>(null);

  const headers = matrix?.[0]?.map((c) => String(c)) ?? [];
  const dataRows = matrix && matrix.length > 1 ? matrix.slice(1) : [];

  const onFile = useCallback((file: File | null) => {
    setResults(null);
    setBanner(null);
    if (!file) {
      setMatrix(null);
      setFileName(null);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseCsvLoose(text);
      if (rows.length === 0) {
        setMatrix(null);
        setBanner("No rows found in file.");
        return;
      }
      setMatrix(rows);
      setMapping(guessMapping(rows[0]!.map((c) => String(c))));
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const mappedPayload = useMemo(() => {
    if (!matrix || dataRows.length === 0) return [];
    const pick = (row: string[], field: MappableField) => {
      const idx = mapping[field];
      if (idx === "") return undefined;
      const v = row[idx];
      return v !== undefined && v !== null ? String(v) : undefined;
    };
    return dataRows.map((row) => ({
      sku: pick(row, "sku"),
      name: pick(row, "name"),
      category_slug: pick(row, "category_slug"),
      normalized_case_cost: pick(row, "cost"),
    }));
  }, [matrix, dataRows, mapping]);

  async function runImport() {
    setBanner(null);
    setResults(null);
    if (mapping.sku === "" || mapping.name === "") {
      setBanner("Map both SKU and Name to a column before importing.");
      return;
    }
    if (mappedPayload.length === 0) {
      setBanner("No data rows to import.");
      return;
    }
    setBusy(true);
    try {
      const r = await createBulkCsvImport({
        supplier_id: supplierId,
        source_filename: fileName,
        rows: mappedPayload,
      });
      if (!r.success) {
        setBanner(r.error);
        return;
      }
      setResults(r.results);
      const failed = r.results.filter((x) => x.error).length;
      if (failed > 0) {
        setBanner(`Imported with ${failed} row error(s). Open successful rows in Quick Add below.`);
      } else {
        setBanner(`Imported ${r.results.length} row(s).`);
      }
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const preview = dataRows.slice(0, 8);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <Label htmlFor="csv-file">CSV file</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        {fileName ? <p className="text-xs text-muted-foreground">Loaded: {fileName}</p> : null}
      </div>

      {matrix && headers.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELD_META.map(({ key, label, required }) => (
              <div key={key} className="space-y-1">
                <Label>
                  {label}
                  {required ? <span className="text-destructive"> *</span> : null}
                </Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={mapping[key] === "" ? "" : String(mapping[key])}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMapping((m) => ({ ...m, [key]: v === "" ? "" : Number(v) }));
                  }}
                  disabled={busy}
                >
                  <option value="">{required ? "— select column —" : "— none —"}</option>
                  {headers.map((_, colIdx) => (
                    <option key={colIdx} value={String(colIdx)}>
                      {colLabel(headers, colIdx)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-sm font-medium mb-2">Preview (first rows)</h2>
            <div className="rounded-md border border-border overflow-x-auto text-xs">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    {headers.map((h, i) => (
                      <th key={i} className="text-left px-2 py-1 font-medium whitespace-nowrap">
                        {h || `Col ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, ri) => (
                    <tr key={ri} className="border-b border-border last:border-0">
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-2 py-1 max-w-[12rem] truncate">
                          {r[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Button type="button" onClick={() => void runImport()} disabled={busy}>
            {busy ? "Importing…" : "Import to staging"}
          </Button>
        </>
      ) : null}

      {banner ? <p className="text-sm text-muted-foreground">{banner}</p> : null}
      {results ? <BulkImportResultsTable results={results} /> : null}
    </div>
  );
}

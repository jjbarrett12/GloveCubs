"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const SAMPLE_PREVIEW_ROWS = 5;

export function CsvImportClient({
  suppliers,
}: {
  suppliers: { id: string; name: string }[];
}) {
  const [csvText, setCsvText] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    headers: string[];
    sampleRows: Record<string, unknown>[];
    rowCount: number;
    inferredMapping: {
      mappings: { source_column: string; mapped_field: string; confidence: number }[];
      unmapped_columns: string[];
      average_confidence: number;
      warnings: string[];
    } | null;
    validationSummary: { valid_count: number; invalid_count: number; errors: string[] } | null;
    confidenceSummary: { average: number; low_confidence_fields: string[] } | null;
    profileReused?: boolean;
  } | null>(null);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(infer = true) {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/csv-import/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv_text: csvText,
          filename: "upload.csv",
          supplier_id: supplierId || null,
          infer_mapping: infer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSessionId(data.sessionId);
      setPreview({
        headers: data.headers ?? [],
        sampleRows: data.sampleRows ?? [],
        rowCount: data.rowCount ?? 0,
        inferredMapping: data.inferredMapping ?? null,
        validationSummary: data.validationSummary ?? null,
        confidenceSummary: data.confidenceSummary ?? null,
        profileReused: data.profileReused,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleInfer() {
    if (!sessionId) return;
    setError(null);
    setInferring(true);
    try {
      const res = await fetch(`/api/csv-import/preview/${sessionId}/infer`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Infer failed");
      setPreview((p) =>
        p
          ? {
              ...p,
              inferredMapping: data.inferredMapping ?? p.inferredMapping,
              validationSummary: data.validationSummary ?? p.validationSummary,
              confidenceSummary: data.confidenceSummary ?? p.confidenceSummary,
            }
          : p
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Infer failed");
    } finally {
      setInferring(false);
    }
  }

  async function handleImport() {
    if (!sessionId || !supplierId) {
      setError("Select a supplier and run upload first.");
      return;
    }
    setError(null);
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/csv-import/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          csv_text: csvText,
          supplier_id: supplierId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleSaveProfile() {
    if (!sessionId) return;
    setError(null);
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/csv-import/preview/${sessionId}/save-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_name: "Saved mapping" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setError(null);
      alert(`Profile saved: ${data.profile_name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Upload CSV</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste CSV content. First row = headers. Optionally select supplier for profile reuse.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="supplier">Supplier (optional)</Label>
            <select
              id="supplier"
              className="mt-1 block w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="csv">CSV content</Label>
            <Textarea
              id="csv"
              className="mt-1 font-mono text-xs min-h-[200px]"
              placeholder="sku,name,price&#10;GLV-1,Nitrile Gloves,12.99"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={() => handleUpload(true)} disabled={!csvText.trim() || uploading}>
              {uploading ? "Uploading…" : "Upload & infer mapping"}
            </Button>
            <Button variant="outline" onClick={() => handleUpload(false)} disabled={!csvText.trim() || uploading}>
              Upload only
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Preview</CardTitle>
            <p className="text-sm text-muted-foreground">
              {preview.rowCount} rows, {preview.headers.length} columns
              {preview.profileReused && " · Profile reused"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!preview.inferredMapping && (
              <Button onClick={handleInfer} disabled={inferring}>
                {inferring ? "Inferring…" : "Infer mapping (AI)"}
              </Button>
            )}

            {preview.inferredMapping && (
              <>
                <div>
                  <h4 className="text-sm font-medium mb-2">Detected columns → Mapped field (confidence)</h4>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2">Source column</th>
                          <th className="text-left p-2">Mapped field</th>
                          <th className="text-right p-2">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.inferredMapping.mappings.map((m) => (
                          <tr key={m.source_column} className="border-b">
                            <td className="p-2 font-mono">{m.source_column}</td>
                            <td className="p-2">{m.mapped_field}</td>
                            <td className="p-2 text-right">
                              <Badge variant={m.confidence >= 0.8 ? "default" : "secondary"}>
                                {(m.confidence * 100).toFixed(0)}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {preview.inferredMapping.unmapped_columns?.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Unmapped: {preview.inferredMapping.unmapped_columns.join(", ")}
                  </p>
                )}
                {preview.inferredMapping.warnings?.length > 0 && (
                  <p className="text-sm text-amber-600">
                    Warnings: {preview.inferredMapping.warnings.join("; ")}
                  </p>
                )}
                {preview.confidenceSummary && (
                  <p className="text-sm">
                    Average confidence: {(preview.confidenceSummary.average * 100).toFixed(0)}%
                    {preview.confidenceSummary.low_confidence_fields?.length > 0 &&
                      ` · Low: ${preview.confidenceSummary.low_confidence_fields.join(", ")}`}
                  </p>
                )}
                {preview.validationSummary && (
                  <p className="text-sm">
                    Validation: {preview.validationSummary.valid_count} valid, {preview.validationSummary.invalid_count} invalid
                    {preview.validationSummary.errors?.length > 0 &&
                      ` · ${preview.validationSummary.errors.slice(0, 3).join("; ")}`}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleImport}
                    disabled={!supplierId || importing}
                  >
                    {importing ? "Importing…" : "Accept mapping & run import"}
                  </Button>
                  <Button variant="outline" onClick={handleSaveProfile} disabled={savingProfile}>
                    {savingProfile ? "Saving…" : "Save profile for future"}
                  </Button>
                </div>
              </>
            )}

            <div>
              <h4 className="text-sm font-medium mb-2">Sample rows (first {SAMPLE_PREVIEW_ROWS})</h4>
              <div className="overflow-x-auto border rounded-md text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {preview.headers.slice(0, 8).map((h) => (
                        <th key={h} className="text-left p-2 truncate max-w-[120px]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.slice(0, SAMPLE_PREVIEW_ROWS).map((row, i) => (
                      <tr key={i} className="border-b">
                        {preview.headers.slice(0, 8).map((h) => (
                          <td key={h} className="p-2 truncate max-w-[120px]" title={String(row[h] ?? "")}>
                            {String(row[h] ?? "").slice(0, 30)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {importResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Import result</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>Batch: {(importResult.batchId as string)?.slice(0, 8)}…</p>
            <p>Rows imported: {String(importResult.rowsImported ?? importResult.rowsSucceeded ?? 0)}</p>
            <p>Supplier offers created: {String(importResult.supplierOffersCreated ?? 0)}</p>
            {(importResult.rowsSkipped as number) > 0 && (
              <p className="text-amber-600">Rows skipped (validation): {String(importResult.rowsSkipped ?? 0)}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

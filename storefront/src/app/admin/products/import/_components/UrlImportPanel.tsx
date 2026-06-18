"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  adminAlertSurface,
  adminCardSurface,
  adminFormInput,
  adminFormLabel,
  adminPrimaryButton,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export type UrlImportPanelProps = {
  offline: boolean;
  offlineMessage: string;
};

function deriveHost(value: string): string {
  try {
    const u = new URL(value.trim());
    return u.hostname || "";
  } catch {
    return "";
  }
}

const inputClass = cn(adminFormInput, "mt-2 w-full rounded-lg shadow-inner disabled:opacity-50");

export function UrlImportPanel({ offline, offlineMessage }: UrlImportPanelProps) {
  const router = useRouter();
  const [supplierName, setSupplierName] = React.useState("");
  const [startUrl, setStartUrl] = React.useState("");
  const [allowedDomain, setAllowedDomain] = React.useState("");
  const [allowedDomainTouched, setAllowedDomainTouched] = React.useState(false);
  const [crawlMode, setCrawlMode] = React.useState<"single_product" | "category">("category");
  const [maxPages, setMaxPages] = React.useState<number>(50);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (allowedDomainTouched) return;
    const host = deriveHost(startUrl);
    setAllowedDomain(host);
  }, [startUrl, allowedDomainTouched]);

  React.useEffect(() => {
    if (crawlMode === "single_product") setMaxPages(1);
    else if (maxPages < 2) setMaxPages(50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlMode]);

  const disabled = offline || submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setError(null);
    if (!supplierName.trim()) {
      setError("Supplier name is required.");
      return;
    }
    if (!startUrl.trim()) {
      setError("Start URL is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/admin/api/products/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name: supplierName.trim(),
          start_url: startUrl.trim(),
          allowed_domain: allowedDomain.trim() || undefined,
          crawl_mode: crawlMode,
          max_pages: maxPages,
        }),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg =
          (typeof data.error === "string" && data.error) ||
          `Import failed (status ${res.status}).`;
        setError(msg);
        return;
      }
      const jobId = typeof data.jobId === "string" ? data.jobId : null;
      if (jobId) {
        router.push(`/admin/products/import/jobs/${encodeURIComponent(jobId)}`);
        return;
      }
      setError("Import accepted but no jobId returned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(adminCardSurface, "space-y-5 p-6")}
      aria-label="URL import"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-admin-border-subtle pb-4">
        <h2 className="text-lg font-semibold text-admin-primary">Supplier URL crawl</h2>
        <p className="text-sm text-admin-secondary">
          This console starts the job; extraction runs in the catalog sync service.
        </p>
      </div>

      {offline ? (
        <div className={adminAlertSurface("critical")}>{offlineMessage}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={adminFormLabel}>Supplier name</span>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            disabled={disabled}
            placeholder="Acme Glove Co"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={adminFormLabel}>Crawl mode</span>
          <select
            value={crawlMode}
            onChange={(e) => setCrawlMode(e.target.value as "single_product" | "category")}
            disabled={disabled}
            className={inputClass}
          >
            <option value="single_product">Single product</option>
            <option value="category">Category</option>
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className={adminFormLabel}>Start URL</span>
          <input
            type="url"
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            disabled={disabled}
            placeholder="https://supplier.example.com/products/..."
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={adminFormLabel}>Allowed domain</span>
          <input
            type="text"
            value={allowedDomain}
            onChange={(e) => {
              setAllowedDomain(e.target.value);
              setAllowedDomainTouched(true);
            }}
            disabled={disabled}
            placeholder="supplier.example.com"
            className={inputClass}
          />
          <span className="mt-1.5 block text-xs text-admin-muted">
            Auto-filled from start URL host. Override only if needed.
          </span>
        </label>

        <label className="block">
          <span className={adminFormLabel}>Max pages</span>
          <input
            type="number"
            min={1}
            max={500}
            value={maxPages}
            onChange={(e) => {
              const n = Number(e.target.value);
              setMaxPages(Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 500) : 1);
            }}
            disabled={disabled || crawlMode === "single_product"}
            className={inputClass}
          />
          <span className="mt-1.5 block text-xs text-admin-muted">
            {crawlMode === "single_product" ? "Single product mode crawls exactly 1 page." : "Capped at 500."}
          </span>
        </label>
      </div>

      {error ? (
        <div className={adminAlertSurface("critical")}>{error}</div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-admin-border-subtle pt-4 sm:flex-row sm:items-center">
        <button type="submit" disabled={disabled} className={cn(adminPrimaryButton, "px-5 py-2.5")}>
          {submitting ? "Starting…" : "Start URL import"}
        </button>
        <p className="text-sm text-admin-secondary">
          Large category crawls can take a few minutes; keep this tab open until the run finishes.
        </p>
      </div>
    </form>
  );
}

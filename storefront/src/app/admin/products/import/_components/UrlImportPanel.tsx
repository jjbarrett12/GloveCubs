"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
      className="space-y-4 rounded-lg border border-white/10 bg-[#161616] p-5 shadow-sm ring-1 ring-white/[0.03]"
      aria-label="URL import"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-3">
        <h2 className="text-base font-semibold text-white">URL import</h2>
        <p className="text-xs text-neutral-500">
          Storefront only proxies. CatalogOS runs the crawl and extraction.
        </p>
      </div>

      {offline ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {offlineMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Supplier name
          </span>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            disabled={disabled}
            placeholder="Acme Glove Co"
            className="mt-1 w-full rounded-md border border-white/12 bg-[#0e0e0e] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40 disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Crawl mode
          </span>
          <select
            value={crawlMode}
            onChange={(e) => setCrawlMode(e.target.value as "single_product" | "category")}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-white/12 bg-[#0e0e0e] px-3 py-2 text-sm text-neutral-100 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40 disabled:opacity-50"
          >
            <option value="single_product">Single product</option>
            <option value="category">Category</option>
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Start URL
          </span>
          <input
            type="url"
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            disabled={disabled}
            placeholder="https://supplier.example.com/products/..."
            className="mt-1 w-full rounded-md border border-white/12 bg-[#0e0e0e] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40 disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Allowed domain
          </span>
          <input
            type="text"
            value={allowedDomain}
            onChange={(e) => {
              setAllowedDomain(e.target.value);
              setAllowedDomainTouched(true);
            }}
            disabled={disabled}
            placeholder="supplier.example.com"
            className="mt-1 w-full rounded-md border border-white/12 bg-[#0e0e0e] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40 disabled:opacity-50"
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            Auto-filled from start URL host. Override only if needed.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Max pages
          </span>
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
            className="mt-1 w-full rounded-md border border-white/12 bg-[#0e0e0e] px-3 py-2 text-sm text-neutral-100 focus:border-[#f06232]/50 focus:outline-none focus:ring-1 focus:ring-[#f06232]/40 disabled:opacity-50"
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            {crawlMode === "single_product" ? "Single product mode crawls exactly 1 page." : "Capped at 500."}
          </span>
        </label>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3 border-t border-white/10 pt-3">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start URL import"}
        </button>
        <p className="text-xs text-neutral-500">
          The crawl runs synchronously inside CatalogOS; this may take up to a few minutes for category crawls.
        </p>
      </div>
    </form>
  );
}

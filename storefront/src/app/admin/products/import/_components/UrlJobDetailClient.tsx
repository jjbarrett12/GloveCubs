"use client";

import * as React from "react";
import Link from "next/link";
import { ImportStatusBadge } from "./ImportStatusBadge";
import {
  adaptUrlImportJobDetail,
  isTerminalStatus,
  type UrlImportExtractedProduct,
  type UrlImportJobDetail,
} from "@/lib/admin/url-import-adapter";
import { StatCard, StatGrid, EmptyState } from "@/components/admin";

const POLL_INTERVAL_MS = 4000;

type BridgeResult =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; batchId: string | null; normalizedCount: number | null }
  | { kind: "error"; message: string };

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function formatNumber(n: number | null): string | number {
  return n == null ? "—" : new Intl.NumberFormat().format(n);
}

function ImageEvidenceStrip({ images }: { images: string[] }) {
  if (images.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-xs text-slate-500">
        No images extracted
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {images.slice(0, 6).map((url, i) => (
        <a
          key={`${url}-${i}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
          title={url}
        >
          {/* Operator review — domain-agnostic; external images shown as-is. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        </a>
      ))}
      {images.length > 6 ? (
        <span className="self-end font-mono text-[10px] text-neutral-500">+{images.length - 6} more</span>
      ) : null}
    </div>
  );
}

function DuplicateMatchList({ matches }: { matches: UrlImportExtractedProduct["duplicateCandidates"] }) {
  if (matches.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
        Duplicate candidates ({matches.length})
      </p>
      <ul className="mt-1 space-y-1">
        {matches.slice(0, 5).map((m, i) => (
          <li key={`${m.targetId ?? "_"}-${i}`} className="text-sm text-amber-950">
            <span className="font-medium">{m.label}</span>
            {m.similarity != null ? (
              <span className="ml-2 font-mono text-xs text-amber-800">
                {(m.similarity * (m.similarity <= 1 ? 100 : 1)).toFixed(0)}%
              </span>
            ) : null}
            {m.reasons.length > 0 ? (
              <span className="ml-2 text-amber-800">· {m.reasons.slice(0, 3).join(" · ")}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExtractedProductCard({
  product,
  checked,
  onToggle,
  disabled,
}: {
  product: UrlImportExtractedProduct;
  checked: boolean;
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(product.id)}
          disabled={disabled}
          aria-label={`Select ${product.title}`}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#f06232] focus:ring-[#f06232]/30"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{product.title}</h3>
            {product.confidence != null ? (
              <span
                className="font-mono text-xs text-slate-500"
                title="Extraction confidence from import service"
              >
                conf {(product.confidence * 100).toFixed(0)}%
                {product.aiUsed ? " · AI" : ""}
              </span>
            ) : null}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
            {product.brand ? (
              <div className="flex gap-2">
                <dt className="text-slate-500">Brand</dt>
                <dd className="text-slate-900">{product.brand}</dd>
              </div>
            ) : null}
            {product.sku ? (
              <div className="flex gap-2">
                <dt className="text-slate-500">SKU</dt>
                <dd className="font-mono text-slate-900">{product.sku}</dd>
              </div>
            ) : null}
            {product.mpn ? (
              <div className="flex gap-2">
                <dt className="text-slate-500">MPN</dt>
                <dd className="font-mono text-slate-900">{product.mpn}</dd>
              </div>
            ) : null}
            {product.gtin ? (
              <div className="flex gap-2">
                <dt className="text-slate-500">GTIN/UPC</dt>
                <dd className="font-mono text-slate-900">{product.gtin}</dd>
              </div>
            ) : null}
            {product.size ? (
              <div className="flex gap-2">
                <dt className="text-slate-500">Inferred size</dt>
                <dd className="text-slate-900">{product.size}</dd>
              </div>
            ) : null}
            {product.baseSku ? (
              <div className="flex gap-2">
                <dt className="text-slate-500">Base SKU</dt>
                <dd className="font-mono text-slate-900">{product.baseSku}</dd>
              </div>
            ) : null}
          </dl>

          {product.sourceUrl ? (
            <p className="mt-2 truncate text-xs">
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[#c2410c] hover:text-[#e5582d] hover:underline"
              >
                {product.sourceUrl}
              </a>
            </p>
          ) : null}

          {product.attributes.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {product.attributes.map((a) => (
                <li
                  key={a.key}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                >
                  <span className="text-slate-500">{a.key}:</span> <span className="text-slate-900">{a.value}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3">
            <ImageEvidenceStrip images={product.images} />
          </div>

          {product.warnings.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Warnings</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {product.warnings.slice(0, 6).map((w, i) => (
                  <li key={`${w}-${i}`}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3">
            <DuplicateMatchList matches={product.duplicateCandidates} />
          </div>
        </div>
      </div>
    </article>
  );
}

function BridgeActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  onBridge,
  disabledReason,
  result,
}: {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onBridge: () => void;
  disabledReason: string | null;
  result: BridgeResult;
}) {
  const disabled = selectedCount === 0 || result.kind === "submitting" || disabledReason !== null;
  return (
    <div className="sticky bottom-3 z-10 rounded-xl border border-slate-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            <span className="font-mono font-semibold text-slate-900">{selectedCount}</span> of{" "}
            <span className="font-mono font-semibold text-slate-900">{totalCount}</span> extracted rows selected
          </span>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={totalCount === 0 || result.kind === "submitting"}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Select all visible
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={selectedCount === 0 || result.kind === "submitting"}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        <div className="flex items-center gap-3">
          {disabledReason ? (
            <span className="text-xs font-medium text-amber-800">{disabledReason}</span>
          ) : null}
          <button
            type="button"
            onClick={onBridge}
            disabled={disabled}
            className="rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d] disabled:cursor-not-allowed disabled:opacity-50"
            title="Stages selected rows for upstream review. Does not publish."
          >
            {result.kind === "submitting" ? "Bridging…" : "Send selected to review queue"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        This does not publish products. It stages selected extracted rows for the catalog sync review path.
      </p>
    </div>
  );
}

export function UrlJobDetailClient({ jobId, initial }: { jobId: string; initial: UrlImportJobDetail | null }) {
  const [detail, setDetail] = React.useState<UrlImportJobDetail | null>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(initial ? new Date() : null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bridge, setBridge] = React.useState<BridgeResult>({ kind: "idle" });

  const status = detail?.job.status ?? "unknown";
  const isTerminal = isTerminalStatus(status);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/products/import/url/jobs/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Refresh failed (status ${res.status}).`;
        setError(msg);
        return;
      }
      const adapted = adaptUrlImportJobDetail(data);
      if (adapted) setDetail(adapted);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setRefreshing(false);
    }
  }, [jobId]);

  React.useEffect(() => {
    if (isTerminal) return;
    const handle = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [isTerminal, refresh]);

  if (!detail) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        Run <span className="font-mono">{jobId}</span> could not be loaded from the import service. {error ? <span>{error}</span> : null}
        <div className="mt-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const products = detail.products;
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(products.map((p) => p.id)));
  const clear = () => setSelected(new Set());

  const bridgeDisabledReason =
    !isTerminal && status !== "completed"
      ? "Wait for the crawl to finish before bridging."
      : null;

  async function doBridge() {
    if (selected.size === 0) return;
    setBridge({ kind: "submitting" });
    try {
      const res = await fetch(
        `/admin/api/products/import/url/jobs/${encodeURIComponent(jobId)}/bridge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_ids: Array.from(selected) }),
        }
      );
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
          `Bridge failed (status ${res.status}).`;
        setBridge({ kind: "error", message: msg });
        return;
      }
      const batchId = typeof data.batchId === "string" ? data.batchId : null;
      const normalizedCount =
        typeof data.normalizedCount === "number" && Number.isFinite(data.normalizedCount)
          ? data.normalizedCount
          : null;
      setBridge({ kind: "ok", batchId, normalizedCount });
      void refresh();
    } catch (e) {
      setBridge({ kind: "error", message: e instanceof Error ? e.message : "Network error." });
    }
  }

  const job = detail.job;

  return (
    <div className="space-y-6 pb-24">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ImportStatusBadge status={status} rawStatus={job.rawStatus} />
              <h2 className="truncate text-lg font-semibold text-slate-900">{job.supplierName}</h2>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-slate-500">{job.startUrl || "—"}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-400">job id: {job.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500">
              {lastRefreshed ? `Refreshed ${lastRefreshed.toISOString().slice(11, 19)} UTC` : "—"}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <StatGrid columns={6} className="gap-4">
            <StatCard label="Mode" value={job.crawlMode ?? "—"} />
            <StatCard label="Allowed domain" value={job.allowedDomain ?? "—"} />
            <StatCard label="Pages crawled" value={formatNumber(job.pagesCrawled)} color="blue" />
            <StatCard label="Product pages" value={formatNumber(job.productPagesDetected)} color="blue" />
            <StatCard label="Products extracted" value={formatNumber(job.productsExtracted)} color="green" />
            <StatCard
              label="Failed pages"
              value={formatNumber(job.failedPagesCount)}
              color={job.failedPagesCount && job.failedPagesCount > 0 ? "red" : "default"}
            />
          </StatGrid>
        </div>

        <dl className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-slate-500">Created</dt>
            <dd className="font-mono text-slate-900">{formatDate(job.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">Started</dt>
            <dd className="font-mono text-slate-900">{formatDate(job.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">Finished</dt>
            <dd className="font-mono text-slate-900">{formatDate(job.finishedAt)}</dd>
          </div>
        </dl>

        {job.warnings.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
              Job warnings ({job.warnings.length})
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {job.warnings.slice(0, 8).map((w, i) => (
                <li key={`${w}-${i}`}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </div>

      {bridge.kind === "ok" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          Sent to catalog sync review.
          {bridge.batchId ? (
            <span className="ml-1">
              Batch <span className="font-mono">{bridge.batchId}</span>
              {bridge.normalizedCount != null ? (
                <span> · {bridge.normalizedCount} normalized</span>
              ) : null}
              .{" "}
              <Link
                href={`/admin/products/review?batchId=${encodeURIComponent(bridge.batchId)}`}
                className="font-semibold text-[#c2410c] underline hover:text-[#e5582d]"
              >
                Open review queue
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}

      {bridge.kind === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Bridge failed: <span className="font-mono text-xs">{bridge.message}</span>
        </div>
      ) : null}

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80">
          <EmptyState
            title={isTerminal ? "No extracted products" : "Crawl in progress"}
            description={
              isTerminal
                ? "No extracted products were returned for this run."
                : "Extracted products will appear here as the import service finishes each page."
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <ExtractedProductCard
              key={p.id}
              product={p}
              checked={selected.has(p.id)}
              onToggle={toggle}
              disabled={bridge.kind === "submitting"}
            />
          ))}
        </div>
      )}

      <BridgeActionBar
        selectedCount={selected.size}
        totalCount={products.length}
        onSelectAll={selectAll}
        onClear={clear}
        onBridge={() => void doBridge()}
        disabledReason={bridgeDisabledReason}
        result={bridge}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  hasDraftSaveBlockers,
  hasPublishBlockers,
  readinessLabel,
  type EditorReadinessResult,
} from "@/lib/admin/product-editor-readiness";

type Props = {
  name: string;
  status: "draft" | "active";
  quoteOnly: boolean;
  parserVersion: string | null;
  readiness: EditorReadinessResult;
  storefrontPath: string | null;
  pending: boolean;
  dirty: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
};

export function ProductCommandHeader({
  name,
  status,
  quoteOnly,
  parserVersion,
  readiness,
  storefrontPath,
  pending,
  dirty,
  onSaveDraft,
  onPublish,
}: Props) {
  const publishBlocked = hasPublishBlockers(readiness);
  const draftSaveBlocked = hasDraftSaveBlockers(readiness);
  const readinessText = readinessLabel(readiness);

  return (
    <header className="sticky top-0 z-20 -mx-5 border-b border-slate-200/90 bg-white/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:-mx-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">{name || "Untitled product"}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {quoteOnly ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Quote only</span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {parserVersion ?? "Manual"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                publishBlocked ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {readinessText}
            </span>
            {dirty ? (
              <span className="text-[11px] font-medium text-[#c2410c]">Unsaved changes</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {storefrontPath ? (
            <Link
              href={storefrontPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              View storefront
            </Link>
          ) : null}
          <button
            type="button"
            disabled={pending || draftSaveBlocked}
            onClick={onSaveDraft}
            title={draftSaveBlocked ? readiness.draftSaveBlockers.map((b) => b.label).join("; ") : undefined}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={pending || publishBlocked}
            onClick={onPublish}
            title={publishBlocked ? readinessText : undefined}
            className="rounded-lg bg-[#f06232] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e5582d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      </div>
    </header>
  );
}

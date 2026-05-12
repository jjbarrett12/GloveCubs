"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import {
  recommendationApproveAction,
  recommendationArchiveAction,
  recommendationMarkReviewedAction,
  recommendationRejectAction,
} from "@/app/admin/procurement/recommendation-actions";

type Row = Record<string, unknown>;

export function ReviewQueueRow({ row, companyId }: { row: Row; companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const id = String(row.id);
  const opp = row.procurement_opportunity_id != null ? String(row.procurement_opportunity_id) : "";
  const status = String(row.trust_status ?? "");

  function fd(): FormData {
    const f = new FormData();
    f.set("company_id", companyId);
    f.set("savings_opportunity_id", id);
    f.set("procurement_opportunity_id", opp);
    return f;
  }

  function run(label: string, fn: (p: unknown, f: FormData) => Promise<{ ok: boolean; error?: string }>, form?: FormData) {
    setMessage(null);
    if (!opp) {
      setMessage("Missing procurement opportunity anchor on invoice.");
      return;
    }
    startTransition(async () => {
      const r = await fn(null, form ?? fd());
      if (!r.ok) setMessage(`${label}: ${r.error ?? "failed"}`);
      else router.refresh();
    });
  }

  return (
    <tr className="align-top text-sm hover:bg-blue-50/40">
      <td className="p-3 font-mono text-xs text-gray-700">{id.slice(0, 8)}…</td>
      <td className="p-3 text-gray-900">{status}</td>
      <td className="p-3 font-mono text-xs text-gray-700">{String(row.source_catalog_product_id).slice(0, 8)}…</td>
      <td className="p-3 font-mono text-xs text-gray-700">{String(row.candidate_catalog_product_id).slice(0, 8)}…</td>
      <td className="p-3 text-right font-mono tabular-nums text-gray-900">
        {row.estimated_delta_per_basis != null ? String(row.estimated_delta_per_basis) : "—"}
      </td>
      <td className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {opp && (
            <Link href={`/admin/procurement/opportunity/${opp}`} className="mr-1 text-xs font-medium text-blue-700 hover:underline">
              Spine
            </Link>
          )}
          {status === "draft" && (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              onClick={() => run("review", recommendationMarkReviewedAction)}
            >
              Mark reviewed
            </button>
          )}
          {status === "operator_reviewed" && (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-100 disabled:opacity-50"
              onClick={() => run("approve", recommendationApproveAction)}
            >
              Approve for workspace
            </button>
          )}
          {(status === "draft" || status === "operator_reviewed") && (
            <>
              <button
                type="button"
                disabled={pending}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => {
                  const reason = window.prompt("Rejection reason (required)") ?? "";
                  const f = fd();
                  f.set("reason", reason);
                  run("reject", recommendationRejectAction, f);
                }}
              >
                Reject
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => {
                  const reason = window.prompt("Archive reason (required)") ?? "";
                  const f = fd();
                  f.set("reason", reason);
                  run("archive", recommendationArchiveAction, f);
                }}
              >
                Archive
              </button>
            </>
          )}
        </div>
        {message && <p className="mt-2 text-xs text-amber-800">{message}</p>}
      </td>
    </tr>
  );
}

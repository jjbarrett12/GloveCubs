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
    <tr className="border-b border-white/10 align-top text-sm">
      <td className="py-2 pr-2 font-mono text-xs">{id.slice(0, 8)}…</td>
      <td className="py-2 pr-2">{status}</td>
      <td className="py-2 pr-2 font-mono text-xs">{String(row.source_catalog_product_id).slice(0, 8)}…</td>
      <td className="py-2 pr-2 font-mono text-xs">{String(row.candidate_catalog_product_id).slice(0, 8)}…</td>
      <td className="py-2 pr-2 text-right tabular-nums">{row.estimated_delta_per_basis != null ? String(row.estimated_delta_per_basis) : "—"}</td>
      <td className="py-2 space-x-1">
        {opp && (
          <Link href={`/admin/procurement/opportunity/${opp}`} className="mr-2 text-xs text-sky-300 hover:underline">
            Spine
          </Link>
        )}
        {status === "draft" && (
          <button
            type="button"
            disabled={pending}
            className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
            onClick={() => run("review", recommendationMarkReviewedAction)}
          >
            Mark reviewed
          </button>
        )}
        {status === "operator_reviewed" && (
          <button
            type="button"
            disabled={pending}
            className="rounded border border-emerald-700/50 px-2 py-1 text-xs hover:bg-emerald-900/30"
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
              className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
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
              className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
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
        {message && <p className="mt-1 text-xs text-amber-300">{message}</p>}
      </td>
    </tr>
  );
}

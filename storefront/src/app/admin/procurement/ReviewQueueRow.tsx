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
import { StatusBadge } from "@/components/admin";
import {
  adminLink,
  adminPrimaryButton,
  adminSecondaryButton,
  adminTableCell,
} from "@/components/admin/admin-theme-utils";
import { adminTableRowHover } from "@/app/admin/procurement/_ProcurementTableShell";
import { cn } from "@/lib/utils";

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
    <tr className={cn(adminTableRowHover, "align-top text-sm")}>
      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{id.slice(0, 8)}…</td>
      <td className={cn(adminTableCell, "p-3")}>
        <StatusBadge status={status || "neutral"} />
      </td>
      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
        {String(row.source_catalog_product_id).slice(0, 8)}…
      </td>
      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
        {String(row.candidate_catalog_product_id).slice(0, 8)}…
      </td>
      <td className={cn(adminTableCell, "p-3 text-right font-mono tabular-nums")}>
        {row.estimated_delta_per_basis != null ? String(row.estimated_delta_per_basis) : "—"}
      </td>
      <td className={cn(adminTableCell, "p-3")}>
        <div className="flex flex-wrap items-center gap-1.5">
          {opp ? (
            <Link href={`/admin/procurement/opportunity/${opp}`} className={cn("mr-1 text-xs", adminLink)}>
              Spine
            </Link>
          ) : null}
          {status === "draft" ? (
            <button
              type="button"
              disabled={pending}
              className={adminSecondaryButton}
              onClick={() => run("review", recommendationMarkReviewedAction)}
            >
              Mark reviewed
            </button>
          ) : null}
          {status === "operator_reviewed" ? (
            <button
              type="button"
              disabled={pending}
              className={cn(adminPrimaryButton, "px-2 py-1 text-xs")}
              onClick={() => run("approve", recommendationApproveAction)}
            >
              Approve for workspace
            </button>
          ) : null}
          {status === "draft" || status === "operator_reviewed" ? (
            <>
              <button
                type="button"
                disabled={pending}
                className={adminSecondaryButton}
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
                className={adminSecondaryButton}
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
          ) : null}
        </div>
        {message ? <p className="mt-2 text-xs text-admin-warning">{message}</p> : null}
      </td>
    </tr>
  );
}

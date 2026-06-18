"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { reorderPromoteAction } from "@/app/admin/procurement/recommendation-actions";
import { adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { adminTableRowHover } from "@/app/admin/procurement/_ProcurementTableShell";
import { adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

export function ApprovedReorderRow({ row, companyId }: { row: Row; companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const id = String(row.id);
  const opp = row.procurement_opportunity_id != null ? String(row.procurement_opportunity_id) : "";

  return (
    <tr className={cn(adminTableRowHover, "align-top text-sm")}>
      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{id.slice(0, 8)}…</td>
      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
        {String(row.source_catalog_product_id).slice(0, 8)}…
      </td>
      <td className={cn(adminTableCell, "p-3 text-right font-mono tabular-nums")}>
        {String(row.estimated_delta_per_basis ?? "—")}
      </td>
      <td className={cn(adminTableCell, "p-3")}>
        <button
          type="button"
          disabled={pending || !opp}
          className={adminSecondaryButton}
          onClick={() => {
            setMessage(null);
            if (!opp) {
              setMessage("Missing procurement opportunity anchor.");
              return;
            }
            const notes = window.prompt("Optional notes") ?? "";
            const f = new FormData();
            f.set("company_id", companyId);
            f.set("savings_opportunity_id", id);
            f.set("procurement_opportunity_id", opp);
            f.set("notes", notes);
            startTransition(async () => {
              const r = await reorderPromoteAction(null, f);
              if (!r.ok) setMessage(r.error ?? "failed");
              else router.refresh();
            });
          }}
        >
          Promote reorder memory
        </button>
        {message ? <p className="mt-2 text-xs text-admin-warning">{message}</p> : null}
      </td>
    </tr>
  );
}

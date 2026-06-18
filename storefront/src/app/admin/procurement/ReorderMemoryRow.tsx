"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { reorderRetireAction } from "@/app/admin/procurement/recommendation-actions";
import { adminSecondaryButton } from "@/components/admin/admin-theme-utils";
import { adminTableRowHover } from "@/app/admin/procurement/_ProcurementTableShell";
import { adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

export function ReorderMemoryRow({
  row,
  companyId,
  procurementOpportunityId,
}: {
  row: Row;
  companyId: string;
  procurementOpportunityId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const id = String(row.id);

  return (
    <tr className={cn(adminTableRowHover, "align-top text-sm")}>
      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{id.slice(0, 8)}…</td>
      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
        {String(row.catalog_product_id).slice(0, 8)}…
      </td>
      <td className={cn(adminTableCell, "p-3")}>{String(row.basis_uom ?? "")}</td>
      <td className={cn(adminTableCell, "p-3 text-right font-mono tabular-nums")}>
        {row.last_trusted_unit_basis != null ? String(row.last_trusted_unit_basis) : "—"}
      </td>
      <td className={cn(adminTableCell, "p-3")}>
        <button
          type="button"
          disabled={pending}
          className={adminSecondaryButton}
          onClick={() => {
            setMessage(null);
            const reason = window.prompt("Retire reason (optional)") ?? "";
            const f = new FormData();
            f.set("company_id", companyId);
            f.set("reorder_memory_id", id);
            f.set("procurement_opportunity_id", procurementOpportunityId);
            f.set("reason", reason);
            startTransition(async () => {
              const r = await reorderRetireAction(null, f);
              if (!r.ok) setMessage(r.error ?? "failed");
              else router.refresh();
            });
          }}
        >
          Retire
        </button>
        {message ? <p className="mt-2 text-xs text-admin-warning">{message}</p> : null}
      </td>
    </tr>
  );
}

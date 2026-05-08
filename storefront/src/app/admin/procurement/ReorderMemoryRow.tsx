"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { reorderRetireAction } from "@/app/admin/procurement/recommendation-actions";

type Row = Record<string, unknown>;

export function ReorderMemoryRow({ row, companyId, procurementOpportunityId }: { row: Row; companyId: string; procurementOpportunityId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const id = String(row.id);

  return (
    <tr className="border-b border-white/10 align-top text-sm">
      <td className="py-2 pr-2 font-mono text-xs">{id.slice(0, 8)}…</td>
      <td className="py-2 pr-2 font-mono text-xs">{String(row.catalog_product_id).slice(0, 8)}…</td>
      <td className="py-2 pr-2">{String(row.basis_uom ?? "")}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{row.last_trusted_unit_basis != null ? String(row.last_trusted_unit_basis) : "—"}</td>
      <td className="py-2">
        <button
          type="button"
          disabled={pending}
          className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
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
        {message && <p className="mt-1 text-xs text-amber-300">{message}</p>}
      </td>
    </tr>
  );
}

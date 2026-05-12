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
    <tr className="align-top text-sm hover:bg-blue-50/40">
      <td className="p-3 font-mono text-xs text-gray-700">{id.slice(0, 8)}…</td>
      <td className="p-3 font-mono text-xs text-gray-700">{String(row.catalog_product_id).slice(0, 8)}…</td>
      <td className="p-3 text-gray-900">{String(row.basis_uom ?? "")}</td>
      <td className="p-3 text-right font-mono tabular-nums text-gray-900">
        {row.last_trusted_unit_basis != null ? String(row.last_trusted_unit_basis) : "—"}
      </td>
      <td className="p-3">
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
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
        {message && <p className="mt-2 text-xs text-amber-800">{message}</p>}
      </td>
    </tr>
  );
}

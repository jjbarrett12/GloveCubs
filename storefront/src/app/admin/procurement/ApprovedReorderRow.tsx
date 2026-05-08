"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { reorderPromoteAction } from "@/app/admin/procurement/recommendation-actions";

type Row = Record<string, unknown>;

export function ApprovedReorderRow({ row, companyId }: { row: Row; companyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const id = String(row.id);
  const opp = row.procurement_opportunity_id != null ? String(row.procurement_opportunity_id) : "";

  return (
    <tr className="border-b border-white/10 align-top text-sm">
      <td className="py-2 pr-2 font-mono text-xs">{id.slice(0, 8)}…</td>
      <td className="py-2 pr-2 font-mono text-xs">{String(row.source_catalog_product_id).slice(0, 8)}…</td>
      <td className="py-2 pr-2 text-right tabular-nums">{String(row.estimated_delta_per_basis ?? "—")}</td>
      <td className="py-2">
        <button
          type="button"
          disabled={pending || !opp}
          className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10"
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
        {message && <p className="mt-1 text-xs text-amber-300">{message}</p>}
      </td>
    </tr>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  applicationId: string;
  status: string;
};

export function NetTermsActions({ applicationId, status }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");

  async function patch(body: Record<string, unknown>, label: string) {
    setPending(label);
    setMsg(null);
    try {
      const res = await fetch(`/admin/api/net-terms/applications/${encodeURIComponent(applicationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setMsg(j.error ? (j.code ? `${j.error} (${j.code})` : j.error) : res.statusText);
        return;
      }
      setMsg("Saved.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  const canDecide = status === "pending" || status === "on_hold";

  return (
    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-xs">
      <textarea
        className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm"
        rows={2}
        placeholder="Decision notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={pending !== null}
      />
      <div className="flex flex-wrap gap-2">
        {canDecide ? (
          <>
            <button
              type="button"
              disabled={pending !== null}
              className="rounded-md bg-slate-900 px-2.5 py-1 font-semibold text-white disabled:opacity-50"
              onClick={() =>
                void patch(
                  {
                    action: "approve",
                    decision_notes: notes.trim() || undefined,
                    invoice_terms_code: "net30",
                    invoice_orders_allowed: true,
                  },
                  "approve",
                )
              }
            >
              {pending === "approve" ? "…" : "Approve (Net 30)"}
            </button>
            <button
              type="button"
              disabled={pending !== null}
              className="rounded-md border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-800 disabled:opacity-50"
              onClick={() => void patch({ action: "deny", decision_notes: notes.trim() || undefined }, "deny")}
            >
              Deny
            </button>
            {status === "pending" ? (
              <button
                type="button"
                disabled={pending !== null}
                className="rounded-md border border-gray-300 px-2.5 py-1 disabled:opacity-50"
                onClick={() => void patch({ action: "hold", decision_notes: notes.trim() || undefined }, "hold")}
              >
                Hold
              </button>
            ) : null}
          </>
        ) : null}
        {status === "on_hold" ? (
          <button
            type="button"
            disabled={pending !== null}
            className="rounded-md border border-gray-300 px-2.5 py-1 disabled:opacity-50"
            onClick={() => void patch({ action: "resume", decision_notes: notes.trim() || undefined }, "resume")}
          >
            Resume review
          </button>
        ) : null}
      </div>
      {msg ? <p className={msg === "Saved." ? "text-green-800" : "text-red-700"}>{msg}</p> : null}
    </div>
  );
}

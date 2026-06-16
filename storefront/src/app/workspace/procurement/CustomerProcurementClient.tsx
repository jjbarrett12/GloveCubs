"use client";

import { useEffect, useState } from "react";

async function postAction(body: Record<string, unknown>) {
  const res = await fetch("/api/customer/procurement/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || res.statusText);
  }
}

export function RecordViewedRecommendation({ savingsOpportunityId }: { savingsOpportunityId: string }) {
  useEffect(() => {
    void postAction({ action: "viewed_recommendation", savings_opportunity_id: savingsOpportunityId }).catch(() => {});
  }, [savingsOpportunityId]);
  return null;
}

export function RecordViewedProcurementHistory() {
  useEffect(() => {
    void postAction({ action: "viewed_procurement_history" }).catch(() => {});
  }, []);
  return null;
}

export function OpportunityActionForms({ savingsOpportunityId }: { savingsOpportunityId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await postAction(body);
      setMsg("Recorded. Your procurement team will follow up.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-4 border-t border-white/10 pt-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
          onClick={() => run({ action: "acknowledge_recommendation", savings_opportunity_id: savingsOpportunityId })}
        >
          Acknowledge
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
          onClick={() => run({ action: "request_reorder", savings_opportunity_id: savingsOpportunityId })}
        >
          Build repeat quote
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
          onClick={() => run({ action: "request_quote", savings_opportunity_id: savingsOpportunityId })}
        >
          Request quote
        </button>
      </div>
      <AskAlternateForm
        savingsOpportunityId={savingsOpportunityId}
        disabled={busy}
        onDone={() => setMsg("Question recorded. Your procurement contact will follow up.")}
        onError={setErr}
      />
      {msg ? <p className="text-xs text-emerald-400/90">{msg}</p> : null}
      {err ? <p className="text-xs text-red-400/90">{err}</p> : null}
    </div>
  );
}

function AskAlternateForm({
  savingsOpportunityId,
  disabled,
  onDone,
  onError,
}: {
  savingsOpportunityId: string;
  disabled: boolean;
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        onError(null);
        try {
          await postAction({
            action: "ask_about_alternate",
            savings_opportunity_id: savingsOpportunityId,
            message: text.trim(),
          });
          setText("");
          onDone();
        } catch (er) {
          onError(er instanceof Error ? er.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-xs text-white/50">Question on this approved alternate</label>
      <textarea
        className="mt-1 w-full max-w-lg rounded border border-white/15 bg-black/30 px-2 py-2 text-xs text-white"
        rows={3}
        value={text}
        disabled={disabled || busy}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="submit"
        disabled={disabled || busy || !text.trim()}
        className="rounded border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
      >
        Send question
      </button>
    </form>
  );
}

export function ContactAdvisorForm() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-8 space-y-2 border-t border-white/10 pt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        setErr(null);
        setMsg(null);
        try {
          await postAction({ action: "contact_advisor", message: text.trim() });
          setText("");
          setMsg("Message sent.");
        } catch (er) {
          setErr(er instanceof Error ? er.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-sm font-medium text-white/85">Contact procurement advisor</h3>
      <textarea
        className="mt-1 w-full max-w-lg rounded border border-white/15 bg-black/30 px-2 py-2 text-xs text-white"
        rows={4}
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="rounded border border-sky-500/40 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"
      >
        Send
      </button>
      {msg ? <p className="text-xs text-emerald-400/90">{msg}</p> : null}
      {err ? <p className="text-xs text-red-400/90">{err}</p> : null}
    </form>
  );
}

export function ReorderRequestButton({
  reorderMemoryId,
  label,
}: {
  reorderMemoryId: string;
  label?: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setErr(null);
          setMsg(null);
          try {
            await postAction({ action: "request_reorder", reorder_memory_id: reorderMemoryId });
            setMsg("Repeat quote signal sent.");
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {label ?? "Build repeat quote"}
      </button>
      {msg ? <span className="text-[11px] text-emerald-400/90">{msg}</span> : null}
      {err ? <span className="text-[11px] text-red-400/90">{err}</span> : null}
    </div>
  );
}

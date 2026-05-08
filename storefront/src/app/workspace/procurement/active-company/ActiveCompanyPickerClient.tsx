"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Opt = { id: string; label: string };

export function ActiveCompanyPickerClient({ options }: { options: Opt[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!selected) {
      setErr("Select an organization.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/procurement/active-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selected }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error || `Request failed (${res.status})`);
        setLoading(false);
        return;
      }
      router.replace("/workspace/procurement");
      router.refresh();
    } catch {
      setErr("Network error");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-md space-y-4">
      <label className="block text-sm text-white/80">
        <span className="mb-2 block font-medium">Organization</span>
        <select
          className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-white"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      <button
        type="submit"
        disabled={loading || options.length === 0}
        className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

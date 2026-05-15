"use client";

import * as React from "react";

const TIERS = [
  { code: "cub", label: "Cub (10% off site list)" },
  { code: "grizzly", label: "Grizzly (20% off site list)" },
  { code: "kodiak", label: "Kodiak (30% off site list)" },
] as const;

type Props = {
  companyId: string;
  initialTier: string;
};

export function CompanyB2bTierSelect({ companyId, initialTier }: Props) {
  const [tier, setTier] = React.useState(initialTier);
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTier(initialTier);
  }, [initialTier]);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setPending(true);
    setMsg(null);
    const prev = tier;
    setTier(next);
    try {
      const res = await fetch(`/admin/api/companies/${companyId}/b2b-pricing-tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ b2b_pricing_tier_code: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || res.statusText);
      }
    } catch (err) {
      setTier(prev);
      setMsg(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-[200px] flex-col gap-1">
      <label className="sr-only" htmlFor={`tier-${companyId}`}>
        B2B pricing tier
      </label>
      <select
        id={`tier-${companyId}`}
        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 shadow-sm disabled:opacity-50"
        disabled={pending}
        value={tier}
        onChange={(ev) => void onChange(ev)}
      >
        {TIERS.map((t) => (
          <option key={t.code} value={t.code}>
            {t.label}
          </option>
        ))}
      </select>
      {msg ? <p className="text-[11px] text-red-600">{msg}</p> : null}
    </div>
  );
}

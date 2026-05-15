"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { slugifyCompanySlug } from "@/lib/admin/admin-company-write";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Archived" },
] as const;

const TIERS = [
  { value: "cub", label: "Cub" },
  { value: "grizzly", label: "Grizzly" },
  { value: "kodiak", label: "Kodiak" },
] as const;

export function CompanyCreateForm() {
  const router = useRouter();
  const [tradeName, setTradeName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]["value"]>("active");
  const [tier, setTier] = useState<(typeof TIERS)[number]["value"]>("cub");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onTradeNameChange(v: string) {
    setTradeName(v);
    if (!slugTouched) {
      setSlug(slugifyCompanySlug(v));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      const res = await fetch("/admin/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade_name: tradeName,
          legal_name: legalName.trim() || null,
          slug: slug.trim() || undefined,
          country_code: countryCode.trim() || null,
          status,
          b2b_pricing_tier_code: tier,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; company?: { id: string } };
      if (!res.ok) {
        setErr(data.error || "Could not create customer.");
        return;
      }
      if (data.company?.id) {
        router.push(`/admin/companies/${data.company.id}`);
        router.refresh();
      }
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="max-w-xl space-y-4">
      <div>
        <label htmlFor="trade_name" className="block text-sm font-medium text-slate-700">
          Company name <span className="text-red-600">*</span>
        </label>
        <input
          id="trade_name"
          required
          value={tradeName}
          onChange={(e) => onTradeNameChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <div>
        <label htmlFor="legal_name" className="block text-sm font-medium text-slate-700">
          Legal name
        </label>
        <input
          id="legal_name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-slate-700">
          Slug <span className="text-red-600">*</span>
        </label>
        <input
          id="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm shadow-sm"
        />
        <p className="mt-1 text-xs text-slate-500">Lowercase letters, numbers, and hyphens (2–64 characters).</p>
      </div>
      <div>
        <label htmlFor="country_code" className="block text-sm font-medium text-slate-700">
          Country code
        </label>
        <input
          id="country_code"
          maxLength={2}
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
          placeholder="US"
          className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-slate-700">
            Account status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tier" className="block text-sm font-medium text-slate-700">
            Pricing tier
          </label>
          <select
            id="tier"
            value={tier}
            onChange={(e) => setTier(e.target.value as typeof tier)}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
          >
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#d8552a] disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create customer"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/companies")}
          className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

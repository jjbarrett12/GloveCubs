"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Archived" },
] as const;

type CompanyProfile = {
  id: string;
  trade_name: string;
  legal_name: string | null;
  slug: string;
  country_code: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type Props = {
  company: CompanyProfile;
};

export function CompanyProfileForm({ company }: Props) {
  const router = useRouter();
  const [tradeName, setTradeName] = useState(company.trade_name);
  const [legalName, setLegalName] = useState(company.legal_name ?? "");
  const [slug, setSlug] = useState(company.slug);
  const [countryCode, setCountryCode] = useState(company.country_code ?? "");
  const [status, setStatus] = useState(company.status);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setPending(true);
    try {
      const res = await fetch(`/admin/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade_name: tradeName,
          legal_name: legalName.trim() || null,
          slug,
          country_code: countryCode.trim() || null,
          status,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error || "Update failed.");
        return;
      }
      setMsg("Profile saved.");
      router.refresh();
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <dl className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
        <div>
          <dt className="font-medium uppercase tracking-wide">Company ID</dt>
          <dd className="mt-0.5 font-mono text-slate-700">{company.id}</dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide">Timestamps</dt>
          <dd className="mt-0.5 text-slate-700">
            Created {new Date(company.created_at).toLocaleString()} · Updated{" "}
            {new Date(company.updated_at).toLocaleString()}
          </dd>
        </div>
      </dl>

      <div>
        <label htmlFor="edit_trade_name" className="block text-sm font-medium text-slate-700">
          Company name <span className="text-red-600">*</span>
        </label>
        <input
          id="edit_trade_name"
          required
          value={tradeName}
          onChange={(e) => setTradeName(e.target.value)}
          className="mt-1 w-full max-w-md rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <div>
        <label htmlFor="edit_legal_name" className="block text-sm font-medium text-slate-700">
          Legal name
        </label>
        <input
          id="edit_legal_name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          className="mt-1 w-full max-w-md rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <div>
        <label htmlFor="edit_slug" className="block text-sm font-medium text-slate-700">
          Slug <span className="text-red-600">*</span>
        </label>
        <input
          id="edit_slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          className="mt-1 w-full max-w-md rounded-md border border-slate-200 px-3 py-2 font-mono text-sm shadow-sm"
        />
      </div>
      <div>
        <label htmlFor="edit_country" className="block text-sm font-medium text-slate-700">
          Country code
        </label>
        <input
          id="edit_country"
          maxLength={2}
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
          className="mt-1 w-24 rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <div>
        <label htmlFor="edit_status" className="block text-sm font-medium text-slate-700">
          Account status
        </label>
        <select
          id="edit_status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#f06232] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#d8552a] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

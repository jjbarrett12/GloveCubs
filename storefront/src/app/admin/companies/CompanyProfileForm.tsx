"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  adminFormInput,
  adminFormLabel,
  adminPrimaryButton,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

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
      <dl className="grid gap-2 text-xs text-admin-muted sm:grid-cols-2">
        <div>
          <dt className="font-medium uppercase tracking-wide">Company ID</dt>
          <dd className="mt-0.5 font-mono text-admin-secondary">{company.id}</dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide">Timestamps</dt>
          <dd className="mt-0.5 text-admin-secondary">
            Created {new Date(company.created_at).toLocaleString()} · Updated{" "}
            {new Date(company.updated_at).toLocaleString()}
          </dd>
        </div>
      </dl>

      <div>
        <label htmlFor="edit_trade_name" className={adminFormLabel}>
          Company name <span className="text-admin-danger">*</span>
        </label>
        <input
          id="edit_trade_name"
          required
          value={tradeName}
          onChange={(e) => setTradeName(e.target.value)}
          className={cn(adminFormInput, "w-full max-w-md")}
        />
      </div>
      <div>
        <label htmlFor="edit_legal_name" className={adminFormLabel}>
          Legal name
        </label>
        <input
          id="edit_legal_name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          className={cn(adminFormInput, "w-full max-w-md")}
        />
      </div>
      <div>
        <label htmlFor="edit_slug" className={adminFormLabel}>
          Slug <span className="text-admin-danger">*</span>
        </label>
        <input
          id="edit_slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          className={cn(adminFormInput, "w-full max-w-md font-mono")}
        />
      </div>
      <div>
        <label htmlFor="edit_country" className={adminFormLabel}>
          Country code
        </label>
        <input
          id="edit_country"
          maxLength={2}
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
          className={cn(adminFormInput, "w-24")}
        />
      </div>
      <div>
        <label htmlFor="edit_status" className={adminFormLabel}>
          Account status
        </label>
        <select
          id="edit_status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={cn(adminFormInput, "w-full max-w-xs")}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {err ? <p className="text-sm text-admin-danger">{err}</p> : null}
      {msg ? <p className="text-sm text-admin-success">{msg}</p> : null}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={adminPrimaryButton}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

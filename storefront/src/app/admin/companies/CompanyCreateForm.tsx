"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OnboardingCard } from "@/components/admin";
import {
  adminFormInput,
  adminFormLabel,
  adminPrimaryButton,
  adminSecondaryButton,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
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
        router.push(`/admin/companies/${data.company.id}?tab=delivery`);
        router.refresh();
      }
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  const fieldCls = cn(adminFormInput, "w-full");

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <OnboardingCard
          title="Business information"
          description="Required fields to create the customer account record."
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="trade_name" className={adminFormLabel}>
                Company name <span className="text-admin-danger">*</span>
              </label>
              <input
                id="trade_name"
                required
                value={tradeName}
                onChange={(e) => onTradeNameChange(e.target.value)}
                className={fieldCls}
              />
            </div>
            <div>
              <label htmlFor="legal_name" className={adminFormLabel}>
                Legal name
              </label>
              <input id="legal_name" value={legalName} onChange={(e) => setLegalName(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label htmlFor="slug" className={adminFormLabel}>
                Slug <span className="text-admin-danger">*</span>
              </label>
              <input
                id="slug"
                required
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                className={cn(fieldCls, "font-mono")}
              />
              <p className="mt-1 text-xs text-admin-muted">Lowercase letters, numbers, and hyphens (2–64 characters).</p>
            </div>
            <div>
              <label htmlFor="country_code" className={adminFormLabel}>
                Country code
              </label>
              <input
                id="country_code"
                maxLength={2}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                placeholder="US"
                className={cn(fieldCls, "w-28")}
              />
            </div>
            <div>
              <label htmlFor="status" className={adminFormLabel}>
                Account status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className={fieldCls}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </OnboardingCard>

        <OnboardingCard
          title="Pricing tier"
          description="B2B volume tier used for site-list-derived pricing. Unit math is enforced server-side."
        >
          <div>
            <label htmlFor="tier" className={adminFormLabel}>
              Tier
            </label>
            <select
              id="tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as typeof tier)}
              className={fieldCls}
            >
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </OnboardingCard>

        {err ? <p className="text-sm text-admin-danger">{err}</p> : null}
        <div className="flex flex-wrap gap-3 pt-1">
          <button type="submit" disabled={pending} className={adminPrimaryButton}>
            {pending ? "Creating…" : "Create customer account"}
          </button>
          <button type="button" onClick={() => router.push("/admin/companies")} className={adminSecondaryButton}>
            Cancel
          </button>
        </div>
      </form>

      <OnboardingCard variant="disabled" title="Delivery locations" description="Next step after the account exists.">
        <p className="text-sm leading-relaxed text-admin-secondary">
          Add delivery locations after the customer account is created. You&apos;ll manage ship-to addresses from the
          account workspace.
        </p>
      </OnboardingCard>

      <OnboardingCard variant="disabled" title="Preferred products" description="Next step after the account exists.">
        <p className="text-sm leading-relaxed text-admin-secondary">
          Assign approved glove variants after the customer account is created. Preferred products are maintained
          separately from procurement reorder memory.
        </p>
      </OnboardingCard>

      <OnboardingCard variant="disabled" title="Team access" description="Not available in this phase.">
        <p className="text-sm leading-relaxed text-admin-secondary">
          Invite buyers and manage roles in a future phase. Team rows always reflect sign-in identities linked to the
          customer account — not a separate CRM contact list.
        </p>
      </OnboardingCard>

      <OnboardingCard variant="disabled" title="Billing & payment" description="Not enabled in this phase.">
        <p className="text-sm leading-relaxed text-admin-secondary">
          Online payment setup and billing workflows are not enabled yet. Do not enter card details or bank information
          here.
        </p>
      </OnboardingCard>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  adminFormInput,
  adminFormLabel,
  adminPrimaryButton,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "member", label: "Member (buyer portal)" },
  { value: "viewer", label: "Viewer" },
  { value: "admin", label: "Company admin" },
  { value: "billing", label: "Billing" },
  { value: "owner", label: "Owner" },
] as const;

type Props = {
  companyId: string;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  outcome?: "already_member" | "linked_existing_user" | "created_user";
  password_setup_required?: boolean;
  message?: string;
};

export function CompanyAddMemberForm({ companyId }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("member");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setWarn(null);
    setPending(true);
    try {
      const res = await fetch(`/admin/api/companies/${companyId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          display_name: displayName.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok) {
        if (data.code === "missing_supabase_env") {
          setErr("Server Supabase env is not configured. Fix deployment env before adding buyers.");
        } else {
          setErr(data.error || "Could not add buyer.");
        }
        return;
      }

      if (data.password_setup_required) {
        setWarn(
          data.message ||
            "Buyer created and linked. They must use Forgot password on the login page with this email to set a password before first sign-in.",
        );
      } else if (data.outcome === "already_member") {
        setMsg(data.message || "Buyer is already linked to this customer account.");
      } else {
        setMsg(data.message || "Buyer linked to this customer account.");
      }

      setEmail("");
      setDisplayName("");
      setRole("member");
      router.refresh();
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 border-b border-admin-border pb-5">
      <div>
        <h4 className="text-sm font-semibold text-admin-primary">Add buyer</h4>
        <p className="mt-1 text-xs text-admin-muted">
          Links an existing Supabase auth user by email or creates one, then adds{" "}
          <span className="font-mono">gc_commerce.company_members</span> membership for portal access.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="buyer-email" className={adminFormLabel}>
            Buyer email
          </label>
          <input
            id="buyer-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(adminFormInput, "mt-1 w-full")}
            placeholder="buyer@company.com"
            disabled={pending}
          />
        </div>

        <div>
          <label htmlFor="buyer-name" className={adminFormLabel}>
            Display name <span className="font-normal text-admin-muted">(optional)</span>
          </label>
          <input
            id="buyer-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={cn(adminFormInput, "mt-1 w-full")}
            placeholder="Jane Buyer"
            disabled={pending}
          />
        </div>

        <div>
          <label htmlFor="buyer-role" className={adminFormLabel}>
            Role
          </label>
          <select
            id="buyer-role"
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number]["value"])}
            className={cn(adminFormInput, "mt-1 w-full")}
            disabled={pending}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
          {err}
        </p>
      ) : null}
      {warn ? (
        <p
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
          role="status"
        >
          {warn}
        </p>
      ) : null}
      {msg ? (
        <p
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
          role="status"
        >
          {msg}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={adminPrimaryButton}>
        {pending ? "Saving…" : "Add buyer to company"}
      </button>
    </form>
  );
}

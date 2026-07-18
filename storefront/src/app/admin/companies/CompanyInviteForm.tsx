"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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

type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export function CompanyInviteForm({ companyId }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["value"]>("member");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<{ url: string; email: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  async function loadInvites() {
    try {
      const res = await fetch(`/admin/api/companies/${companyId}/invites`);
      const data = await res.json();
      if (res.ok && data.invites) {
        setInvites(data.invites);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingInvites(false);
    }
  }

  useEffect(() => {
    void loadInvites();
  }, [companyId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);
    setPending(true);

    try {
      const res = await fetch(`/admin/api/companies/${companyId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not create invite.");
        return;
      }

      const fullUrl = typeof window !== "undefined"
        ? `${window.location.origin}${data.invite_url}`
        : data.invite_url;

      setSuccess({ url: fullUrl, email });
      setEmail("");
      setRole("member");
      void loadInvites();
      router.refresh();
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    try {
      const res = await fetch(`/admin/api/companies/${companyId}/invites/${inviteId}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        void loadInvites();
        router.refresh();
      }
    } catch {
      // Ignore
    }
  }

  const activeInvites = invites.filter(
    (i) => !i.revoked_at && !i.accepted_at && new Date(i.expires_at) > new Date(),
  );
  const pastInvites = invites.filter(
    (i) => i.revoked_at || i.accepted_at || new Date(i.expires_at) <= new Date(),
  );

  return (
    <div className="space-y-6">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 border-b border-admin-border pb-5">
        <div>
          <h4 className="text-sm font-semibold text-admin-primary">Create invitation</h4>
          <p className="mt-1 text-xs text-admin-muted">
            Generate a secure invite link for a new buyer. The link expires in 7 days.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="invite-email" className={adminFormLabel}>
              Buyer email
            </label>
            <input
              id="invite-email"
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
            <label htmlFor="invite-role" className={adminFormLabel}>
              Role
            </label>
            <select
              id="invite-role"
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

        {success ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
            <p className="font-medium">Invitation created for {success.email}</p>
            <p className="mt-2 text-xs text-emerald-200/80">Share this link with the buyer:</p>
            <input
              type="text"
              readOnly
              value={success.url}
              className="mt-1 w-full rounded border border-emerald-500/30 bg-emerald-900/30 px-2 py-1.5 font-mono text-xs text-emerald-100"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              className="mt-2 text-xs font-medium text-emerald-200 hover:underline"
              onClick={() => {
                void navigator.clipboard.writeText(success.url);
              }}
            >
              Copy to clipboard
            </button>
          </div>
        ) : null}

        <button type="submit" disabled={pending} className={adminPrimaryButton}>
          {pending ? "Creating…" : "Create invitation"}
        </button>
      </form>

      {loadingInvites ? (
        <p className="text-xs text-admin-muted">Loading invitations…</p>
      ) : activeInvites.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold text-admin-primary">Active invitations</h4>
          <ul className="mt-3 divide-y divide-admin-border rounded-lg border border-admin-border">
            {activeInvites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-admin-primary">{inv.email}</p>
                  <p className="text-xs text-admin-muted">
                    {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revokeInvite(inv.id)}
                  className="shrink-0 text-xs font-medium text-red-400 hover:text-red-300"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pastInvites.length > 0 ? (
        <details className="text-xs text-admin-muted">
          <summary className="cursor-pointer hover:text-admin-secondary">
            Show past invitations ({pastInvites.length})
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {pastInvites.slice(0, 10).map((inv) => (
              <li key={inv.id}>
                {inv.email} ·{" "}
                {inv.accepted_at
                  ? "accepted"
                  : inv.revoked_at
                    ? "revoked"
                    : "expired"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

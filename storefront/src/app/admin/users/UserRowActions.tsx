"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const TIERS = ["standard", "bronze", "silver", "gold", "platinum"] as const;
const TERMS = ["credit_card", "ach", "net30"] as const;

type Props = {
  userId: string;
  isApproved: boolean;
  discountTier: string;
  paymentTerms: string;
};

export function UserRowActions({ userId, isApproved, discountTier, paymentTerms }: Props) {
  const router = useRouter();
  const [approved, setApproved] = React.useState(isApproved);
  const [tier, setTier] = React.useState(discountTier || "standard");
  const [terms, setTerms] = React.useState(paymentTerms || "credit_card");
  const [pending, setPending] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setApproved(isApproved);
    setTier(discountTier || "standard");
    setTerms(paymentTerms || "credit_card");
  }, [isApproved, discountTier, paymentTerms]);

  async function save(fields: Record<string, unknown>, label: string) {
    setPending(label);
    setMsg(null);
    try {
      const res = await fetch(`/admin/api/users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setMsg(j.error ? (j.code ? `${j.error} (${j.code})` : j.error) : res.statusText);
        return;
      }
      setMsg("Saved.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-xs">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={approved}
          disabled={pending !== null}
          onChange={(e) => {
            const next = e.target.checked;
            setApproved(next);
            void save({ is_approved: next }, "approve");
          }}
        />
        <span>Approved for checkout</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded border border-gray-300 px-1.5 py-1"
          value={tier}
          disabled={pending !== null}
          onChange={(e) => {
            const next = e.target.value;
            setTier(next);
            void save({ discount_tier: next }, "tier");
          }}
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-gray-300 px-1.5 py-1"
          value={terms}
          disabled={pending !== null}
          onChange={(e) => {
            const next = e.target.value;
            setTerms(next);
            void save({ payment_terms: next }, "terms");
          }}
        >
          {TERMS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {pending ? <span className="text-gray-500">Saving {pending}…</span> : null}
      {msg ? <span className={msg === "Saved." ? "text-green-800" : "text-red-700"}>{msg}</span> : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Props = {
  token: string;
  email: string;
};

export function InviteAcceptClient({ token, email }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function handleAccept() {
    setError(null);
    setPending(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: session } = await supabase.auth.getSession();

      if (!session?.session?.access_token) {
        setNeedsSignIn(true);
        setPending(false);
        return;
      }

      const res = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setNeedsSignIn(true);
        } else if (res.status === 403 && data.error?.includes("email")) {
          setError(`You're signed in with a different email. Please sign out and sign in with ${email} to accept this invitation.`);
        } else {
          setError(data.error || "Failed to accept invitation.");
        }
        return;
      }

      router.push(data.redirect_path || "/account");
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (needsSignIn) {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-sm text-amber-200/90">
          You need to sign in to accept this invitation.
        </p>
        <p className="text-xs text-white/55">
          Sign in with <strong className="text-white/80">{email}</strong> to join the company.
          If you don&apos;t have an account yet, you can create one first.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
            className="rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white hover:bg-[#f06232]/90"
          >
            Sign in
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`}
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/5"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleAccept()}
        disabled={pending}
        className="w-full rounded-md bg-[#f06232] px-4 py-2.5 text-sm font-bold text-white shadow hover:opacity-95 disabled:opacity-60"
      >
        {pending ? "Accepting…" : "Accept invitation"}
      </button>

      <p className="text-center text-xs text-white/45">
        By accepting, you&apos;ll be added as a team member and can access company quotes and orders.
      </p>
    </div>
  );
}

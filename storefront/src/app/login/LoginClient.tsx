"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { safeCommerceNextPath } from "@/lib/auth/safe-next-path";

type Props = {
  nextPath: string | string[] | undefined;
  issue: string | string[] | undefined;
  supabaseConfigured: boolean;
  hasExplicitNext: boolean;
};

export function LoginClient({ nextPath, issue, supabaseConfigured, hasExplicitNext }: Props) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const issueStr = Array.isArray(issue) ? issue[0] : issue;
  const explicitDest = safeCommerceNextPath(nextPath);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supabaseConfigured) {
      setError("Sign-in is not available in this environment.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      if (hasExplicitNext) {
        window.location.assign(explicitDest);
        return;
      }
      const res = await fetch("/api/auth/post-login-destination", { credentials: "include" });
      const body = (await res.json()) as { path?: string };
      const path =
        typeof body.path === "string" && body.path.startsWith("/") && !body.path.startsWith("//")
          ? body.path
          : "/account";
      window.location.assign(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-white">Sign in</h1>
      <p className="mt-2 text-sm text-white/65">
        Business buyer sign-in for saved pricing, quotes, and (when enabled) your organization workspace.
      </p>

      {issueStr === "no_membership" ? (
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Your account is signed in but is not linked to an organization yet.{" "}
          <Link href="/request-pricing" className="font-semibold text-[#f06232] underline">
            Request business pricing
          </Link>{" "}
          or{" "}
          <Link href="/contact" className="font-semibold text-[#f06232] underline">
            contact support
          </Link>{" "}
          for access.
        </div>
      ) : null}

      {!supabaseConfigured ? (
        <p className="mt-6 text-sm text-white/60">
          Sign-in is not configured (missing Supabase environment variables). Use{" "}
          <Link href="/request-pricing" className="text-[#f06232] underline">
            business pricing
          </Link>{" "}
          to reach the team.
        </p>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <label htmlFor="gc-login-email" className="block text-xs font-semibold uppercase tracking-wide text-white/50">
              Email
            </label>
            <input
              id="gc-login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-[#f06232]/30 focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="gc-login-password" className="block text-xs font-semibold uppercase tracking-wide text-white/50">
              Password
            </label>
            <input
              id="gc-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-[#f06232]/30 focus:ring-2"
            />
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[#f06232] px-4 py-2.5 text-sm font-bold text-white shadow hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}

      <p className="mt-8 text-sm text-white/55">
        <Link href="/store" className="text-[#f06232] hover:underline">
          Continue shopping
        </Link>
        <span className="mx-2 text-white/30">·</span>
        <button type="button" className="text-[#f06232] hover:underline" onClick={() => router.back()}>
          Back
        </button>
      </p>
    </div>
  );
}

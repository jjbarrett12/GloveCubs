"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { classifyPasswordUpdateError } from "@/lib/auth/password-reset";
import { validateNewPasswordPair } from "@/lib/auth/password-validation";

type Props = {
  supabaseConfigured: boolean;
  issue: string | null;
};

type ViewState =
  | "loading"
  | "ready"
  | "invalid"
  | "env_error"
  | "submitting"
  | "validation_error"
  | "update_error";

export function ResetPasswordClient({ supabaseConfigured, issue }: Props) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [state, setState] = React.useState<ViewState>("loading");
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!supabaseConfigured || issue === "env") {
      setState("env_error");
      return;
    }
    if (issue === "invalid_link") {
      setState("invalid");
      return;
    }

    async function loadRecoverySession() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          setState("invalid");
          return;
        }
        setState("ready");
      } catch {
        setState("invalid");
      }
    }

    void loadRecoverySession();
  }, [supabaseConfigured, issue]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const validation = validateNewPasswordPair(password, confirm);
    if (!validation.ok) {
      setMessage(validation.message);
      setState("validation_error");
      return;
    }

    setState("submitting");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const classified = classifyPasswordUpdateError(error);
        setMessage(classified.lines.join(" "));
        setState(classified.expired ? "invalid" : "update_error");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (accessToken) {
        const res = await fetch("/api/auth/post-login-destination", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { path?: string; buyer_default_path?: string };
          const dest =
            typeof body.buyer_default_path === "string" && body.buyer_default_path.startsWith("/")
              ? body.buyer_default_path
              : typeof body.path === "string" && body.path.startsWith("/")
                ? body.path
                : "/account";
          window.location.assign(dest);
          return;
        }
      }

      await supabase.auth.signOut();
      window.location.assign("/login?reset=success");
    } catch {
      setMessage("Password update failed. Request a new reset link and try again.");
      setState("update_error");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="rounded-2xl border-2 border-[#f06232] bg-white p-8 shadow-[0_0_22px_rgba(240,98,50,0.38),0_0_48px_rgba(240,98,50,0.15),0_16px_48px_rgba(0,0,0,0.2)] sm:p-10">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/images/glovecubs-header-logo.png"
            alt="GloveCubs"
            width={1005}
            height={143}
            priority
            unoptimized
            className="h-11 w-auto max-w-full object-contain object-center sm:h-14"
          />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-neutral-900">Set new password</h1>
          <p className="mt-2 text-sm text-neutral-600">Choose a password for your GloveCubs buyer account.</p>
        </div>

        {state === "loading" ? (
          <p className="mt-8 text-center text-sm text-neutral-600">Verifying reset link…</p>
        ) : null}

        {state === "env_error" ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Password setup is not configured for this deployment (missing or blank Supabase public env).
          </div>
        ) : null}

        {state === "invalid" ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
            {message ??
              "This reset link is invalid or expired. Request a new one from the login page and open the newest email."}
          </div>
        ) : null}

        {state === "validation_error" || state === "update_error" ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
            {message}
          </div>
        ) : null}

        {state === "ready" ||
        state === "validation_error" ||
        state === "update_error" ||
        state === "submitting" ? (
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              void onSubmit(e);
            }}
          >
            <div>
              <label htmlFor="gc-reset-password" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                New password
              </label>
              <input
                id="gc-reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={state === "submitting"}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 focus:border-[#f06232] focus:ring-2"
              />
            </div>
            <div>
              <label htmlFor="gc-reset-confirm" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Confirm password
              </label>
              <input
                id="gc-reset-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={state === "submitting"}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 focus:border-[#f06232] focus:ring-2"
              />
            </div>
            <button
              type="submit"
              disabled={state === "submitting"}
              className="w-full rounded-md bg-[#f06232] px-4 py-2.5 text-sm font-bold text-white shadow hover:opacity-95 disabled:opacity-60"
            >
              {state === "submitting" ? "Saving…" : "Save password"}
            </button>
          </form>
        ) : null}

        <p className="mt-8 text-center text-sm text-neutral-600">
          <Link href="/login/forgot-password" className="font-semibold text-[#f06232] underline hover:text-[#d45529]">
            Request a new reset link
          </Link>
          <span className="mx-2 text-neutral-300">·</span>
          <Link href="/login" className="text-[#f06232] hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

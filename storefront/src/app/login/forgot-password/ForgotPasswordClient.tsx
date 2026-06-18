"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  buildPasswordRecoveryRedirectUrl,
  classifyPasswordResetRequestResult,
} from "@/lib/auth/password-reset";

type Props = {
  supabaseConfigured: boolean;
};

type ViewState = "idle" | "submitting" | "sent" | "env_error" | "redirect_error" | "rate_limited" | "generic_error";

export function ForgotPasswordClient({ supabaseConfigured }: Props) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<ViewState>("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!supabaseConfigured) {
      setState("env_error");
      return;
    }
    if (!email.trim()) {
      setMessage("Enter your email address.");
      setState("idle");
      return;
    }

    const redirectTo = buildPasswordRecoveryRedirectUrl(
      typeof window !== "undefined" ? window.location.origin : null,
    );
    if (!redirectTo) {
      setState("redirect_error");
      return;
    }

    setState("submitting");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      const outcome = classifyPasswordResetRequestResult(error);
      if (outcome.kind === "sent") {
        setState("sent");
        return;
      }
      if (outcome.kind === "rate_limited") {
        setMessage(outcome.message);
        setState("rate_limited");
        return;
      }
      if (outcome.kind === "generic_error") {
        setMessage(outcome.message);
        setState("generic_error");
        return;
      }
      setState("sent");
    } catch {
      setState("sent");
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
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-neutral-900">Reset password</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Enter the email on your buyer account. If it matches an account, we will send setup instructions.
          </p>
        </div>

        {state === "env_error" ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Customer login is not configured for this deployment (missing or blank Supabase public env). This is a
            deployment issue — not a membership problem.
          </div>
        ) : null}

        {state === "redirect_error" ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Password reset cannot build a safe redirect URL for this deployment. Set{" "}
            <span className="font-mono text-xs">NEXT_PUBLIC_SITE_URL</span> and allow it in Supabase Auth redirect
            URLs.
          </div>
        ) : null}

        {state === "sent" ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            If an account exists for that email, you will receive password setup instructions shortly. Check spam
            folders and use the newest link if you request more than one.
          </div>
        ) : null}

        {state === "rate_limited" || state === "generic_error" ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
            {message ?? "Password reset is temporarily unavailable. Try again later."}
          </div>
        ) : null}

        {message && state === "idle" ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">{message}</div>
        ) : null}

        {supabaseConfigured && state !== "sent" ? (
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              void onSubmit(e);
            }}
          >
            <div>
              <label
                htmlFor="gc-forgot-email"
                className="block text-xs font-semibold uppercase tracking-wide text-neutral-500"
              >
                Email
              </label>
              <input
                id="gc-forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={state === "submitting"}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 placeholder:text-neutral-400 focus:border-[#f06232] focus:ring-2"
              />
            </div>
            <button
              type="submit"
              disabled={state === "submitting"}
              className="w-full rounded-md bg-[#f06232] px-4 py-2.5 text-sm font-bold text-white shadow hover:opacity-95 disabled:opacity-60"
            >
              {state === "submitting" ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : null}

        <p className="mt-8 text-center text-sm text-neutral-600">
          <Link href="/login" className="font-semibold text-[#f06232] underline hover:text-[#d45529]">
            Back to login
          </Link>
          <span className="mx-2 text-neutral-300">·</span>
          <Link href="/request-pricing" className="text-[#f06232] hover:underline">
            Become a customer
          </Link>
        </p>
      </div>
    </div>
  );
}

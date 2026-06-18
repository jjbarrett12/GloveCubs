"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { SELF_SIGNUP_DEFAULT_REDIRECT } from "@/lib/auth/self-signup-form";

type Props = {
  supabaseConfigured: boolean;
};

type ViewState = "loading" | "finalizing" | "done" | "sign_in_required" | "env_error" | "error";

export function SignupCompleteClient({ supabaseConfigured }: Props) {
  const [state, setState] = React.useState<ViewState>("loading");
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!supabaseConfigured) {
        setState("env_error");
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error || !data.session?.access_token) {
          setState("sign_in_required");
          return;
        }

        setState("finalizing");
        const res = await fetch("/api/auth/self-signup/finalize", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          redirect_path?: string;
        };
        if (cancelled) return;

        if (!res.ok) {
          if (body.code === "missing_supabase_env") {
            setState("env_error");
            return;
          }
          setMessage(
            typeof body.error === "string" && body.error.trim()
              ? body.error.trim()
              : "Account setup could not be completed.",
          );
          setState("error");
          return;
        }

        const dest =
          typeof body.redirect_path === "string" &&
          body.redirect_path.startsWith("/") &&
          !body.redirect_path.startsWith("//")
            ? body.redirect_path
            : SELF_SIGNUP_DEFAULT_REDIRECT;
        setState("done");
        window.location.assign(dest);
      } catch {
        if (!cancelled) {
          setMessage("Account setup could not be completed. Try again.");
          setState("error");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabaseConfigured]);

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
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-neutral-900">Setting up your account</h1>

          {state === "loading" || state === "finalizing" || state === "done" ? (
            <p className="mt-4 text-sm text-neutral-700">Finishing account setup…</p>
          ) : null}

          {state === "sign_in_required" ? (
            <p className="mt-4 text-sm text-neutral-700">
              Your confirmation link may have expired.{" "}
              <Link href="/login" className="font-semibold text-[#f06232] underline">
                Log in
              </Link>{" "}
              or{" "}
              <Link href="/signup" className="font-semibold text-[#f06232] underline">
                create a new account
              </Link>
              .
            </p>
          ) : null}

          {state === "env_error" ? (
            <p className="mt-4 text-sm text-amber-950">
              Account setup is not configured for this deployment. Contact support.
            </p>
          ) : null}

          {state === "error" && message ? (
            <p className="mt-4 text-sm text-red-950">
              {message}{" "}
              <Link href="/login" className="font-semibold text-[#f06232] underline">
                Log in
              </Link>{" "}
              to try again.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

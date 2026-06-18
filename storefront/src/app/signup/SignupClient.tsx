"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  buildSelfSignupConfirmRedirectUrl,
  buildSelfSignupUserMetadata,
  SELF_SIGNUP_DEFAULT_REDIRECT,
  validateSelfSignupForm,
} from "@/lib/auth/self-signup-form";

type Props = {
  supabaseConfigured: boolean;
};

type ViewState = "form" | "submitting" | "check_email" | "env_error" | "redirect_error";

export function SignupClient({ supabaseConfigured }: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [state, setState] = React.useState<ViewState>("form");
  const [message, setMessage] = React.useState<string | null>(null);

  async function finalizeAndRedirect(accessToken: string) {
    const res = await fetch("/api/auth/self-signup/finalize", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      redirect_path?: string;
    };
    if (!res.ok) {
      if (body.code === "missing_supabase_env") {
        setState("env_error");
        return;
      }
      setMessage(
        typeof body.error === "string" && body.error.trim()
          ? body.error.trim()
          : "Account setup could not be completed. Try again or contact support.",
      );
      setState("form");
      return;
    }
    const dest =
      typeof body.redirect_path === "string" &&
      body.redirect_path.startsWith("/") &&
      !body.redirect_path.startsWith("//")
        ? body.redirect_path
        : SELF_SIGNUP_DEFAULT_REDIRECT;
    window.location.assign(dest);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!supabaseConfigured) {
      setState("env_error");
      return;
    }

    const validated = validateSelfSignupForm({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      companyName,
      phone: phone || undefined,
      website: website || undefined,
    });
    if (!validated.ok) {
      setMessage(validated.message);
      setState("form");
      return;
    }

    const redirectTo = buildSelfSignupConfirmRedirectUrl(
      typeof window !== "undefined" ? window.location.origin : null,
    );
    if (!redirectTo) {
      setState("redirect_error");
      return;
    }

    setState("submitting");
    try {
      const supabase = createSupabaseBrowserClient();
      const metadata = buildSelfSignupUserMetadata(validated.normalized);
      const { data, error } = await supabase.auth.signUp({
        email: validated.normalized.email,
        password: validated.normalized.password,
        options: {
          data: metadata,
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        const lower = String(error.message ?? "").toLowerCase();
        if (lower.includes("already registered") || lower.includes("already exists")) {
          setMessage("An account with this email may already exist. Try logging in or reset your password.");
        } else if (lower.includes("invalid api key")) {
          setState("env_error");
          return;
        } else {
          setMessage("Could not create your account. Check your details and try again.");
        }
        setState("form");
        return;
      }

      if (data.session?.access_token) {
        await finalizeAndRedirect(data.session.access_token);
        return;
      }

      setState("check_email");
    } catch {
      setMessage("Could not create your account. Try again in a moment.");
      setState("form");
    }
  }

  if (state === "check_email") {
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
            <h1 className="mt-6 text-2xl font-bold tracking-tight text-neutral-900">Check your email</h1>
            <p className="mt-4 text-sm text-neutral-700">
              We sent a confirmation link to <span className="font-semibold">{email.trim()}</span>. Open it to
              activate your account, then you can browse gloves and submit quote requests.
            </p>
            <p className="mt-6 text-sm text-neutral-600">
              Already confirmed?{" "}
              <Link href="/login" className="font-semibold text-[#f06232] underline hover:text-[#d45529]">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
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
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-neutral-900">Create your account</h1>
          <p className="mt-2 max-w-md text-sm text-neutral-600">
            Create an account to shop gloves and submit quote requests.
          </p>
        </div>

        {state === "env_error" ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Account creation is not configured for this deployment (missing or blank Supabase environment
            variables). Contact support if you need access.
          </div>
        ) : null}

        {state === "redirect_error" ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
            Could not build a confirmation redirect URL for this site. Contact support.
          </div>
        ) : null}

        {supabaseConfigured && state !== "env_error" ? (
          <form
            className="mt-8 space-y-4"
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit(e);
            }}
          >
            {message ? (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
                {message}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="gc-signup-first" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  First name
                </label>
                <input
                  id="gc-signup-first"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 focus:border-[#f06232] focus:ring-2"
                />
              </div>
              <div>
                <label htmlFor="gc-signup-last" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Last name
                </label>
                <input
                  id="gc-signup-last"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 focus:border-[#f06232] focus:ring-2"
                />
              </div>
            </div>

            <div>
              <label htmlFor="gc-signup-email" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Work email
              </label>
              <input
                id="gc-signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 focus:border-[#f06232] focus:ring-2"
              />
            </div>

            <div>
              <label htmlFor="gc-signup-company" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Company name
              </label>
              <input
                id="gc-signup-company"
                type="text"
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 focus:border-[#f06232] focus:ring-2"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="gc-signup-phone" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Phone <span className="font-normal normal-case text-neutral-400">(optional)</span>
                </label>
                <input
                  id="gc-signup-phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 focus:border-[#f06232] focus:ring-2"
                />
              </div>
              <div>
                <label htmlFor="gc-signup-website" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Company website <span className="font-normal normal-case text-neutral-400">(optional)</span>
                </label>
                <input
                  id="gc-signup-website"
                  type="url"
                  autoComplete="url"
                  placeholder="https://"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 placeholder:text-neutral-400 focus:border-[#f06232] focus:ring-2"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor={showPassword ? "gc-signup-password-plain" : "gc-signup-password-masked"}
                className="block text-xs font-semibold uppercase tracking-wide text-neutral-500"
              >
                Password
              </label>
              <div className="mt-1 flex min-h-[2.625rem] overflow-hidden rounded-md border border-neutral-300 bg-white ring-[#f06232]/35 focus-within:border-[#f06232] focus-within:ring-2">
                <input
                  id="gc-signup-password-masked"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-neutral-900 outline-none ring-0 focus:ring-0"
                />
                <button
                  type="button"
                  className="flex shrink-0 items-center justify-center border-l border-neutral-200 bg-neutral-50 px-3.5 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="gc-signup-confirm" className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Confirm password
              </label>
              <input
                id="gc-signup-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 focus:border-[#f06232] focus:ring-2"
              />
            </div>

            <button
              type="submit"
              disabled={state === "submitting"}
              className="w-full rounded-md bg-[#f06232] px-4 py-2.5 text-sm font-bold text-white shadow hover:opacity-95 disabled:opacity-60"
            >
              {state === "submitting" ? "Creating account…" : "Create account"}
            </button>

            <p className="text-center text-sm text-neutral-600">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-[#f06232] underline hover:text-[#d45529]">
                Log in
              </Link>
            </p>
            <p className="text-center text-sm text-neutral-500">
              Need a custom quote without an account?{" "}
              <Link href="/request-pricing" className="font-semibold text-[#f06232] underline hover:text-[#d45529]">
                Request pricing
              </Link>
            </p>
          </form>
        ) : null}

        <p className="mt-8 text-center text-sm text-neutral-600">
          <Link href="/store" className="text-[#f06232] hover:underline">
            Browse catalog
          </Link>
          <span className="mx-2 text-neutral-300">·</span>
          <button type="button" className="text-[#f06232] hover:underline" onClick={() => router.back()}>
            Back
          </button>
        </p>
      </div>
    </div>
  );
}

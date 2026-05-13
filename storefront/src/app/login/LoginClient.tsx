"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { safeCommerceNextPath } from "@/lib/auth/safe-next-path";
import { resolvePostLoginRedirectPath } from "@/lib/auth/post-login-path";
import {
  requestedAdminRoute,
  signInIssueFromSupabaseAuthError,
  type SignInIssue,
} from "@/lib/auth/format-sign-in-error";

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
  const [signInIssue, setSignInIssue] = React.useState<SignInIssue | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);

  const passwordMaskedRef = React.useRef<HTMLInputElement>(null);
  const passwordPlainRef = React.useRef<HTMLInputElement>(null);

  const issueStr = Array.isArray(issue) ? issue[0] : issue;
  const explicitDest = safeCommerceNextPath(nextPath);
  const signInAlertRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!signInIssue || !signInAlertRef.current) return;
    signInAlertRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [signInIssue]);

  function togglePasswordVisible() {
    setShowPassword((prev) => {
      const next = !prev;
      window.setTimeout(() => {
        if (next) {
          const el = passwordPlainRef.current;
          el?.focus();
          const len = el?.value.length ?? 0;
          try {
            el?.setSelectionRange(len, len);
          } catch {
            /* setSelectionRange not supported on some password-type fallbacks */
          }
        } else {
          passwordMaskedRef.current?.focus();
        }
      }, 0);
      return next;
    });
  }

  async function runSignIn() {
    setSignInIssue(null);
    if (!supabaseConfigured) {
      setSignInIssue({
        title: "Customer login is not available here",
        lines: [
          "Supabase environment variables are missing, so password login cannot run in this deployment.",
        ],
      });
      return;
    }
    if (!email.trim() || !password) {
      setSignInIssue({
        title: "Missing email or password",
        lines: ["Enter both your email address and password, then try again."],
      });
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) {
        setSignInIssue(signInIssueFromSupabaseAuthError(signErr));
        return;
      }
      if (!signData.session) {
        setSignInIssue({
          title: "No session returned",
          lines: [
            "Sign-in did not produce a session. Check Supabase Auth configuration or try again.",
          ],
        });
        return;
      }
      const accessToken = signData.session.access_token;
      const res = await fetch("/api/auth/post-login-destination", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
      if (!res.ok) {
        const detail =
          typeof body.error === "string" && body.error.trim()
            ? body.error.trim()
            : `The server responded with HTTP ${res.status}.`;
        setSignInIssue({
          title: "Signed in, but routing failed",
          lines: [
            detail,
            "Try again in a moment. If it keeps happening, contact support with the approximate time.",
          ],
        });
        return;
      }
      const apiPath =
        typeof body.path === "string" && body.path.startsWith("/") && !body.path.startsWith("//")
          ? body.path
          : "/account";
      const isActiveAdmin = apiPath === "/admin";
      if (hasExplicitNext && requestedAdminRoute(explicitDest) && !isActiveAdmin) {
        setSignInIssue({
          title: "Not an admin account",
          lines: [
            "Your email and password worked, but this account does not have an active admin profile in GloveCubs.",
            "You were trying to open the admin console. Use your buyer account from the storefront, or ask an owner to grant admin access for this email.",
          ],
        });
        return;
      }
      const dest = resolvePostLoginRedirectPath({
        hasExplicitNext,
        safeNextPath: explicitDest,
        isActiveAdmin,
      });
      window.location.assign(dest);
    } catch (err) {
      setSignInIssue(
        signInIssueFromSupabaseAuthError({
          message: err instanceof Error ? err.message : "Sign-in failed.",
        }),
      );
    } finally {
      setBusy(false);
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
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-neutral-900">Customer Login</h1>
        </div>

        {issueStr === "no_membership" ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
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
          <p className="mt-6 text-center text-sm text-neutral-600">
            Customer login is not configured (missing Supabase environment variables). Use{" "}
            <Link href="/request-pricing" className="text-[#f06232] underline">
              business pricing
            </Link>{" "}
            to reach the team.
          </p>
        ) : (
          <form
            className="mt-8 space-y-4"
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              void runSignIn();
            }}
          >
            {signInIssue ? (
              <div
                ref={signInAlertRef}
                role="alert"
                aria-live="assertive"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"
              >
                <p className="font-semibold">{signInIssue.title}</p>
                {signInIssue.lines.length === 1 ? (
                  <p className="mt-1.5 text-red-900">{signInIssue.lines[0]}</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-red-900">
                    {signInIssue.lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            <div>
              <label
                htmlFor="gc-login-email"
                className="block text-xs font-semibold uppercase tracking-wide text-neutral-500"
              >
                Email
              </label>
              <input
                id="gc-login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none ring-[#f06232]/35 placeholder:text-neutral-400 focus:border-[#f06232] focus:ring-2"
              />
            </div>
            <div>
              <label
                htmlFor={showPassword ? "gc-login-password-plain" : "gc-login-password-masked"}
                className="block text-xs font-semibold uppercase tracking-wide text-neutral-500"
              >
                Password
              </label>
              <div className="mt-1 flex min-h-[2.625rem] overflow-hidden rounded-md border border-neutral-300 bg-white ring-[#f06232]/35 focus-within:border-[#f06232] focus-within:ring-2">
                <input
                  ref={passwordMaskedRef}
                  id="gc-login-password-masked"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  tabIndex={showPassword ? -1 : 0}
                  className={
                    showPassword
                      ? "hidden"
                      : "min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-neutral-900 outline-none ring-0 placeholder:text-neutral-400 focus:ring-0"
                  }
                />
                <input
                  ref={passwordPlainRef}
                  id="gc-login-password-plain"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  tabIndex={!showPassword ? -1 : 0}
                  className={
                    showPassword
                      ? "min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-neutral-900 outline-none ring-0 placeholder:text-neutral-400 focus:ring-0"
                      : "hidden"
                  }
                />
                <button
                  type="button"
                  className="flex shrink-0 items-center justify-center border-l border-neutral-200 bg-neutral-50 px-3.5 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f06232]/45"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-controls={showPassword ? "gc-login-password-plain" : "gc-login-password-masked"}
                  onClick={togglePasswordVisible}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-[#f06232] px-4 py-2.5 text-sm font-bold text-white shadow hover:opacity-95 disabled:opacity-60"
            >
              {busy ? "Logging in…" : "Log in"}
            </button>
            <p className="text-center text-sm text-neutral-600">
              <Link href="/request-pricing" className="font-semibold text-[#f06232] underline hover:text-[#d45529]">
                Become a customer
              </Link>{" "}
              to set up an account for immediate discounts on bulk shipments.
            </p>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-neutral-600">
          <Link href="/store" className="text-[#f06232] hover:underline">
            Continue shopping
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

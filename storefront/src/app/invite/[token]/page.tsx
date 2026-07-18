import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { validateInviteToken } from "@/lib/admin/admin-company-invite";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { InviteAcceptClient } from "./InviteAcceptClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accept Invitation | GloveCubs",
  description: "Accept your company invitation to join GloveCubs.",
  robots: { index: false, follow: false },
};

export default async function InviteAcceptPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-white">Invitations Unavailable</h1>
          <p className="mt-4 text-sm text-white/65">
            The invitation system is not configured for this deployment.
          </p>
        </main>
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const result = await validateInviteToken(supabase, token);

  if (!result.valid) {
    const reasonMessages: Record<string, { title: string; body: string }> = {
      not_found: {
        title: "Invitation Not Found",
        body: "This invitation link is invalid or does not exist.",
      },
      expired: {
        title: "Invitation Expired",
        body: "This invitation has expired. Please contact your company admin to request a new invitation.",
      },
      revoked: {
        title: "Invitation Revoked",
        body: "This invitation was revoked by an administrator.",
      },
      accepted: {
        title: "Invitation Already Used",
        body: "This invitation has already been accepted. If you're having trouble signing in, use the login page.",
      },
    };

    const msg = reasonMessages[result.reason] ?? {
      title: "Invalid Invitation",
      body: "This invitation link is not valid.",
    };

    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-6 py-8">
            <h1 className="text-xl font-bold text-red-100">{msg.title}</h1>
            <p className="mt-4 text-sm text-red-100/80">{msg.body}</p>
          </div>
          <p className="mt-6 text-sm text-white/55">
            <Link href="/login" className="font-semibold text-[#f06232] hover:underline">
              Go to login
            </Link>
            <span className="mx-2 text-white/30">·</span>
            <Link href="/contact" className="font-semibold text-[#f06232] hover:underline">
              Contact support
            </Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-6 py-8">
          <h1 className="text-xl font-bold text-white">Join {result.invite.company_trade_name}</h1>
          <p className="mt-3 text-sm text-white/65">
            You've been invited to join <strong className="text-white/90">{result.invite.company_trade_name}</strong>{" "}
            as a <strong className="text-white/90">{result.invite.role}</strong>.
          </p>
          <p className="mt-2 text-xs text-white/45">
            Invitation for: {result.invite.email}
          </p>
          <InviteAcceptClient token={token} email={result.invite.email} />
        </div>
      </main>
    </div>
  );
}

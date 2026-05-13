import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";
import { AccountSignOut } from "./AccountSignOut";
import { getAdminUser } from "@/lib/admin/get-admin-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account | GloveCubs",
  description: "Your GloveCubs business account.",
};

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect("/login?next=%2Faccount");
  }

  const showWorkspace = gate.kind === "ready" || gate.kind === "active_company_required";
  const workspaceHref =
    gate.kind === "active_company_required" ? "/workspace/procurement/active-company" : "/workspace/procurement";
  const adminUser = await getAdminUser();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-white">Account home</h1>
        <p className="mt-2 text-sm text-white/65">
          Sign-in, quotes, and your buyer workspace—everything you need to keep restocks moving.
        </p>

        {adminUser ? (
          <div className="mt-6 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            You are signed in as an operator.{" "}
            <Link className="font-semibold text-[#f06232] underline" href="/admin">
              Open admin console
            </Link>
            .
          </div>
        ) : null}

        {gate.kind === "no_membership" ? (
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Your account is not linked to an organization yet.{" "}
            <Link className="font-semibold text-[#f06232] underline" href="/request-pricing">
              Request business pricing
            </Link>{" "}
            or{" "}
            <Link className="font-semibold text-[#f06232] underline" href="/contact">
              contact support
            </Link>
            .
          </div>
        ) : null}

        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Buying & quotes</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/quote-cart">
                Quote request cart
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Build a line list; our team returns formal pricing.</span>
            </li>
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/store">
                Product catalog
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Browse published gloves and disposables.</span>
            </li>
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href="/request-pricing">
                Request business pricing
              </Link>
              <span className="mt-0.5 block text-xs text-white/45">Volume programs and contract conversations.</span>
            </li>
          </ul>
        </section>

        {showWorkspace ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Workspace</h2>
            <p className="mt-2 text-sm text-white/55">
              Savings, alternates, and reorder shortcuts for your company—available when your account is fully linked.
            </p>
            <p className="mt-3">
              <Link className="font-semibold text-[#f06232] hover:underline" href={workspaceHref}>
                Open buyer workspace
              </Link>
            </p>
          </section>
        ) : null}

        <div className="mt-10">
          <AccountSignOut />
        </div>
      </main>
    </div>
  );
}

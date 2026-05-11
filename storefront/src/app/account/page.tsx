import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";
import { AccountSignOut } from "./AccountSignOut";

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

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-white">Account</h1>
        <p className="mt-2 text-sm text-white/65">
          Manage sign-in, quotes, and (when enabled) your organization workspace.
        </p>

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

        <ul className="mt-8 space-y-3 text-sm">
          <li>
            <Link className="font-medium text-[#f06232] hover:underline" href="/quote-cart">
              Cart / quote request
            </Link>
          </li>
          <li>
            <Link className="font-medium text-[#f06232] hover:underline" href="/store">
              Shop catalog
            </Link>
          </li>
          <li>
            <Link className="font-medium text-[#f06232] hover:underline" href="/request-pricing">
              Business pricing
            </Link>
          </li>
          {showWorkspace ? (
            <li>
              <Link className="font-medium text-[#f06232] hover:underline" href={workspaceHref}>
                Workspace
              </Link>
            </li>
          ) : null}
        </ul>

        <div className="mt-10">
          <AccountSignOut />
        </div>
      </main>
    </div>
  );
}

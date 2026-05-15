import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  assertCustomerCompanyAccess,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { fetchAdminShipToAddresses } from "@/lib/admin/admin-ship-to-addresses";
import { canMutateShipToAddresses, fetchCustomerCompanyMemberRole } from "@/lib/commerce/ship-to-address-mutation-role";
import { BuyerShipToAddressesClient } from "./BuyerShipToAddressesClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shipping addresses | GloveCubs",
  description: "Company delivery locations for your GloveCubs buyer account.",
};

export default async function BuyerShippingAddressesPage() {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect("/login?next=%2Faccount%2Fshipping-addresses");
  }
  if (gate.kind === "no_membership" || gate.kind === "active_company_required") {
    redirect("/account");
  }

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
  if (!allowed) {
    redirect("/account");
  }

  const role = await fetchCustomerCompanyMemberRole(supabase, userId, companyId);
  if (!role) {
    redirect("/account");
  }

  const canMutate = canMutateShipToAddresses(role);
  const { rows, error } = await fetchAdminShipToAddresses(supabase, companyId);

  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-white">Shipping addresses</h1>
          <p className="mt-4 text-sm text-red-300">{error}</p>
          <p className="mt-6 text-sm text-white/65">
            <Link className="font-semibold text-[#f06232] underline" href="/account">
              Back to account
            </Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-4 text-[11px] text-white/45">
          <Link href="/account" className="text-[#f06232]/90 hover:underline">
            Account
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-white/70">Shipping addresses</span>
        </nav>

        <h1 className="text-2xl font-bold text-white">Shipping addresses</h1>

        <div className="mt-4 space-y-2 text-sm text-white/70">
          <p>Shipping addresses are shared by your company.</p>
          <p>They will be used for future quote and order workflows.</p>
          <p>Changing an address will not change past order records.</p>
        </div>

        <BuyerShipToAddressesClient initialAddresses={rows} canMutate={canMutate} />

        <p className="mt-10 text-sm text-white/55">
          <Link className="font-semibold text-[#f06232] hover:underline" href="/account">
            Back to account home
          </Link>
        </p>
      </main>
    </div>
  );
}

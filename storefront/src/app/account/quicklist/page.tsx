import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  assertCustomerCompanyAccess,
  redirectsToAccountHub,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { fetchBuyerQuicklistForCompany } from "@/lib/account/buyer-quicklist-read-model";
import { BuyerQuicklistClient } from "./BuyerQuicklistClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Glove quicklist | GloveCubs",
  description: "Company-assigned glove variants for faster quote requests.",
};

export default async function AccountQuicklistPage() {
  if (!isSupabaseConfigured()) {
    redirect("/request-pricing");
  }

  const supabase = getSupabaseAdmin() as any;
  const gate = await resolveCustomerProcurementGate(supabase);
  if (gate.kind === "sign_in_required") {
    redirect("/login?next=%2Faccount%2Fquicklist");
  }
  if (redirectsToAccountHub(gate)) {
    redirect("/account");
  }

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabase, userId, companyId);
  if (!allowed) {
    redirect("/account");
  }

  const { rows, error } = await fetchBuyerQuicklistForCompany(supabase, companyId);

  let tierCode: string | null = null;
  const { data: co } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("b2b_pricing_tier_code")
    .eq("id", companyId)
    .maybeSingle();
  if (co && typeof co.b2b_pricing_tier_code === "string") {
    tierCode = co.b2b_pricing_tier_code;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))]">
        <SiteHeaderLoader />
        <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-white">Glove quicklist</h1>
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
          <span className="text-white/70">Glove quicklist</span>
        </nav>

        <h1 className="text-2xl font-bold text-white">Glove quicklist</h1>
        <p className="mt-2 text-sm text-white/65">
          Variants your GloveCubs team assigned to this company for quote requests — separate from procurement memory.
        </p>

        <BuyerQuicklistClient rows={rows} tierCode={tierCode} />

        <p className="mt-10 text-sm text-white/55">
          <Link className="font-semibold text-[#f06232] hover:underline" href="/account">
            Back to account home
          </Link>
          <span className="mx-2 text-white/30">·</span>
          <Link className="font-semibold text-[#f06232] hover:underline" href="/quote-cart">
            Quote request cart
          </Link>
        </p>
      </main>
    </div>
  );
}

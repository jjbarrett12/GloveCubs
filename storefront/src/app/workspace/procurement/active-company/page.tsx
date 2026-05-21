import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";
import { ActiveCompanyPickerClient } from "./ActiveCompanyPickerClient";

export const dynamic = "force-dynamic";

export default async function ProcurementActiveCompanyPage() {
  const supabase = getSupabaseAdmin() as any;
  const g = await resolveCustomerProcurementGate(supabase);
  if (g.kind === "sign_in_required") {
    redirect(`/login?next=${encodeURIComponent("/workspace/procurement/active-company")}`);
  }
  if (g.kind === "no_membership") redirect("/login?issue=no_membership");
  if (g.kind === "ready") redirect("/workspace/procurement");

  const ids = g.companyIds;
  const { data: rows } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id, trade_name")
    .in("id", ids);

  const options = ids.map((id) => {
    const r = (rows || []).find((x: { id: string }) => String(x.id) === id);
    const name = r && typeof (r as { trade_name?: string }).trade_name === "string" ? (r as { trade_name: string }).trade_name.trim() : "";
    return { id, label: name || id };
  });

  return (
    <div className="mx-auto max-w-lg text-sm">
      <h1 className="text-lg font-semibold text-white/90">Select organization</h1>
      <p className="mt-2 text-white/60">
        Your account is linked to multiple organizations. Choose the one to use for procurement and quote pricing context.
        This choice is saved to your profile.
      </p>
      <ActiveCompanyPickerClient options={options} />
    </div>
  );
}

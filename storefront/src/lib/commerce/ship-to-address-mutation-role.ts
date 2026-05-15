import type { SupabaseClient } from "@supabase/supabase-js";

export function canMutateShipToAddresses(role: string): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export async function fetchCustomerCompanyMemberRole(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema("gc_commerce")
    .from("company_members")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data || typeof (data as { role?: unknown }).role !== "string") {
    return null;
  }
  return String((data as { role: string }).role);
}

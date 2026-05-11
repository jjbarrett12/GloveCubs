import { resolveCommerceHeaderAuth } from "@/lib/customer/commerce-header-auth";
import { SiteHeader } from "@/components/home/SiteHeader";

export async function SiteHeaderLoader() {
  const auth = await resolveCommerceHeaderAuth();
  return <SiteHeader auth={auth} />;
}

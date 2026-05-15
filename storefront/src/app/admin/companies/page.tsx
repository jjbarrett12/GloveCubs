import { PageHeader, PageSection } from "@/components/admin";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAdminCompaniesDirectory } from "@/lib/admin/admin-companies-read-model";
import { CompaniesDirectoryClient } from "./CompaniesDirectoryClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Customers | GloveCubs Admin",
  robots: { index: false, follow: false },
};

export default async function AdminCompaniesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Customer accounts" description="Supabase is not configured in this environment." />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const { rows, error } = await fetchAdminCompaniesDirectory(supabase);

  if (error) {
    return (
      <div>
        <PageHeader title="Customer accounts" description="Could not load customer accounts." />
        <p className="mt-4 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        title="Customer accounts"
        description="Operational workspace for pricing tiers, delivery locations, preferred products, team access, and order records."
      />

      <PageSection title="Directory">
        <CompaniesDirectoryClient rows={rows} />
      </PageSection>
    </div>
  );
}

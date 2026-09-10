import Link from "next/link";
import { PageHeader, PremiumSectionCard } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { adminLink } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { CompetitorCrosswalkClient } from "./CompetitorCrosswalkClient";

export const dynamic = "force-dynamic";

export default async function CompetitorCrosswalkPage() {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Competitor crosswalk" description="Sign in as an admin operator." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Competitor crosswalk"
        description="Seed competitor products, aliases, and operator-approved GloveCubs equivalents. Approval is never automatic."
        breadcrumb={[{ label: "Invoice intakes", href: "/admin/invoices" }, { label: "Crosswalk" }]}
      />
      <PremiumSectionCard title="Operator workflow">
        <CompetitorCrosswalkClient />
      </PremiumSectionCard>
      <Link href="/admin/invoices" className={cn("mt-4 inline-block text-sm", adminLink)}>
        ← Invoice intakes
      </Link>
    </div>
  );
}

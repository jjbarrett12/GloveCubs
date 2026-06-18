import Link from "next/link";
import { PageHeader, PageSection } from "@/components/admin";
import { adminCardSurface, adminFocusRing, adminLink } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProcurementCompanyHubPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;
  const links: { href: string; label: string; description: string }[] = [
    {
      href: `/admin/procurement/company/${companyId}/queue`,
      label: "Savings recommendations",
      description: "Review and approve savings recommendations for this company.",
    },
    {
      href: `/admin/procurement/company/${companyId}/blocked`,
      label: "Blocked recommendations",
      description: "Rows blocked from promotion with recorded reasons.",
    },
    {
      href: `/admin/procurement/company/${companyId}/spend`,
      label: "Verified spend history",
      description: "Observed unit prices and quantities from verified invoice lines.",
    },
    {
      href: `/admin/procurement/company/${companyId}/suppliers`,
      label: "Supplier activity",
      description: "Recent supplier touchpoints from verified invoice data.",
    },
    {
      href: `/admin/procurement/company/${companyId}/reorder`,
      label: "Reorder list",
      description: "Active reorder shortcuts and retire actions for this account.",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Company workspace"
        description={companyId}
        breadcrumb={[
          { label: "Sourcing", href: "/admin/procurement" },
          { label: "Company" },
        ]}
      />

      <PageSection title="Sections">
        <ul className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {links.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  adminCardSurface,
                  "block p-4 transition-colors hover:bg-admin-surface-muted",
                  adminFocusRing(),
                )}
              >
                <span className="font-medium text-admin-primary">{item.label}</span>
                <p className="mt-1 text-sm text-admin-muted">{item.description}</p>
                <span className={cn("mt-2 inline-block text-sm", adminLink)}>Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      </PageSection>

      <p className="text-sm text-admin-secondary">
        <Link href="/admin/procurement" className={adminLink}>
          ← Back to overview
        </Link>
      </p>
    </div>
  );
}

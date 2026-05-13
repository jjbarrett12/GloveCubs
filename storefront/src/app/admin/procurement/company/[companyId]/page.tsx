import Link from "next/link";
import { PageHeader, PageSection } from "@/components/admin";

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
                className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:border-gray-300 hover:shadow-md"
              >
                <span className="font-medium text-gray-900">{item.label}</span>
                <p className="mt-1 text-sm text-gray-500">{item.description}</p>
                <span className="mt-2 inline-block text-sm font-medium text-blue-700">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      </PageSection>

      <p className="text-sm text-gray-600">
        <Link href="/admin/procurement" className="font-medium text-blue-700 hover:underline">
          ← Back to overview
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import { PageHeader, PageSection } from "@/components/admin";
import { CompanyCreateForm } from "../CompanyCreateForm";

export const metadata = {
  title: "Add customer | GloveCubs Admin",
  robots: { index: false, follow: false },
};

export default function AdminCompanyNewPage() {
  return (
    <div>
      <PageHeader
        title="Add customer"
        description="Create a canonical gc_commerce company record. Contact and address fields are managed separately."
        breadcrumb={[
          { label: "Customers", href: "/admin/companies" },
          { label: "Add customer" },
        ]}
      />

      <PageSection>
        <CompanyCreateForm />
        <p className="mt-6 text-xs text-slate-500">
          <Link href="/admin/companies" className="text-[#f06232] underline">
            Back to customers
          </Link>
        </p>
      </PageSection>
    </div>
  );
}

import Link from "next/link";
import { PageHeader, SetupChecklist } from "@/components/admin";
import { adminLink } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { CompanyCreateForm } from "../CompanyCreateForm";

export const metadata = {
  title: "Add customer | GloveCubs Admin",
  robots: { index: false, follow: false },
};

export default function AdminCompanyNewPage() {
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        title="Add customer account"
        description="Create the customer account first, then continue setup for delivery locations, preferred products, and team access from the account workspace."
        breadcrumb={[
          { label: "Customer accounts", href: "/admin/companies" },
          { label: "Add customer" },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(260px,300px)_1fr] lg:items-start">
        <aside className="lg:sticky lg:top-4">
          <SetupChecklist />
        </aside>
        <div className="min-w-0 space-y-4">
          <CompanyCreateForm />
          <p className="text-xs text-admin-muted">
            <Link href="/admin/companies" className={cn("font-medium", adminLink)}>
              Back to customer accounts
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

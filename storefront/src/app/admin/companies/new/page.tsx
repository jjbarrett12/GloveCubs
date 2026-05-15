import Link from "next/link";
import { SetupChecklist } from "@/components/admin";
import { CompanyCreateForm } from "../CompanyCreateForm";

export const metadata = {
  title: "Add customer | GloveCubs Admin",
  robots: { index: false, follow: false },
};

export default function AdminCompanyNewPage() {
  return (
    <div className="mx-auto max-w-[1480px]">
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/admin/companies" className="font-medium text-slate-600 hover:text-[#f06232]">
          Customer accounts
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-900">Add customer</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]">Add customer account</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Create the customer account first, then continue setup for delivery locations, preferred products, and team
          access from the account workspace.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(260px,300px)_1fr] lg:items-start">
        <aside className="lg:sticky lg:top-4">
          <SetupChecklist />
        </aside>
        <div className="min-w-0 space-y-4">
          <CompanyCreateForm />
          <p className="text-xs text-slate-500">
            <Link href="/admin/companies" className="font-medium text-[#f06232] hover:underline">
              Back to customer accounts
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

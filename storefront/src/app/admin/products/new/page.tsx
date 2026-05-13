import { PageHeader } from "@/components/admin";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { ProductEditorForm } from "@/app/admin/products/_components/ProductEditorForm";

export const metadata = {
  title: "New product | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminNewProductPage() {
  const categories = await fetchAdminCategoriesForProductForm();

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title="Add product"
        description="Draft first, publish later: new rows default to draft. Publishing requires category, a non-placeholder image, and at least one active variant per database guardrails."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "New" },
        ]}
      />
      {categories.length === 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          No categories returned from Supabase. Confirm catalogos.categories is populated before assigning products.
        </div>
      ) : null}
      <ProductEditorForm categories={categories} mode="create" />
    </div>
  );
}

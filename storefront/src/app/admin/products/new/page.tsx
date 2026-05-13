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
    <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-4 pb-8 shadow-md ring-1 ring-black/30 sm:p-5">
      <PageHeader
        variant="dark"
        title="Add product"
        description="Draft first, publish later: new rows default to draft. Publishing requires category, a non-placeholder image, and at least one active variant per database guardrails."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "New" },
        ]}
      />
      {categories.length === 0 ? (
        <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          No categories returned from Supabase. Confirm catalogos.categories is populated before assigning products.
        </div>
      ) : null}
      <ProductEditorForm categories={categories} mode="create" />
    </div>
  );
}

import { PageHeader, ErrorState } from "@/components/admin";
import { adminAlertSurface } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { ProductEditorForm } from "@/app/admin/products/_components/ProductEditorForm";

export const metadata = {
  title: "New product | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminNewProductPage() {
  const categories = await fetchAdminCategoriesForProductForm();

  return (
    <div>
      <PageHeader
        title="Add product"
        description="Draft first, publish later: new rows default to draft. Publishing requires category, a non-placeholder image, and at least one active variant per database guardrails."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: "New" },
        ]}
      />
      {categories.length === 0 ? (
        <div className={cn(adminAlertSurface("warning", "mb-4"))}>
          No categories returned from the catalog. Confirm categories are populated before assigning products.
        </div>
      ) : null}
      <ProductEditorForm categories={categories} mode="create" />
    </div>
  );
}

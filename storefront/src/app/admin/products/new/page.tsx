import { PageHeader, ErrorState } from "@/components/admin";
import { adminAlertSurface } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { ProductEditorForm } from "@/app/admin/products/_components/ProductEditorForm";
import {
  CATALOGOS_CANONICAL_PUBLISH_MESSAGE,
  catalogosPublishDashboardUrl,
  isStorefrontManualActivePublishAllowed,
  resolveCatalogosPublicBaseUrl,
} from "@/lib/admin/canonical-publish-policy";

export const metadata = {
  title: "New product | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminNewProductPage() {
  const { rows: categories } = await fetchAdminCategoriesForProductForm();
  const allowStorefrontActivePublish = isStorefrontManualActivePublishAllowed();
  const catalogosBase = resolveCatalogosPublicBaseUrl();
  const catalogosPublishUrl = catalogosBase ? catalogosPublishDashboardUrl(catalogosBase) : null;

  return (
    <div>
      <PageHeader
        title="Add product"
        description="Draft first. Production go-live publish uses CatalogOS runPublish — not storefront active status."
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
      <ProductEditorForm
        categories={categories}
        mode="create"
        allowStorefrontActivePublish={allowStorefrontActivePublish}
        catalogosPublishUrl={catalogosPublishUrl}
        canonicalPublishMessage={CATALOGOS_CANONICAL_PUBLISH_MESSAGE}
      />
    </div>
  );
}

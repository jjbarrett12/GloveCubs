import { notFound } from "next/navigation";
import { ADMIN_PRODUCT_UUID_RE, fetchAdminProductDetail } from "@/lib/admin/product-operations";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { ProductEditorShell } from "@/app/admin/products/_components/ProductEditorShell";
import { ErrorState } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit product | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminEditProductPage({ params }: { params: { productId: string } }) {
  const { productId } = params;
  if (!ADMIN_PRODUCT_UUID_RE.test(productId)) notFound();

  const [data, categories] = await Promise.all([
    fetchAdminProductDetail(productId),
    fetchAdminCategoriesForProductForm(),
  ]);

  if (!data.configured) {
    return (
      <ErrorState
        title="Database not configured"
        message="Product editor cannot load in this environment. Review Admin Health for configuration status."
      />
    );
  }

  if (data.notFound || !data.product || !data.editor) notFound();

  const primary =
    (data.images ?? []).find((im) => im.isPrimary)?.url ?? (data.images ?? [])[0]?.url ?? "";

  return (
    <ProductEditorShell
      categories={categories}
      productId={productId}
      product={data.product}
      variants={data.variants ?? []}
      warnings={data.warnings ?? []}
      storefrontPdpPath={data.storefrontPdpPath ?? null}
      editor={data.editor}
      primaryImageUrl={primary}
    />
  );
}

import { notFound } from "next/navigation";
import { ADMIN_PRODUCT_UUID_RE, fetchAdminProductDetail } from "@/lib/admin/product-operations";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { ProductEditorShell } from "@/app/admin/products/_components/ProductEditorShell";

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
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Supabase is not configured for this environment.
        </div>
      </div>
    );
  }

  if (data.notFound || !data.product || !data.editor) notFound();

  const primary =
    (data.images ?? []).find((im) => im.isPrimary)?.url ?? (data.images ?? [])[0]?.url ?? "";

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
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
    </div>
  );
}

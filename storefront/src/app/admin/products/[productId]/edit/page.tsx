import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin";
import { ADMIN_PRODUCT_UUID_RE, fetchAdminProductDetail } from "@/lib/admin/product-operations";
import { fetchAdminCategoriesForProductForm } from "@/lib/admin/product-form-options";
import { ProductEditorForm, type ProductEditorInitial } from "@/app/admin/products/_components/ProductEditorForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit product | GloveCubs admin",
  robots: { index: false, follow: false },
};

function metaStr(meta: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!meta || typeof meta !== "object") return "";
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export default async function AdminEditProductPage({ params }: { params: { productId: string } }) {
  const { productId } = params;
  if (!ADMIN_PRODUCT_UUID_RE.test(productId)) notFound();

  const [data, categories] = await Promise.all([fetchAdminProductDetail(productId), fetchAdminCategoriesForProductForm()]);
  if (!data.configured) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
        <PageHeader
          title="Edit product"
          breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: "Edit" }]}
        />
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Supabase is not configured for this environment.
        </div>
      </div>
    );
  }
  if (data.notFound || !data.product) notFound();

  const p = data.product;
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const cat = typeof meta.category_id === "string" ? meta.category_id : "";
  const primary = (data.images ?? []).find((im) => im.isPrimary)?.url ?? (data.images ?? [])[0]?.url ?? "";
  const quoteOnly = meta.quote_only === true;
  const variantsFromDb = (data.variants ?? []).filter((v) => v.isActive);
  const variants: ProductEditorInitial["variants"] =
    variantsFromDb.length > 0
      ? variantsFromDb.map((v) => {
          const vm = (v.metadata ?? {}) as Record<string, unknown>;
          const lp = vm.list_price;
          const listPrice = typeof lp === "number" ? String(lp) : typeof lp === "string" ? lp : "";
          return { sizeCode: v.sizeCode ?? "", variantSku: v.variantSku, listPrice };
        })
      : [{ sizeCode: "M", variantSku: "", listPrice: "" }];

  const initial: ProductEditorInitial = {
    productId: p.id,
    name: p.name,
    brandName: p.brandName ?? "",
    categoryId: cat,
    material: metaStr(meta, ["material"]),
    color: metaStr(meta, ["color"]),
    milThickness: metaStr(meta, ["mil_thickness", "mil"]),
    casePack: metaStr(meta, ["case_pack"]),
    description: p.description ?? "",
    primaryImageUrl: primary,
    status: p.status === "active" ? "active" : "draft",
    quoteOnly,
    variants,
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title={`Edit — ${p.name}`}
        description="Changes write to catalog_v2. Publishing flips status to active only when guards succeed."
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: p.name, href: `/admin/products/${p.id}` },
          { label: "Edit" },
        ]}
        actions={
          <Link
            href={`/admin/products/${p.id}`}
            className="text-sm font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline"
          >
            View read-only detail
          </Link>
        }
      />
      <ProductEditorForm categories={categories} initial={initial} mode="edit" />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/store/ProductImage";
import { ADMIN_PRODUCT_UUID_RE, fetchAdminProductDetail } from "@/lib/admin/product-operations";
import { PageHeader, PageSection, StatCard, StatGrid, StatusBadge, TableCard } from "@/components/admin";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { productId: string } }) {
  const { productId } = params;
  const short = ADMIN_PRODUCT_UUID_RE.test(productId) ? productId.slice(0, 8) : "?";
  return {
    title: `Product ${short}… | GloveCubs admin`,
    robots: { index: false, follow: false },
  };
}

function metaStr(meta: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!meta || typeof meta !== "object") return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const panel = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const dt = "text-xs font-semibold uppercase tracking-wide text-slate-500";
const dd = "mt-1 text-sm text-slate-900";

export default async function AdminProductDetailPage({ params }: { params: { productId: string } }) {
  const { productId } = params;
  if (!ADMIN_PRODUCT_UUID_RE.test(productId)) {
    notFound();
  }

  const data = await fetchAdminProductDetail(productId);
  if (!data.configured) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <PageHeader title="Product" breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: "Detail" }]} />
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Supabase is not configured for this environment.
        </div>
      </div>
    );
  }
  if (data.notFound || !data.product) {
    notFound();
  }

  const p = data.product;
  const catalogosBase = process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/$/, "") ?? "";

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 pb-10 shadow-sm sm:p-8">
      <PageHeader
        title={p.name}
        description={p.id}
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: p.name.length > 48 ? `${p.name.slice(0, 48)}…` : p.name },
        ]}
        actions={
          <Link
            href={`/admin/products/${p.id}/edit`}
            className="inline-flex items-center rounded-lg bg-[#f06232] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d]"
          >
            Edit product
          </Link>
        }
      />

      <PageSection title="Product identity">
        <div className={panel}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className={dt}>Slug</dt>
              <dd className={`${dd} font-mono`}>{p.slug}</dd>
            </div>
            <div>
              <dt className={dt}>Brand</dt>
              <dd className={dd}>{p.brandName ?? "—"}</dd>
            </div>
            <div>
              <dt className={dt}>Category</dt>
              <dd className={dd}>{p.categoryName ?? "—"}</dd>
            </div>
            <div>
              <dt className={dt}>Status</dt>
              <dd className="mt-0.5">
                <StatusBadge status={p.status} />
              </dd>
            </div>
            <div>
              <dt className={dt}>Internal SKU</dt>
              <dd className={`${dd} font-mono`}>{p.internalSku ?? "—"}</dd>
            </div>
            <div>
              <dt className={dt}>Created</dt>
              <dd className={`${dd} font-mono text-xs text-slate-500`}>{p.createdAt ?? "—"}</dd>
            </div>
            <div>
              <dt className={dt}>Updated</dt>
              <dd className={`${dd} font-mono text-xs text-slate-500`}>{p.updatedAt ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection
        title="Imagery"
        description={`${(data.images ?? []).length} image(s). Provenance from metadata.image_provenance.`}
      >
        <div className={panel}>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
            {(data.images ?? []).length === 0 ? (
              <ProductImage src={null} alt={p.name} containerClassName="max-w-[160px] !rounded-lg !border !border-slate-200 !bg-slate-100" />
            ) : (
              (data.images ?? []).map((im, i) => (
                <div key={`${im.url}-${i}`} className="space-y-1">
                  <ProductImage
                    src={im.url}
                    alt={`${p.name} — image ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    containerClassName="max-w-[180px] !rounded-lg !border !border-slate-200 !bg-slate-100"
                  />
                  <p className="text-xs text-slate-600">
                    {im.isPrimary ? "Primary · " : ""}
                    provenance: <span className="font-mono text-slate-800">{im.provenance ?? "—"}</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </PageSection>

      <PageSection title="Variants">
        <TableCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">Active</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Material / color</th>
                  <th className="p-3">Variant SKU</th>
                  <th className="p-3">GTIN</th>
                  <th className="p-3">Signature</th>
                  <th className="p-3">Duplicate flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-800">
                {(data.variants ?? []).map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80">
                    <td className="p-3">{v.isActive ? "Yes" : "No"}</td>
                    <td className="p-3 font-mono text-xs">{v.sizeCode ?? "—"}</td>
                    <td className="p-3 text-slate-600">
                      {metaStr(v.metadata, ["material", "primary_material", "glove_material", "color"]) ?? "—"}
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-900">{v.variantSku}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{v.gtin?.trim() || "—"}</td>
                    <td className="max-w-[180px] truncate p-3 font-mono text-xs text-slate-500">
                      {v.attributeSignature?.trim() || "—"}
                    </td>
                    <td className="p-3 text-amber-800">
                      {[v.gtinDuplicateRisk ? "GTIN" : null, v.signatureDuplicateRisk ? "Signature" : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableCard>
      </PageSection>

      <PageSection
        title="Product quality"
        description={`Attribute rows on file: ${data.attributeRowCount ?? 0}`}
      >
        <div className={panel}>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
            {(data.warnings ?? []).length === 0 ? (
              <li className="text-slate-500">No data-quality warnings for this product.</li>
            ) : (
              (data.warnings ?? []).map((w) => (
                <li key={w.code} className="text-amber-900">
                  {w.label}
                </li>
              ))
            )}
          </ul>
        </div>
      </PageSection>

      <PageSection title="Storefront readiness">
        <StatGrid columns={3} className="mb-4 gap-3">
          <StatCard
            label="Storefront visible"
            value={data.storefrontVisible ? "Yes" : "No"}
            color={data.storefrontVisible ? "green" : "default"}
            accentBorder
          />
          <StatCard
            label="Quote path"
            value={data.quoteEnabled ? "Yes" : "No"}
            color={data.quoteEnabled ? "green" : "default"}
            accentBorder
          />
          <StatCard
            label="Pending match reviews"
            value={String(data.pendingMatchReviewCount ?? 0)}
            color="blue"
            accentBorder
          />
        </StatGrid>
        <div className={panel}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className={dt}>Preview</dt>
              <dd className="mt-0.5">
                {data.storefrontPdpPath ? (
                  <Link href={data.storefrontPdpPath} className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline">
                    Open storefront PDP
                  </Link>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection title="Catalog sync tools" description="Read-only shortcuts. No ingestion or edits from this page.">
        <div className={panel}>
          <ul className="list-inside list-disc space-y-2 text-sm text-slate-700">
            {catalogosBase ? (
              <>
                <li>
                  <a
                    href={`${catalogosBase}/dashboard/url-import`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline"
                  >
                    Open catalog sync — URL import
                  </a>
                </li>
                <li>
                  <a
                    href={catalogosBase}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline"
                  >
                    Catalog sync home
                  </a>
                </li>
              </>
            ) : (
              <li className="text-slate-600">
                Set <code className="rounded border border-slate-200 bg-slate-100 px-1 font-mono text-xs text-slate-800">
                  NEXT_PUBLIC_CATALOGOS_URL
                </code>{" "}
                for deep links.
              </li>
            )}
          </ul>
        </div>
      </PageSection>

      <p className="text-sm text-slate-600">
        <Link href="/admin/catalog" className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline">
          Catalog overview
        </Link>
        {" · "}
        <Link href="/admin/products" className="font-semibold text-[#c2410c] hover:text-[#e5582d] hover:underline">
          Back to grid
        </Link>
      </p>
    </div>
  );
}

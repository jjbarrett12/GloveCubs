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

export default async function AdminProductDetailPage({ params }: { params: { productId: string } }) {
  const { productId } = params;
  if (!ADMIN_PRODUCT_UUID_RE.test(productId)) {
    notFound();
  }

  const data = await fetchAdminProductDetail(productId);
  if (!data.configured) {
    return (
      <div>
        <PageHeader title="Product" breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: "Detail" }]} />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
    <div className="pb-10">
      <PageHeader
        title={p.name}
        description={p.id}
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: p.name.length > 48 ? `${p.name.slice(0, 48)}…` : p.name },
        ]}
      />

      <PageSection title="Product identity">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Slug</dt>
              <dd className="mt-0.5 font-mono text-gray-900">{p.slug}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Brand</dt>
              <dd className="mt-0.5 text-gray-900">{p.brandName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Category</dt>
              <dd className="mt-0.5 text-gray-900">{p.categoryName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</dt>
              <dd className="mt-0.5">
                <StatusBadge status={p.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Internal SKU</dt>
              <dd className="mt-0.5 font-mono text-gray-900">{p.internalSku ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Created</dt>
              <dd className="mt-0.5 font-mono text-xs text-gray-700">{p.createdAt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Updated</dt>
              <dd className="mt-0.5 font-mono text-xs text-gray-700">{p.updatedAt ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection
        title="Imagery"
        description={`${(data.images ?? []).length} image(s). Provenance from metadata.image_provenance.`}
      >
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
            {(data.images ?? []).length === 0 ? (
              <ProductImage src={null} alt={p.name} containerClassName="max-w-[160px]" />
            ) : (
              (data.images ?? []).map((im, i) => (
                <div key={`${im.url}-${i}`} className="space-y-1">
                  <ProductImage
                    src={im.url}
                    alt={`${p.name} — image ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    containerClassName="max-w-[180px]"
                  />
                  <p className="text-xs text-gray-500">
                    {im.isPrimary ? "Primary · " : ""}
                    provenance: <span className="font-mono text-gray-700">{im.provenance ?? "—"}</span>
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
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
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
              <tbody className="divide-y divide-gray-100 bg-white">
                {(data.variants ?? []).map((v) => (
                  <tr key={v.id} className="hover:bg-blue-50/40">
                    <td className="p-3 text-gray-900">{v.isActive ? "Yes" : "No"}</td>
                    <td className="p-3 font-mono text-xs text-gray-900">{v.sizeCode ?? "—"}</td>
                    <td className="p-3 text-gray-700">
                      {metaStr(v.metadata, ["material", "primary_material", "glove_material", "color"]) ?? "—"}
                    </td>
                    <td className="p-3 font-mono text-xs text-gray-900">{v.variantSku}</td>
                    <td className="p-3 font-mono text-xs text-gray-700">{v.gtin?.trim() || "—"}</td>
                    <td className="max-w-[180px] truncate p-3 font-mono text-[10px] text-gray-500">
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
        description={`Attribute rows (catalogos): ${data.attributeRowCount ?? 0}`}
      >
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
            {(data.warnings ?? []).length === 0 ? (
              <li className="text-gray-500">No governance warnings for this product.</li>
            ) : (
              (data.warnings ?? []).map((w) => (
                <li key={w.code} className="text-amber-800">
                  {w.label}
                </li>
              ))
            )}
          </ul>
        </div>
      </PageSection>

      <PageSection title="Storefront readiness">
        <StatGrid columns={3} className="mb-4">
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
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">Preview</dt>
              <dd className="mt-0.5">
                {data.storefrontPdpPath ? (
                  <Link href={data.storefrontPdpPath} className="font-medium text-blue-700 hover:underline">
                    Open storefront PDP
                  </Link>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection title="CatalogOS" description="Read-only links. No ingestion or mutations from this console.">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <ul className="list-inside list-disc space-y-2 text-sm text-gray-700">
            {catalogosBase ? (
              <>
                <li>
                  <a
                    href={`${catalogosBase}/dashboard/url-import`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    Open CatalogOS (URL import)
                  </a>
                </li>
                <li>
                  <a href={catalogosBase} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">
                    CatalogOS home
                  </a>
                </li>
              </>
            ) : (
              <li className="text-gray-500">
                Set <code className="rounded bg-gray-100 px-1 font-mono text-xs">NEXT_PUBLIC_CATALOGOS_URL</code> for deep links.
              </li>
            )}
          </ul>
        </div>
      </PageSection>

      <p className="text-xs text-gray-500">
        <Link href="/admin/catalog" className="font-medium text-blue-700 hover:underline">
          Catalog health buckets
        </Link>
        {" · "}
        <Link href="/admin/products" className="font-medium text-blue-700 hover:underline">
          Back to grid
        </Link>
      </p>
    </div>
  );
}

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

const panel = "rounded-lg border border-white/10 bg-[#161616] p-4 shadow-sm ring-1 ring-white/[0.03]";
const dt = "text-[10px] font-semibold uppercase tracking-wide text-neutral-500";
const dd = "mt-0.5 text-sm text-neutral-100";

export default async function AdminProductDetailPage({ params }: { params: { productId: string } }) {
  const { productId } = params;
  if (!ADMIN_PRODUCT_UUID_RE.test(productId)) {
    notFound();
  }

  const data = await fetchAdminProductDetail(productId);
  if (!data.configured) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-5 shadow-md ring-1 ring-black/30">
        <PageHeader variant="dark" title="Product" breadcrumb={[{ label: "Products", href: "/admin/products" }, { label: "Detail" }]} />
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
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
    <div className="rounded-xl border border-white/10 bg-[#0e0e0e] p-4 pb-8 shadow-md ring-1 ring-black/30 sm:p-5">
      <PageHeader
        variant="dark"
        title={p.name}
        description={p.id}
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: p.name.length > 48 ? `${p.name.slice(0, 48)}…` : p.name },
        ]}
        actions={
          <Link
            href={`/admin/products/${p.id}/edit`}
            className="inline-flex items-center rounded-md bg-[#f06232] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d]"
          >
            Edit product
          </Link>
        }
      />

      <PageSection title="Product identity" variant="dark">
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
              <dd className={`${dd} font-mono text-xs text-neutral-400`}>{p.createdAt ?? "—"}</dd>
            </div>
            <div>
              <dt className={dt}>Updated</dt>
              <dd className={`${dd} font-mono text-xs text-neutral-400`}>{p.updatedAt ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection
        title="Imagery"
        description={`${(data.images ?? []).length} image(s). Provenance from metadata.image_provenance.`}
        variant="dark"
      >
        <div className={panel}>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
            {(data.images ?? []).length === 0 ? (
              <ProductImage src={null} alt={p.name} containerClassName="max-w-[160px] !border-white/15 !bg-black/40" />
            ) : (
              (data.images ?? []).map((im, i) => (
                <div key={`${im.url}-${i}`} className="space-y-1">
                  <ProductImage
                    src={im.url}
                    alt={`${p.name} — image ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    containerClassName="max-w-[180px] !border-white/15 !bg-black/40"
                  />
                  <p className="text-xs text-neutral-500">
                    {im.isPrimary ? "Primary · " : ""}
                    provenance: <span className="font-mono text-neutral-300">{im.provenance ?? "—"}</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </PageSection>

      <PageSection title="Variants" variant="dark">
        <TableCard variant="dark">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/10 bg-[#181818] text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
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
              <tbody className="divide-y divide-white/[0.06] bg-[#141414] text-neutral-200">
                {(data.variants ?? []).map((v) => (
                  <tr key={v.id} className="hover:bg-white/[0.04]">
                    <td className="p-3">{v.isActive ? "Yes" : "No"}</td>
                    <td className="p-3 font-mono text-xs">{v.sizeCode ?? "—"}</td>
                    <td className="p-3 text-neutral-300">
                      {metaStr(v.metadata, ["material", "primary_material", "glove_material", "color"]) ?? "—"}
                    </td>
                    <td className="p-3 font-mono text-xs text-neutral-100">{v.variantSku}</td>
                    <td className="p-3 font-mono text-xs text-neutral-400">{v.gtin?.trim() || "—"}</td>
                    <td className="max-w-[180px] truncate p-3 font-mono text-[10px] text-neutral-500">
                      {v.attributeSignature?.trim() || "—"}
                    </td>
                    <td className="p-3 text-amber-400/95">
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
        variant="dark"
      >
        <div className={panel}>
          <ul className="list-inside list-disc space-y-1 text-sm text-neutral-300">
            {(data.warnings ?? []).length === 0 ? (
              <li className="text-neutral-500">No governance warnings for this product.</li>
            ) : (
              (data.warnings ?? []).map((w) => (
                <li key={w.code} className="text-amber-400/95">
                  {w.label}
                </li>
              ))
            )}
          </ul>
        </div>
      </PageSection>

      <PageSection title="Storefront readiness" variant="dark">
        <StatGrid columns={3} className="mb-4 gap-3">
          <StatCard
            label="Storefront visible"
            value={data.storefrontVisible ? "Yes" : "No"}
            color={data.storefrontVisible ? "green" : "default"}
            accentBorder
            variant="dark"
          />
          <StatCard
            label="Quote path"
            value={data.quoteEnabled ? "Yes" : "No"}
            color={data.quoteEnabled ? "green" : "default"}
            accentBorder
            variant="dark"
          />
          <StatCard
            label="Pending match reviews"
            value={String(data.pendingMatchReviewCount ?? 0)}
            color="blue"
            accentBorder
            variant="dark"
          />
        </StatGrid>
        <div className={panel}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className={dt}>Preview</dt>
              <dd className="mt-0.5">
                {data.storefrontPdpPath ? (
                  <Link href={data.storefrontPdpPath} className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
                    Open storefront PDP
                  </Link>
                ) : (
                  <span className="text-neutral-600">—</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection title="CatalogOS" description="Read-only links. No ingestion or mutations from this console." variant="dark">
        <div className={panel}>
          <ul className="list-inside list-disc space-y-2 text-sm text-neutral-300">
            {catalogosBase ? (
              <>
                <li>
                  <a
                    href={`${catalogosBase}/dashboard/url-import`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline"
                  >
                    Open CatalogOS (URL import)
                  </a>
                </li>
                <li>
                  <a
                    href={catalogosBase}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline"
                  >
                    CatalogOS home
                  </a>
                </li>
              </>
            ) : (
              <li className="text-neutral-500">
                Set <code className="rounded border border-white/10 bg-black/30 px-1 font-mono text-xs text-neutral-300">
                  NEXT_PUBLIC_CATALOGOS_URL
                </code>{" "}
                for deep links.
              </li>
            )}
          </ul>
        </div>
      </PageSection>

      <p className="text-xs text-neutral-500">
        <Link href="/admin/catalog" className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
          Catalog health buckets
        </Link>
        {" · "}
        <Link href="/admin/products" className="font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
          Back to grid
        </Link>
      </p>
    </div>
  );
}

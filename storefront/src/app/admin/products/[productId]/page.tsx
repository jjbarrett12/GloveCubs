import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/store/ProductImage";
import { ADMIN_PRODUCT_UUID_RE, fetchAdminProductDetail } from "@/lib/admin/product-operations";
import { PageHeader, PageSection, StatCard, StatGrid, StatusBadge, TableCard, ErrorState } from "@/components/admin";
import {
  adminCardSurface,
  adminEyebrow,
  adminLink,
  adminPrimaryButton,
  adminTableBody,
  adminTableCell,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

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

const dt = adminEyebrow;
const dd = "mt-1 text-sm text-admin-primary";

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
        <ErrorState
          title="Database not configured"
          message="Product detail cannot be loaded in this environment. Review Admin Health for configuration status."
        />
      </div>
    );
  }
  if (data.notFound || !data.product) {
    notFound();
  }

  const p = data.product;
  const catalogosBase = process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/$/, "") ?? "";
  const productMeta = (p.metadata ?? {}) as Record<string, unknown>;
  const catalogosJobId =
    typeof productMeta.catalogos_url_import_job_id === "string"
      ? productMeta.catalogos_url_import_job_id.trim()
      : "";

  return (
    <div>
      <PageHeader
        title={p.name}
        description={p.id}
        breadcrumb={[
          { label: "Products", href: "/admin/products" },
          { label: p.name.length > 48 ? `${p.name.slice(0, 48)}…` : p.name },
        ]}
        actions={
          <Link href={`/admin/products/${p.id}/edit`} className={adminPrimaryButton}>
            Edit product
          </Link>
        }
      />

      <PageSection title="Product identity">
        <div className={cn(adminCardSurface, "p-5")}>
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
              <dd className={`${dd} font-mono text-xs text-admin-muted`}>{p.createdAt ?? "—"}</dd>
            </div>
            <div>
              <dt className={dt}>Updated</dt>
              <dd className={`${dd} font-mono text-xs text-admin-muted`}>{p.updatedAt ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection
        title="Imagery"
        description={`${(data.images ?? []).length} image(s). Provenance from metadata.image_provenance.`}
      >
        <div className={cn(adminCardSurface, "p-5")}>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
            {(data.images ?? []).length === 0 ? (
              <ProductImage
                src={null}
                alt={p.name}
                containerClassName="max-w-[160px] !rounded-lg !border !border-admin-border !bg-admin-surface-muted"
              />
            ) : (
              (data.images ?? []).map((im, i) => (
                <div key={`${im.url}-${i}`} className="space-y-1">
                  <ProductImage
                    src={im.url}
                    alt={`${p.name} — image ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    containerClassName="max-w-[180px] !rounded-lg !border !border-admin-border !bg-admin-surface-muted"
                  />
                  <p className="text-xs text-admin-secondary">
                    {im.isPrimary ? "Primary · " : ""}
                    provenance: <span className="font-mono text-admin-primary">{im.provenance ?? "—"}</span>
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
              <thead className={cn(adminTableHead, "border-b border-admin-border")}>
                <tr>
                  <th className={cn(adminTableHeadCell, "p-3")}>Active</th>
                  <th className={cn(adminTableHeadCell, "p-3")}>Size</th>
                  <th className={cn(adminTableHeadCell, "p-3")}>Material / color</th>
                  <th className={cn(adminTableHeadCell, "p-3")}>Variant SKU</th>
                  <th className={cn(adminTableHeadCell, "p-3")}>GTIN</th>
                  <th className={cn(adminTableHeadCell, "p-3")}>Signature</th>
                  <th className={cn(adminTableHeadCell, "p-3")}>Duplicate flags</th>
                </tr>
              </thead>
              <tbody className={adminTableBody}>
                {(data.variants ?? []).map((v) => (
                  <tr key={v.id} className={adminTableRowHover}>
                    <td className={cn(adminTableCell, "p-3")}>{v.isActive ? "Yes" : "No"}</td>
                    <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{v.sizeCode ?? "—"}</td>
                    <td className={cn(adminTableCell, "p-3 text-admin-secondary")}>
                      {metaStr(v.metadata, ["material", "primary_material", "glove_material", "color"]) ?? "—"}
                    </td>
                    <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{v.variantSku}</td>
                    <td className={cn(adminTableCell, "p-3 font-mono text-xs text-admin-muted")}>
                      {v.gtin?.trim() || "—"}
                    </td>
                    <td className={cn(adminTableCell, "max-w-[180px] truncate p-3 font-mono text-xs text-admin-muted")}>
                      {v.attributeSignature?.trim() || "—"}
                    </td>
                    <td className={cn(adminTableCell, "p-3 text-admin-warning")}>
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
        <div className={cn(adminCardSurface, "p-5")}>
          <ul className="list-inside list-disc space-y-1 text-sm text-admin-secondary">
            {(data.warnings ?? []).length === 0 ? (
              <li className="text-admin-muted">No data-quality warnings for this product.</li>
            ) : (
              (data.warnings ?? []).map((w) => (
                <li key={w.code} className="text-admin-warning">
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
        <div className={cn(adminCardSurface, "p-5")}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className={dt}>Preview</dt>
              <dd className="mt-0.5">
                {data.storefrontPdpPath ? (
                  <Link href={data.storefrontPdpPath} className={adminLink}>
                    Open storefront PDP
                  </Link>
                ) : (
                  <span className="text-admin-muted">—</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </PageSection>

      <PageSection title="Catalog sync tools" description="Read-only shortcuts. No ingestion or edits from this page.">
        <div className={cn(adminCardSurface, "p-5")}>
          <ul className="list-inside list-disc space-y-2 text-sm text-admin-secondary">
            {catalogosBase ? (
              <>
                {catalogosJobId ? (
                  <li>
                    <a
                      href={`${catalogosBase}/dashboard/url-import/${encodeURIComponent(catalogosJobId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={adminLink}
                    >
                      Open CatalogOS URL import job (canonical review)
                    </a>
                  </li>
                ) : null}
                <li>
                  <a
                    href={`${catalogosBase}/dashboard/url-import`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={adminLink}
                  >
                    Open catalog sync — URL import
                  </a>
                </li>
                <li>
                  <a href={catalogosBase} target="_blank" rel="noopener noreferrer" className={adminLink}>
                    Catalog sync home
                  </a>
                </li>
              </>
            ) : (
              <li className="text-admin-secondary">
                Configure catalog sync URL in environment settings for deep links.
              </li>
            )}
          </ul>
        </div>
      </PageSection>

      <p className="text-sm text-admin-secondary">
        <Link href="/admin/catalog" className={adminLink}>
          Catalog overview
        </Link>
        {" · "}
        <Link href="/admin/products" className={adminLink}>
          Back to grid
        </Link>
      </p>
    </div>
  );
}

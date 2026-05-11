import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/store/ProductImage";
import { ADMIN_PRODUCT_UUID_RE, fetchAdminProductDetail } from "@/lib/admin/product-operations";

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
      <div className="mx-auto max-w-3xl rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-4 text-sm text-amber-100">
        Supabase is not configured for this environment.
      </div>
    );
  }
  if (data.notFound || !data.product) {
    notFound();
  }

  const p = data.product;
  const catalogosBase = process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim().replace(/\/$/, "") ?? "";

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <nav className="text-[11px] text-white/45">
        <Link href="/admin/products" className="text-[#f06232]/90 hover:underline">
          Products
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-white/70">{p.name}</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-white">{p.name}</h1>
        <p className="font-mono text-[11px] text-white/45">{p.id}</p>
      </header>

      <section className="rounded-xl border border-white/10 bg-[#121212] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/45">Product identity</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[10px] text-white/40">Slug</dt>
            <dd className="font-mono text-white/85">{p.slug}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Brand</dt>
            <dd className="text-white/85">{p.brandName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Category</dt>
            <dd className="text-white/85">{p.categoryName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Status</dt>
            <dd>
              <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-xs uppercase text-white/80">
                {p.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Internal SKU</dt>
            <dd className="font-mono text-white/80">{p.internalSku ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Created</dt>
            <dd className="font-mono text-xs text-white/70">{p.createdAt ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Updated</dt>
            <dd className="font-mono text-xs text-white/70">{p.updatedAt ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#121212] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/45">Imagery</h2>
        <p className="mt-1 text-[11px] text-white/50">
          {(data.images ?? []).length} image(s). Provenance from <code className="text-white/60">metadata.image_provenance</code>.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
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
                <p className="text-[10px] text-white/45">
                  {im.isPrimary ? "Primary · " : ""}
                  provenance:{" "}
                  <span className="font-mono text-white/70">{im.provenance ?? "—"}</span>
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#121212] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/45">Variants</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[11px] text-white/75">
            <thead className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40">
              <tr>
                <th className="py-2 pr-2">Active</th>
                <th className="py-2 pr-2">Size</th>
                <th className="py-2 pr-2">Material / color</th>
                <th className="py-2 pr-2">Variant SKU</th>
                <th className="py-2 pr-2">GTIN</th>
                <th className="py-2 pr-2">Signature</th>
                <th className="py-2">Duplicate flags</th>
              </tr>
            </thead>
            <tbody>
              {(data.variants ?? []).map((v) => (
                <tr key={v.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="py-2 pr-2">{v.isActive ? "Yes" : "No"}</td>
                  <td className="py-2 pr-2 font-mono text-white/85">{v.sizeCode ?? "—"}</td>
                  <td className="py-2 pr-2 text-white/70">
                    {metaStr(v.metadata, ["material", "primary_material", "glove_material", "color"]) ?? "—"}
                  </td>
                  <td className="py-2 pr-2 font-mono text-white/80">{v.variantSku}</td>
                  <td className="py-2 pr-2 font-mono text-white/75">{v.gtin?.trim() || "—"}</td>
                  <td className="max-w-[180px] truncate py-2 pr-2 font-mono text-[10px] text-white/55">
                    {v.attributeSignature?.trim() || "—"}
                  </td>
                  <td className="py-2 text-amber-100/90">
                    {[v.gtinDuplicateRisk ? "GTIN" : null, v.signatureDuplicateRisk ? "Signature" : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#121212] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/45">Product quality</h2>
        <p className="mt-1 text-[11px] text-white/50">
          Attribute rows (catalogos): <span className="font-mono text-white/75">{data.attributeRowCount ?? 0}</span>
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-100/90">
          {(data.warnings ?? []).length === 0 ? (
            <li className="text-white/50">No governance warnings for this product.</li>
          ) : (
            (data.warnings ?? []).map((w) => (
              <li key={w.code}>{w.label}</li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#121212] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/45">Storefront readiness</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[10px] text-white/40">Storefront visible</dt>
            <dd className="text-white/85">{data.storefrontVisible ? "Yes (status active)" : "No"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Quote path</dt>
            <dd className="text-white/85">{data.quoteEnabled ? "Yes (active + active variants)" : "No"}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Pending match reviews</dt>
            <dd className="font-mono text-white/80">{data.pendingMatchReviewCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-[10px] text-white/40">Preview</dt>
            <dd>
              {data.storefrontPdpPath ? (
                <Link href={data.storefrontPdpPath} className="text-[#f06232]/90 hover:underline">
                  Open storefront PDP
                </Link>
              ) : (
                <span className="text-white/45">—</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#121212] p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/45">CatalogOS</h2>
        <p className="mt-1 text-sm text-white/55">Read-only links. No ingestion or mutations from this console.</p>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-sky-300/95">
          {catalogosBase ? (
            <>
              <li>
                <a href={`${catalogosBase}/dashboard/url-import`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Open CatalogOS (URL import)
                </a>
              </li>
              <li>
                <a href={catalogosBase} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  CatalogOS home
                </a>
              </li>
            </>
          ) : (
            <li className="text-white/45">
              Set <code className="text-white/60">NEXT_PUBLIC_CATALOGOS_URL</code> for deep links.
            </li>
          )}
        </ul>
      </section>

      <p className="text-[11px] text-white/40">
        <Link href="/admin/catalog" className="text-[#f06232]/80 hover:underline">
          Catalog health buckets
        </Link>
        {" · "}
        <Link href="/admin/products" className="text-[#f06232]/80 hover:underline">
          Back to grid
        </Link>
      </p>
    </div>
  );
}

import Link from "next/link";
import type { StoreProductDetail } from "@/lib/catalog/store-product-detail";
import { buildStoreProductRowForVariant } from "@/lib/catalog/store-product-detail";
import { AddToQuoteButton } from "@/components/quote/AddToQuoteButton";
import { StoreProductCard } from "@/components/store/StoreProductCard";
import { StorePageShell } from "@/components/store/StorePageShell";
import { PdpStickyMobileCta } from "@/components/store/pdp/PdpStickyMobileCta";
import { ProductImage } from "@/components/store/ProductImage";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function StorePdpContent({ detail }: { detail: StoreProductDetail }) {
  const quoteBase = detail.quoteProductRow;
  const primaryQuoteProduct =
    quoteBase && detail.defaultVariant
      ? buildStoreProductRowForVariant(quoteBase, detail.defaultVariant)
      : quoteBase;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24 font-poppins md:pb-10">
      <header className="border-b border-white/10">
        <StorePageShell>
          <div className="flex items-center justify-between gap-4 py-4">
            <Link href="/" className="text-xl font-semibold text-white">
              GloveCubs
            </Link>
            <nav className="flex flex-wrap items-center justify-end gap-3 text-sm">
              <Link href="/store" className="text-white/80 hover:text-white">
                Store
              </Link>
              <Link href="/quote-cart" className="text-white/80 hover:text-white">
                Quote cart
              </Link>
            </nav>
          </div>
        </StorePageShell>
      </header>

      <main className="py-6 sm:py-8">
        <StorePageShell>
          <nav className="mb-4 text-[11px] text-white/45">
            <Link href="/store" className="text-[#f06232]/90 hover:underline">
              Store
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-white/70">{detail.name}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
            <div className="min-w-0 space-y-6">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr] lg:grid-cols-[minmax(0,260px)_1fr]">
                <div className="space-y-2">
                  {detail.gallery.length > 0 ? (
                    detail.gallery.map((img, i) => (
                      <ProductImage
                        key={`${img.url}-${i}`}
                        src={img.url}
                        alt={detail.gallery.length > 1 ? `${detail.name} — product image ${i + 1}` : `${detail.name} — product image`}
                        loading={i === 0 ? "eager" : "lazy"}
                      />
                    ))
                  ) : (
                    <ProductImage src={null} alt={`${detail.name} — product image`} />
                  )}
                </div>

                <div className="min-w-0 space-y-3">
                  {detail.brandName ? (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#f06232]/90">{detail.brandName}</p>
                  ) : null}
                  <h1 className="text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">{detail.name}</h1>
                  <dl className="grid gap-1 text-[11px] text-white/55 sm:grid-cols-2">
                    {detail.internalSku ? (
                      <>
                        <dt className="text-white/40">Internal SKU</dt>
                        <dd className="font-mono text-white/80">{detail.internalSku}</dd>
                      </>
                    ) : null}
                    {detail.defaultVariant?.variant_sku ? (
                      <>
                        <dt className="text-white/40">Default variant SKU</dt>
                        <dd className="font-mono text-white/80">{detail.defaultVariant.variant_sku}</dd>
                      </>
                    ) : null}
                  </dl>

                  {detail.commercialRows.length > 0 ? (
                    <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2.5">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">Commercial summary</p>
                      <dl className="grid gap-1.5 sm:grid-cols-2">
                        {detail.commercialRows.map((row, cIdx) => (
                          <div key={`${row.label}::${row.value}::${cIdx}`} className="min-w-0 sm:col-span-2">
                            <dt className="text-[10px] text-white/40">{row.label}</dt>
                            <dd className="text-[12px] font-medium leading-snug text-white/85">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      {detail.bestPrice != null ? (
                        <p className="text-sm font-semibold tabular-nums text-sales">From {usd.format(detail.bestPrice)}</p>
                      ) : (
                        <p className="text-[12px] font-medium text-white/45">Request pricing</p>
                      )}
                    </div>
                    <div className="hidden min-w-[200px] flex-1 md:block md:max-w-xs">
                      {primaryQuoteProduct ? <AddToQuoteButton product={primaryQuoteProduct} /> : null}
                    </div>
                  </div>

                  <div className="hidden md:block">
                    <ButtonRequestPricingLink />
                  </div>
                </div>
              </div>

              {detail.variants.length > 0 ? (
                <section className="rounded-xl border border-white/10 bg-[#141414]">
                  <div className="border-b border-white/10 px-3 py-2">
                    <h2 className="text-[12px] font-bold uppercase tracking-wide text-white/80">Variants</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-[11px] text-white/75">
                      <thead className="border-b border-white/10 bg-black/30 text-[10px] uppercase tracking-wide text-white/45">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Size</th>
                          <th className="px-3 py-2 font-semibold">Variant SKU</th>
                          <th className="px-3 py-2 font-semibold">Quote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.variants.map((v) => (
                          <tr key={v.id} className="border-b border-white/[0.06] last:border-0">
                            <td className="px-3 py-2 font-mono text-white/90">{v.size_code ?? "—"}</td>
                            <td className="px-3 py-2 font-mono text-white/80">{v.variant_sku}</td>
                            <td className="px-3 py-2">
                              {quoteBase ? (
                                <div className="max-w-[140px]">
                                  <AddToQuoteButton product={buildStoreProductRowForVariant(quoteBase, v)} />
                                </div>
                              ) : (
                                <span className="text-white/35">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {detail.specRows.length > 0 ? (
                <section className="rounded-xl border border-white/10 bg-[#141414]">
                  <div className="border-b border-white/10 px-3 py-2">
                    <h2 className="text-[12px] font-bold uppercase tracking-wide text-white/80">Specifications</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] text-white/75">
                      <tbody>
                        {detail.specRows.map((row, idx) => (
                          <tr key={`${row.attribute_key}-${row.label}-${idx}`} className="border-b border-white/[0.06] last:border-0">
                            <th className="w-[40%] px-3 py-1.5 align-top font-medium text-white/50">{row.label}</th>
                            <td className="px-3 py-1.5 text-white/85">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {detail.certificationRows.length > 0 ? (
                <section className="rounded-xl border border-white/10 bg-[#141414]">
                  <div className="border-b border-white/10 px-3 py-2">
                    <h2 className="text-[12px] font-bold uppercase tracking-wide text-white/80">Certifications &amp; compliance</h2>
                  </div>
                  <ul className="list-none space-y-1.5 p-3 text-[11px] text-white/80">
                    {detail.certificationRows.map((row, i) => (
                      <li key={`${row.label}-${i}`}>
                        <span className="text-white/50">{row.label}:</span> {row.value}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {detail.downloads.length > 0 ? (
                <section className="rounded-xl border border-white/10 bg-[#141414]">
                  <div className="border-b border-white/10 px-3 py-2">
                    <h2 className="text-[12px] font-bold uppercase tracking-wide text-white/80">Downloads</h2>
                  </div>
                  <ul className="list-none space-y-2 p-3 text-[12px]">
                    {detail.downloads.map((d) => (
                      <li key={d.url}>
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[#f06232] hover:underline"
                        >
                          {d.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {detail.related.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-white/80">Related products</h2>
                  <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
                    {detail.related.map((p) => (
                      <li key={p.id} className="min-w-0">
                        <StoreProductCard product={p} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <aside className="hidden min-w-0 space-y-3 lg:block">
              <div className="sticky top-24 space-y-3 rounded-xl border border-white/10 bg-[#141414] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Procurement</p>
                {primaryQuoteProduct ? <AddToQuoteButton product={primaryQuoteProduct} /> : null}
                <ButtonRequestPricingLink className="w-full" />
              </div>
            </aside>
          </div>
        </StorePageShell>
      </main>

      <PdpStickyMobileCta product={primaryQuoteProduct} />
    </div>
  );
}

function ButtonRequestPricingLink({ className }: { className?: string }) {
  return (
    <Link
      href="/request-pricing"
      className={`inline-flex h-10 items-center justify-center rounded-md border border-[#f06232]/50 px-4 text-sm font-medium text-white transition-colors hover:bg-[#f06232]/10 ${className ?? ""}`}
    >
      Request pricing
    </Link>
  );
}

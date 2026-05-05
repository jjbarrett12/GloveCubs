import Link from "next/link";

const MAIN_SITE_URL = process.env.NEXT_PUBLIC_GLOVECUBS_API?.replace(/\/$/, "") ?? "";

const linkCol = "text-sm text-white/55 hover:text-white/90 transition-colors";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-black/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="inline-flex items-center gap-2">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-sm font-black text-white"
                aria-hidden
              >
                GC
              </span>
              <span className="text-lg font-bold text-white">
                Glove<span className="text-[hsl(var(--primary))]">Cubs</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-white/45">
              Disposable gloves and PPE by the case for operators and procurement teams.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Shop</h3>
            <ul className="mt-4 flex flex-col gap-2">
              <li>
                <Link href="/store" className={linkCol}>
                  Catalog
                </Link>
              </li>
              <li>
                <a href="#bulk-order" className={linkCol}>
                  Bulk orders
                </a>
              </li>
              <li>
                <Link href="/quote-cart" className={linkCol}>
                  Quote cart
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Solutions</h3>
            <ul className="mt-4 flex flex-col gap-2">
              <li>
                <a href="#industries" className={linkCol}>
                  Industries
                </a>
              </li>
              <li>
                <Link href="/invoice-savings" className={linkCol}>
                  Invoice savings
                </Link>
              </li>
              <li>
                <Link href="/request-pricing" className={linkCol}>
                  Request pricing
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Contact</h3>
            <ul className="mt-4 flex flex-col gap-2">
              <li>
                <Link href="/request-pricing" className={linkCol}>
                  Contact / inquiry
                </Link>
              </li>
              {MAIN_SITE_URL ? (
                <li>
                  <a href={MAIN_SITE_URL} className={linkCol} target="_blank" rel="noopener noreferrer">
                    Full GloveCubs site
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        <p className="mt-10 border-t border-white/10 pt-8 text-center text-sm text-white/40">
          Built for businesses that buy gloves by the case.
        </p>
      </div>
    </footer>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Wider layouts (e.g. industries grid). */
  mainClassName?: string;
};

export function PublicSubpageShell({ title, subtitle, children, mainClassName }: Props) {
  const mainCn =
    mainClassName ??
    "mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8";

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-poppins">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold text-white hover:text-white/90">
            GloveCubs
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link href="/store" className="text-white/70 hover:text-white">
              Store
            </Link>
            <Link href="/industries" className="text-white/70 hover:text-white">
              Industries
            </Link>
            <Link href="/request-pricing" className="text-white/70 hover:text-white">
              Request pricing
            </Link>
            <Link href="/glove-finder" className="text-white/70 hover:text-white">
              Glove Finder
            </Link>
            <Link href="/contact" className="text-white/70 hover:text-white">
              Contact
            </Link>
          </nav>
        </div>
      </header>
      <main className={mainCn}>
        <h1 className="mb-2 text-3xl font-bold text-white">{title}</h1>
        {subtitle ? <p className="mb-8 text-base text-white/65">{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}

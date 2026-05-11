import Link from "next/link";
import { UserRound, ShoppingCart } from "lucide-react";

export function HomeReorderAccountBand() {
  return (
    <section className="border-t border-white/10 bg-[#141414] px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="account-band-heading">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-xl border border-white/10 bg-[#101010] px-5 py-6 sm:flex-row sm:items-center sm:px-8 sm:py-7">
        <div>
          <h2 id="account-band-heading" className="text-lg font-bold text-white sm:text-xl">
            Buying again next month?
          </h2>
          <p className="mt-1 max-w-xl text-sm text-white/65">
            Use your business account for a stable entry point—quotes, cart, and (when enabled) your organization workspace stay
            under one sign-in.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          <Link
            href="/store"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-bold text-white hover:opacity-95"
          >
            <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
            Shop gloves
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:border-[#f06232]/50"
          >
            <UserRound className="h-4 w-4 shrink-0" aria-hidden />
            Sign in
          </Link>
          <Link href="/account" className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-[#f06232] hover:underline sm:px-2">
            Account home
          </Link>
        </div>
      </div>
    </section>
  );
}

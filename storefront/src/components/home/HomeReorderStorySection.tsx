import Link from "next/link";
import { ListChecks, RefreshCw, ShoppingCart, UserRound } from "lucide-react";
import { ProcurementCard, ProcurementSectionShell, SectionEyebrow } from "@/components/procurement";

/** Reorder account band + repeat-buy narrative in one procurement story block. */
export function HomeReorderStorySection() {
  return (
    <ProcurementSectionShell tone="base" headingId="reorder-story-heading">
      <SectionEyebrow icon={RefreshCw}>Repeat ordering</SectionEyebrow>
      <div className="mb-12 flex flex-col items-start justify-between gap-6 rounded-2xl border border-border-subtle bg-surface-card-alt px-5 py-6 sm:flex-row sm:items-center sm:px-8 sm:py-7">
        <div>
          <h2 id="reorder-story-heading" className="proc-h3 text-lg sm:text-xl">
            Buying again next month?
          </h2>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            Use your business account for quotes, the catalog, and (when enabled) your buyer workspace under one sign-in.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          <Link
            href="/store"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover"
          >
            <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
            Shop gloves
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-subtle px-5 py-2.5 text-sm font-semibold text-white hover:border-brand/50"
          >
            <UserRound className="h-4 w-4 shrink-0" aria-hidden />
            Sign in
          </Link>
          <Link href="/account" className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-brand-soft hover:underline sm:px-2">
            Account home
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h3 className="proc-h2 mb-4 text-xl sm:text-2xl">Keep the same story on repeat buys</h3>
          <p className="proc-body mb-6">
            Once you have approved lines, your quote request cart and bulk request tools carry the same SKUs forward—so monthly
            restocks do not start from a blank spreadsheet.
          </p>
          <ul className="space-y-3 text-sm leading-relaxed text-white/85">
            <li className="flex gap-2">
              <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span>Repeat buys from what you approved, with distributor-style case handling.</span>
            </li>
            <li className="flex gap-2">
              <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span>Net terms and fulfillment stay in the real world—phones and reps, not a black box.</span>
            </li>
          </ul>
        </div>
        <ProcurementCard>
          <h3 className="proc-h3 mb-4">Start from where you already buy</h3>
          <div className="flex flex-col gap-3">
            <Link
              href="/#bulk-order"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-brand/60 bg-brand/10 px-5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/15"
            >
              Build a bulk request
            </Link>
            <Link
              href="/request-pricing"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition hover:border-brand/50 hover:text-brand-soft"
            >
              Request pricing
            </Link>
            <Link
              href="/store"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-5 py-2.5 text-sm font-medium text-white/80 transition hover:text-brand-soft"
            >
              Browse gloves
            </Link>
          </div>
        </ProcurementCard>
      </div>
    </ProcurementSectionShell>
  );
}

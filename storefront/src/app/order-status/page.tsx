import Link from "next/link";
import { PublicSubpageShell } from "@/components/layout/PublicSubpageShell";

export const metadata = {
  title: "Order status | GloveCubs",
  description:
    "Legacy order links and order lookup—request procurement support or sign in to view linked quote and account activity.",
};

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (value == null) return null;
  const v = Array.isArray(value) ? value[0] : value;
  const t = v?.trim();
  return t ? t : null;
}

export default function OrderStatusPage({ searchParams }: PageProps) {
  const source = firstParam(searchParams.source);
  const fromLegacy = source === "legacy-order-link";

  return (
    <PublicSubpageShell
      title="Order lookup"
      subtitle={
        fromLegacy
          ? "We could not automatically load that order link. GloveCubs is quote-first today—use the paths below so our team can locate your order or start a replenishment request."
          : "Order self-service lookup is not available on this path yet. Use quote history, your account, or contact procurement for help with an existing order."
      }
      mainClassName="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <div className="space-y-6 text-sm text-white/75">
        <p>
          Submit a pricing or support inquiry with your company name, PO or invoice reference, and delivery site. We
          respond by email or phone—formal quote responses remain the contract path for commercial totals.
        </p>

        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-white">Procurement support</h2>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href="/request-pricing" className="font-semibold text-[#f06232] hover:underline">
                Request business pricing
              </Link>
              <span className="mt-0.5 block text-xs text-white/50">
                RFQ, net terms, and program setup—including order lookup context in your message.
              </span>
            </li>
            <li>
              <Link href="/quote-cart" className="font-semibold text-[#f06232] hover:underline">
                Quote request cart
              </Link>
              <span className="mt-0.5 block text-xs text-white/50">Build a line list for distributor review.</span>
            </li>
            <li>
              <Link href="/invoice-savings" className="font-semibold text-[#f06232] hover:underline">
                Upload invoice for review
              </Link>
              <span className="mt-0.5 block text-xs text-white/50">
                Match lines to catalog options and refresh replenishment context.
              </span>
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-white">Account</h2>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href="/login?next=%2Faccount" className="font-semibold text-[#f06232] hover:underline">
                Sign in
              </Link>
              <span className="mt-0.5 block text-xs text-white/50">
                Linked buyers can open quote history and order records when enabled.
              </span>
            </li>
            <li>
              <Link href="/account" className="font-semibold text-[#f06232] hover:underline">
                Account home
              </Link>
            </li>
            <li>
              <Link href="/account/quicklist" className="font-semibold text-[#f06232] hover:underline">
                Glove quicklist
              </Link>
              <span className="mt-0.5 block text-xs text-white/50">Company-assigned variants for repeat quote requests.</span>
            </li>
          </ul>
        </section>
      </div>
    </PublicSubpageShell>
  );
}

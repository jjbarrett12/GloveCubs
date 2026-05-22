import Link from "next/link";
import { PublicSubpageShell } from "@/components/layout/PublicSubpageShell";

const CARDS = [
  {
    title: "B2B store",
    body: "Browse active SKUs, thickness, and certifications. Add lines to your quote request cart.",
    href: "/store",
    cta: "Open store",
  },
  {
    title: "Science of Gloves",
    body: "Materials, mil, texture, certifications, and risk-based guidance—built for procurement buyers.",
    href: "/glove-science",
    cta: "Explore glove science",
  },
  {
    title: "AI Glove Finder",
    body: "Wizard-led recommender for task, risk, and material—built for buyers, not consumers.",
    href: "/glove-finder",
    cta: "Launch Glove Finder",
  },
  {
    title: "Invoice savings",
    body: "Upload an invoice; we extract lines and suggest catalog swaps with estimated savings.",
    href: "/invoice-savings",
    cta: "Upload invoice",
  },
  {
    title: "Industries",
    body: "Janitorial, food service, healthcare, and industrial landing pages with curated store links.",
    href: "/industries",
    cta: "View industries",
  },
  {
    title: "Request pricing / RFQ",
    body: "Case and pallet quotes, net terms questions, and specialist routing for serious volume.",
    href: "/request-pricing",
    cta: "Start RFQ",
  },
  {
    title: "FAQ",
    body: "Ordering, compliance tone, and how we handle B2B inquiries.",
    href: "/faq",
    cta: "Read FAQ",
  },
] as const;

export const metadata = {
  title: "Resources | GloveCubs",
  description: "Tools and guides for B2B glove buyers—store, AI finder, invoice analysis, and RFQ.",
};

export default function ResourcesPage() {
  return (
    <PublicSubpageShell
      title="Resources"
      subtitle="Everything we surface publicly for operators and procurement—no consumer fluff."
      mainClassName="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {CARDS.map((c) => (
          <div
            key={c.href}
            className="flex flex-col rounded-xl border border-white/10 bg-white/[0.04] p-6 transition hover:border-[#f06232]/40"
          >
            <h2 className="text-lg font-semibold text-white">{c.title}</h2>
            <p className="mt-2 flex-1 text-sm text-white/65">{c.body}</p>
            <Link
              href={c.href}
              className="mt-5 inline-flex w-fit rounded-lg bg-[#f06232] px-4 py-2 text-sm font-semibold text-white hover:bg-[#f06232]"
            >
              {c.cta}
            </Link>
          </div>
        ))}
      </div>
    </PublicSubpageShell>
  );
}

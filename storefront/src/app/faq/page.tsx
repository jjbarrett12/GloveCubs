import Link from "next/link";
import { PublicSubpageShell } from "@/components/layout/PublicSubpageShell";

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Do you sell to consumers?",
    a: "We are built for businesses buying by the case. You start with a quote request; our team confirms cases, SKUs, and pricing before anything ships.",
  },
  {
    q: "How do I get distributor or volume pricing?",
    a: "Use Request pricing / RFQ with your monthly case volume and application. We route high-volume inquiries to a rep for scoped pricing.",
  },
  {
    q: "What is the Guided Glove Finder?",
    a: "It is our in-house wizard at /glove-finder. It narrows SKUs from your task, materials, and risk profile—starting points for quote review, not compliance approval. Add selections to your quote request when ready.",
  },
  {
    q: "How does invoice upload work?",
    a: "On Invoice savings you upload a PDF or photo. We extract line items via our API, then (optionally) suggest catalog alternatives. Nothing replaces your own compliance review.",
  },
  {
    q: "Where is medical or food-safety guidance?",
    a: "Industry pages summarize typical specs; your facility policies govern final selection. Healthcare and food-service pages link to filtered store results—verify certifications on each SKU.",
  },
  {
    q: "How fast do you respond to RFQs?",
    a: "We aim to respond to every serious B2B inquiry. For time-sensitive stock-outs, note it in the form and call the number on the contact page.",
  },
];

export const metadata = {
  title: "FAQ | GloveCubs",
  description: "Common questions about B2B quote requests, the Guided Glove Finder, and invoice review.",
};

export default function FaqPage() {
  return (
    <PublicSubpageShell
      title="FAQ"
      subtitle="Short answers for public buyers. For account-specific terms, use Request pricing or contact us."
    >
      <ul className="space-y-6">
        {FAQ_ITEMS.map((item) => (
          <li key={item.q} className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4">
            <h2 className="text-base font-semibold text-white">{item.q}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{item.a}</p>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/request-pricing"
          className="inline-flex rounded-lg bg-[#f06232] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#f06232]"
        >
          Request pricing
        </Link>
        <Link
          href="/contact"
          className="inline-flex rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-white/90 hover:border-[#f06232]/50"
        >
          Contact
        </Link>
      </div>
    </PublicSubpageShell>
  );
}

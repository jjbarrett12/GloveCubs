import Link from "next/link";
import { Upload, ListChecks, BadgeCheck, FileQuestion, Headphones, Mail, Phone } from "lucide-react";
import { SITE_PHONE_TEL_HREF, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";
import {
  CTACluster,
  ProcurementCard,
  ProcurementSectionShell,
  SectionEyebrow,
} from "@/components/procurement";

const INVOICE_STEPS = [
  { n: "1", title: "Upload", body: "Send a PDF or clear photo of your glove invoice.", icon: Upload },
  { n: "2", title: "We review & match", body: "We extract line items and map them to real catalog options.", icon: ListChecks },
  { n: "3", title: "See alternates", body: "Where they apply, you’ll see governed alternates—not random substitutes.", icon: BadgeCheck },
  { n: "4", title: "Quote or reorder", body: "Request formal pricing or keep buying from what you approved.", icon: FileQuestion },
] as const;

type EmbeddedProps = {
  embedded?: boolean;
};

export function HomeHowInvoiceWorksSection({ embedded = false }: EmbeddedProps) {
  const inner = (
    <>
      <SectionEyebrow icon={Upload} tone="light" className={embedded ? "" : "justify-center"}>
        Invoice workflow
      </SectionEyebrow>
      <h2 id="how-invoice-heading" className={`mb-3 ${embedded ? "proc-h3-light" : "proc-h2-light text-center"}`}>
        Invoice upload (optional)
      </h2>
      <p className={`proc-body-light mb-10 max-w-2xl ${embedded ? "" : "mx-auto text-center"}`}>
        When you want us to map what you already buy—four straightforward steps. Prefer to shop cold? Use the catalog above.
      </p>
      <ol className="grid grid-cols-1 gap-proc-gap-card sm:grid-cols-2 lg:grid-cols-4">
        {INVOICE_STEPS.map(({ n, title, body, icon: Icon }) => (
          <ProcurementCard key={n} as="li" variant="light" className="list-none">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                {n}
              </span>
              <Icon className="h-6 w-6 text-brand" aria-hidden />
            </div>
            <h3 className="proc-h3-light mb-2">{title}</h3>
            <p className="m-0 text-sm leading-relaxed text-text-muted-light">{body}</p>
          </ProcurementCard>
        ))}
      </ol>
    </>
  );

  if (embedded) {
    return <div id="how-invoice-works" className="scroll-mt-28">{inner}</div>;
  }

  return (
    <ProcurementSectionShell id="how-invoice-works" tone="light" headingId="how-invoice-heading">
      {inner}
    </ProcurementSectionShell>
  );
}

export function HomeRecommendationExplainerSection({ embedded = false }: EmbeddedProps) {
  const inner = (
    <>
      <SectionEyebrow tone="light" className={embedded ? "" : "justify-center"}>
        Alternate governance
      </SectionEyebrow>
      <h2 id="explainer-heading" className={`proc-h2-light mb-4 ${embedded ? "text-xl sm:text-2xl" : ""}`}>
        When we suggest a swap, it is deliberate
      </h2>
      <div className="proc-body-light max-w-3xl space-y-4">
        <p>
          We only surface alternates that clear our review rules for your category—not every lookalike SKU on the market. Pack sizes
          and units are lined up so comparisons stay honest.
        </p>
        <p>
          If you do not see an option, it is because we have not cleared it for your use case yet. Fewer, vetted paths beat a wall of
          unreviewed substitutes.
        </p>
      </div>
      <div className="mt-8">
        <CTACluster align={embedded ? "start" : "center"} primary={{ href: "/invoice-savings", label: "Upload an invoice" }} />
      </div>
    </>
  );

  if (embedded) return inner;

  return (
    <ProcurementSectionShell tone="light-alt" headingId="explainer-heading" containerClassName="max-w-3xl lg:max-w-4xl">
      {inner}
    </ProcurementSectionShell>
  );
}

/** @deprecated Use HomeReorderStorySection on the homepage. */
export function HomeReorderSimplificationSection() {
  return null;
}

export function HomeHumanAdvisorSection({ embedded = false }: EmbeddedProps) {
  const inner = (
    <>
      <SectionEyebrow icon={Headphones} tone="light" className={embedded ? "" : "justify-center"}>
        Procurement support
      </SectionEyebrow>
      <ProcurementCard variant="light" className="px-6 py-8 text-center sm:px-10">
        <h2 id="advisor-heading" className="proc-h2-light mb-3 text-xl sm:text-2xl">
          Prefer to walk through it with someone?
        </h2>
        <p className="proc-body-light mb-8">
          Our team reads invoices and specs every day. If you are not sure what to upload or how to read the comparison, we will help
          you get to a clean quote without pressure.
        </p>
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap">
          <a
            href={SITE_PHONE_TEL_HREF}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            Call us
          </a>
          <a
            href={SITE_SALES_MAILTO_HREF}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-light px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand/50"
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            Email sales
          </a>
          <Link
            href="/contact"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-light px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand/50"
          >
            <Headphones className="h-4 w-4 shrink-0" aria-hidden />
            Contact
          </Link>
        </div>
      </ProcurementCard>
    </>
  );

  if (embedded) return inner;

  return (
    <ProcurementSectionShell tone="light" headingId="advisor-heading" containerClassName="max-w-3xl">
      {inner}
    </ProcurementSectionShell>
  );
}

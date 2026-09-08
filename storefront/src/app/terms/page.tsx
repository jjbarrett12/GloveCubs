import type { Metadata } from "next";
import Link from "next/link";
import { PublicSubpageShell } from "@/components/layout/PublicSubpageShell";
import { SITE_SALES_EMAIL, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";

export const metadata: Metadata = {
  title: "Terms of Use | GloveCubs",
  description:
    "Terms governing use of the GloveCubs B2B glove catalog, quote requests, invoice review, and related services.",
  robots: { index: true, follow: true },
};

export default function TermsOfUsePage() {
  return (
    <PublicSubpageShell title="Terms of Use" subtitle="Commercial terms for using the GloveCubs platform.">
      <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-white/80">
        <p className="text-xs text-white/45">
          Effective date: September 8, 2026. These terms govern use of the GloveCubs B2B catalog, quote requests, and
          related services. Questions:{" "}
          <a href={SITE_SALES_MAILTO_HREF} className="font-medium text-[#f06232] hover:underline">
            {SITE_SALES_EMAIL}
          </a>
          .
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">1. Agreement</h2>
          <p>
            By accessing www.glovecubs.com or submitting account, quote, pricing, or invoice information, you agree to
            these Terms and our{" "}
            <Link href="/privacy" className="font-medium text-[#f06232] hover:underline">
              Privacy Policy
            </Link>
            . If you use the site on behalf of a company, you represent that you are authorized to bind that company.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">2. Nature of the service</h2>
          <p>
            GloveCubs provides a B2B catalog, quote-request workflows, invoice review tools, and related procurement
            assistance. Published catalog prices and automated recommendations are informational unless and until we
            confirm commercial terms in a quote response, purchase order acceptance, or other written agreement.
            Self-serve checkout may not be available for all accounts.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">3. Accounts</h2>
          <p>
            You are responsible for safeguarding login credentials and for activity under your account. You must provide
            accurate company and contact information. We may suspend access for security, abuse, or unpaid obligations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">4. Quotes, RFQs, and invoice uploads</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Submitting a quote or pricing request does not create a binding purchase until accepted by GloveCubs.</li>
            <li>You represent that invoice files and data you upload are authorized for review by GloveCubs.</li>
            <li>AI-assisted extraction and recommendations may be incomplete or incorrect; verify before purchasing.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">5. Orders and payments</h2>
          <p>
            Where payment is accepted online, charges are processed by third-party payment processors (such as Stripe).
            Net-terms and credit are subject to approval and separate commercial terms. Taxes, shipping, and lead times
            are confirmed at quote or order acceptance.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">6. Acceptable use</h2>
          <p>
            You may not misuse the site, attempt unauthorized access, scrape beyond reasonable business use, interfere
            with security controls, or submit unlawful or infringing content.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">7. Intellectual property</h2>
          <p>
            Catalog content, software, trademarks, and site materials remain owned by GloveCubs or its licensors. You
            receive a limited license to use the site for legitimate procurement purposes.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">8. Disclaimers</h2>
          <p>
            THE SITE AND RELATED TOOLS ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE MAXIMUM EXTENT
            PERMITTED BY LAW, GLOVECUBS DISCLAIMS WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NON-INFRINGEMENT. Product suitability for regulated environments remains your responsibility.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">9. Limitation of liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, GLOVECUBS AND ITS SUPPLIERS ARE NOT LIABLE FOR INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST PROFITS, ARISING FROM USE OF THE SITE OR SERVICES.
            Aggregate liability for claims relating to the site is limited to the greater of (a) fees paid to GloveCubs
            for the specific order giving rise to the claim in the prior 12 months, or (b) one hundred U.S. dollars
            ($100), except where liability cannot be limited under applicable law. Counsel should tailor this cap to your
            commercial model.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">10. Indemnity</h2>
          <p>
            You agree to defend and indemnify GloveCubs against claims arising from your misuse of the site, your
            uploaded content, or your violation of these Terms, except to the extent caused by GloveCubs&apos; willful
            misconduct.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">11. Governing law</h2>
          <p>
            These Terms are governed by the laws of the State of Utah, excluding conflict-of-law rules, unless a signed
            customer agreement states otherwise. Venue for disputes not subject to another agreement is Salt Lake
            County, Utah. Counsel should confirm enforceability for your customer base.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">12. Contact</h2>
          <p>
            Questions:{" "}
            <a href={SITE_SALES_MAILTO_HREF} className="font-medium text-[#f06232] hover:underline">
              {SITE_SALES_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </PublicSubpageShell>
  );
}

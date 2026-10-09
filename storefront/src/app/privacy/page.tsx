import type { Metadata } from "next";
import Link from "next/link";
import { PublicSubpageShell } from "@/components/layout/PublicSubpageShell";
import { SITE_SALES_EMAIL, SITE_SALES_MAILTO_HREF } from "@/config/siteContact";

export const metadata: Metadata = {
  title: "Privacy Policy | GloveCubs",
  description:
    "How GloveCubs collects and uses business contact information, quote requests, invoice uploads, and related service data.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <PublicSubpageShell
      title="Privacy Policy"
      subtitle="How we handle business information when you use GloveCubs."
    >
      <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-white/80">
        <p className="text-xs text-white/45">
          Effective date: September 8, 2026. This notice describes how GloveCubs handles business information for B2B
          quote and procurement workflows. For privacy questions, contact{" "}
          <a href={SITE_SALES_MAILTO_HREF} className="font-medium text-[#f06232] hover:underline">
            {SITE_SALES_EMAIL}
          </a>
          .
        </p>

        <p>
          <strong className="text-white">Operator:</strong> GloveCubs (B2B disposable and work-glove supplier)
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">1. Scope</h2>
          <p>
            This policy describes how we collect, use, and share information when you visit www.glovecubs.com, create an
            account, request pricing, submit quote requests, upload invoices for review, or otherwise communicate with us.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">2. Information we collect</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-white">Account and contact data:</strong> name, work email, phone, company name, and
              related account metadata.
            </li>
            <li>
              <strong className="text-white">Quote and pricing requests:</strong> product interests, quantities, ship-to
              context, notes, and operational environment details you provide.
            </li>
            <li>
              <strong className="text-white">Invoice uploads:</strong> files you submit and extracted commercial fields
              (vendor, line items, totals) used for savings review and sourcing.
            </li>
            <li>
              <strong className="text-white">Technical and usage data:</strong> IP address, device/browser signals,
              security bot checks, rate-limit metadata, and application logs needed to operate and protect the service.
            </li>
            <li>
              <strong className="text-white">Communications:</strong> emails, support messages, and related correspondence.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">3. How we use information</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Respond to quote, pricing, and invoice-review requests</li>
            <li>Provision and secure customer accounts and company memberships</li>
            <li>Operate catalog, procurement, and admin workflows</li>
            <li>Detect abuse, bots, and fraud; maintain service reliability</li>
            <li>Send transactional or service-related communications</li>
            <li>Improve product quality using aggregate operational analytics where configured</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">4. Sharing and service providers</h2>
          <p>
            We share information with service providers that help us run GloveCubs, which may include hosting,
            authentication/database (e.g. Supabase), email delivery, AI processing for invoice/glove advisory features,
            security tooling, and—if you place a paid order through supported payment flows—payment processors such as
            Stripe. We do not sell personal information as a consumer data broker.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">5. Security</h2>
          <p>
            We use administrative, technical, and organizational measures appropriate to a B2B SaaS/e-commerce
            environment, including access controls and encrypted transport. No method of transmission or storage is
            completely secure.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">6. Retention</h2>
          <p>
            We retain account, quote, invoice, and operational records for as long as needed to fulfill the purposes
            above, meet legal/accounting requirements, and resolve disputes. Retention periods may vary by record type.
            Counsel should confirm jurisdiction-specific retention rules.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">7. Your choices</h2>
          <p>
            Business contacts may request access, correction, or deletion of certain information by contacting{" "}
            <a href={SITE_SALES_MAILTO_HREF} className="font-medium text-[#f06232] hover:underline">
              {SITE_SALES_EMAIL}
            </a>
            . Some records may be retained where required for security, fraud prevention, or legal obligations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">8. Children</h2>
          <p>GloveCubs is a business procurement service and is not directed to children under 16.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">9. Changes</h2>
          <p>
            We may update this policy. Material changes will be reflected by updating the effective date on this page.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">10. Contact</h2>
          <p>
            Privacy questions:{" "}
            <a href={SITE_SALES_MAILTO_HREF} className="font-medium text-[#f06232] hover:underline">
              {SITE_SALES_EMAIL}
            </a>
            . See also our{" "}
            <Link href="/terms" className="font-medium text-[#f06232] hover:underline">
              Terms of Use
            </Link>
            .
          </p>
        </section>
      </div>
    </PublicSubpageShell>
  );
}

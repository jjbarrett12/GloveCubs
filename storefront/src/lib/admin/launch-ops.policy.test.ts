import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("launch ops admin surfaces", () => {
  it("exposes prospects, quote detail, and invoice intakes under /admin", () => {
    const shell = read("app/admin/_components/AdminShell.tsx");
    expect(shell).toContain('href: "/admin/prospects"');
    expect(shell).toContain('href: "/admin/invoices"');
    expect(shell).toContain('href: "/admin/leads"');

    expect(read("app/admin/prospects/page.tsx")).toContain("sales_prospects");
    expect(read("app/admin/prospects/actions.ts")).toContain("updateProspectStatusAction");
    expect(read("app/admin/leads/[id]/page.tsx")).toContain("quote_line_items");
    expect(read("app/admin/leads/actions.ts")).toContain("updateQuoteStatusAction");
    expect(read("app/admin/invoices/page.tsx")).toContain("uploaded_invoices");
    expect(read("app/admin/invoices/actions.ts")).toContain("updateInvoiceOpsStatusAction");
  });

  it("scopes invoice idempotency and notifies staff on intake", () => {
    const intake = read("lib/invoice/run-intake.ts");
    expect(intake).toContain("buildInvoiceIdempotencyScope");
    expect(intake).toContain("idempotency_scope");
    expect(intake).toContain("sendSmtpMail");
    expect(intake).toContain("assertIntakeOwnedByScope");
  });

  it("quote cart surfaces email_notification_sent failures without failing the save", () => {
    const page = read("app/quote-cart/page.tsx");
    const route = read("app/api/quote-request/route.ts");
    expect(route).toContain("email_notification_sent");
    expect(route).toContain("warning:");
    expect(page).toContain("email_notification_sent");
    expect(page).toContain("emailWarning");
  });

  it("publishes privacy and terms with footer links", () => {
    expect(read("app/privacy/page.tsx")).toContain("Privacy Policy");
    expect(read("app/terms/page.tsx")).toContain("Terms of Use");
    const footer = read("config/footerLinks.ts");
    expect(footer).toContain('href: "/privacy"');
    expect(footer).toContain('href: "/terms"');
  });

  it("recovers incomplete self-signup on login routing and account", () => {
    expect(read("app/api/auth/post-login-destination/route.ts")).toContain("recoverSelfSignupIfNeeded");
    expect(read("app/login/LoginClient.tsx")).toContain("/signup/complete");
    expect(read("app/account/page.tsx")).toContain("recoverSelfSignupIfNeeded");
    expect(read("lib/auth/self-signup.ts")).toContain("self_signup_finalize_locks");
  });
});

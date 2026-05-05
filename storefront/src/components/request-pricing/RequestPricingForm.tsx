"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INDUSTRIES, type IndustryKey } from "@/config/industries";

const inputClass =
  "flex min-h-10 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:border-white/30 disabled:cursor-not-allowed disabled:opacity-50";

const INQUIRY_OPTIONS = [
  { value: "request_pricing", label: "Request pricing" },
  { value: "bulk_order", label: "Bulk order" },
  { value: "product_question", label: "Product question" },
  { value: "help_choosing", label: "Need help choosing gloves" },
  { value: "other", label: "Other" },
] as const;

const USAGE_OPTIONS = [
  { value: "under_1_case", label: "Under 1 case" },
  { value: "cases_1_5", label: "1–5 cases" },
  { value: "cases_6_20", label: "6–20 cases" },
  { value: "cases_21_plus", label: "21+ cases" },
  { value: "not_sure", label: "Not sure" },
] as const;

type FieldErrors = Partial<Record<string, string[]>>;

/** Zod flatten uses API/schema keys (snake_case). Map to form Field `error` prop keys. */
function mapApiValidationToFieldErrors(details: {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
}): { fieldErrors: FieldErrors; extraMessages: string[] } {
  const fe = details.fieldErrors ?? {};
  const out: FieldErrors = {};
  if (fe.company_name?.length) out.companyName = fe.company_name;
  if (fe.contact_name?.length) {
    out.firstName = fe.contact_name;
    out.lastName = fe.contact_name;
  }
  if (fe.email?.length) out.email = fe.email;
  if (fe.phone?.length) out.phone = fe.phone;
  if (fe.notes?.length) out.message = fe.notes;
  if (fe.source?.length) out.inquiryType = fe.source;
  const extraMessages = [...(details.formErrors ?? [])];
  return { fieldErrors: out, extraMessages };
}

function RequestPricingFormInner() {
  const searchParams = useSearchParams();
  const submitLockRef = React.useRef(false);
  const hydratedFromBuilderRef = React.useRef(false);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [inquiryType, setInquiryType] = React.useState<(typeof INQUIRY_OPTIONS)[number]["value"] | "">("");
  const [estimatedMonthlyUsage, setEstimatedMonthlyUsage] = React.useState<
    (typeof USAGE_OPTIONS)[number]["value"] | ""
  >("");
  const [message, setMessage] = React.useState("");
  const [productSkuInterest, setProductSkuInterest] = React.useState("");
  const [website, setWebsite] = React.useState("");

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    if (hydratedFromBuilderRef.current) return;

    const industry = searchParams.get("industry");
    const type = searchParams.get("type");
    const material = searchParams.get("material");
    const size = searchParams.get("size");
    const volume = searchParams.get("volume");
    const source = searchParams.get("source");

    const hasBuilderParams =
      source === "homepage_bulk_builder" ||
      industry != null ||
      type != null ||
      material != null ||
      size != null ||
      volume != null;

    if (!hasBuilderParams) return;

    const industryLabel =
      industry && industry in INDUSTRIES ? INDUSTRIES[industry as IndustryKey].name : industry ?? "—";

    const block = `Bulk Order Request:
Industry: ${industryLabel}
Type: ${type ?? "—"}
Material: ${material ?? "—"}
Size: ${size ?? "—"}
Monthly Volume: ${volume ?? "—"}`;

    setMessage((prev) => (prev.trim() ? `${prev.trim()}\n\n${block}` : block));
    setInquiryType("bulk_order");

    const vol = searchParams.get("volume");
    if (vol && USAGE_OPTIONS.some((o) => o.value === vol)) {
      setEstimatedMonthlyUsage(vol as (typeof USAGE_OPTIONS)[number]["value"]);
    }

    hydratedFromBuilderRef.current = true;
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setError(null);
    setFieldErrors({});
    setSuccess(false);
    setSubmitting(true);

    const usageLabel = estimatedMonthlyUsage
      ? USAGE_OPTIONS.find((o) => o.value === estimatedMonthlyUsage)?.label
      : undefined;

    const notesParts = [
      message.trim(),
      usageLabel ? `Estimated monthly glove usage (form): ${usageLabel}` : undefined,
      productSkuInterest.trim() ? `Product / SKU interest: ${productSkuInterest.trim()}` : undefined,
    ].filter(Boolean) as string[];

    const notes = notesParts.join("\n\n");

    try {
      const res = await fetch("/api/leads/request-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          contact_name: `${firstName} ${lastName}`.trim(),
          email,
          phone,
          notes,
          source: inquiryType || "website",
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
        success?: boolean;
        ok?: boolean;
        ignored?: boolean;
      };

      if (!res.ok) {
        if (data.details) {
          const { fieldErrors: mapped, extraMessages } = mapApiValidationToFieldErrors(data.details);
          setFieldErrors(mapped);
          const parts = [data.error, ...extraMessages].filter(Boolean) as string[];
          setError(parts.length ? parts.join(" ") : "Submission failed");
        } else {
          setError(data.error || "Submission failed");
        }
        return;
      }

      if (data.ignored === true && data.ok === true) {
        setSuccess(true);
        return;
      }

      if (data.success === true) {
        setSuccess(true);
        return;
      }

      setError("Unexpected response from server");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Card className="rounded-2xl border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Inquiry sent</CardTitle>
          <CardDescription className="text-white/70">
            Thank you. We received your message and will follow up using your contact details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative space-y-8" noValidate>
      <Card className="rounded-2xl border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Your details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="First name" htmlFor="firstName" error={fieldErrors.firstName} required>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={fieldErrors.lastName} required>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </Field>
          </div>
          <Field label="Company name" htmlFor="companyName" error={fieldErrors.companyName} required>
            <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </Field>
          <Field label="Email" htmlFor="email" error={fieldErrors.email} required>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Phone" htmlFor="phone" error={fieldErrors.phone} required>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Inquiry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Inquiry type" htmlFor="inquiryType" error={fieldErrors.inquiryType} required>
            <select
              id="inquiryType"
              className={inputClass}
              value={inquiryType}
              onChange={(e) => setInquiryType(e.target.value as (typeof INQUIRY_OPTIONS)[number]["value"] | "")}
              required
            >
              <option value="" disabled className="bg-neutral-900">
                Select type
              </option>
              {INQUIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-neutral-900">
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Estimated monthly glove usage"
            htmlFor="estimatedMonthlyUsage"
            error={fieldErrors.estimatedMonthlyUsage}
            required
          >
            <select
              id="estimatedMonthlyUsage"
              className={inputClass}
              value={estimatedMonthlyUsage}
              onChange={(e) =>
                setEstimatedMonthlyUsage(e.target.value as (typeof USAGE_OPTIONS)[number]["value"] | "")
              }
              required
            >
              <option value="" disabled className="bg-neutral-900">
                Select range
              </option>
              {USAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-neutral-900">
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Message" htmlFor="message" error={fieldErrors.message} required>
            <textarea
              id="message"
              rows={5}
              className={inputClass}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </Field>
          <Field label="Product / SKU interest (optional)" htmlFor="productSkuInterest" error={fieldErrors.productSkuInterest}>
            <Input id="productSkuInterest" value={productSkuInterest} onChange={(e) => setProductSkuInterest(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* Honeypot: hidden from sighted users; bots often fill visible-offscreen fields */}
      <div className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Company website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={submitting} className="bg-[hsl(var(--primary))] text-white hover:opacity-90 w-full sm:w-auto">
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          "Send inquiry"
        )}
      </Button>
    </form>
  );
}

export function RequestPricingForm() {
  return (
    <React.Suspense
      fallback={
        <Card className="rounded-2xl border-white/10 bg-white/5 p-8">
          <p className="text-white/60 text-sm">Loading form…</p>
        </Card>
      }
    >
      <RequestPricingFormInner />
    </React.Suspense>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string[] | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-white/90">
        {label}
        {required ? <span className="text-red-300"> *</span> : null}
      </label>
      {children}
      {error?.length ? (
        <p className="text-xs text-red-300" role="alert">
          {error.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

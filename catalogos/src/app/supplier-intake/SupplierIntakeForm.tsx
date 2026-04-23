"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createOnboardingRequestAction } from "@/app/actions/onboarding";

const FEED_TYPES = [
  { value: "url", label: "Product URL" },
  { value: "csv", label: "CSV feed" },
  { value: "api", label: "API" },
  { value: "pdf", label: "PDF catalog" },
  { value: "google_sheet", label: "Google Sheet" },
] as const;

const CATEGORY_OPTIONS = [
  "disposable_gloves",
  "reusable_work_gloves",
  "safety_glasses",
  "face_masks",
  "hand_hygiene",
  "other",
];

export function SupplierIntakeForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [feedType, setFeedType] = useState<string>("");
  const [feedUrl, setFeedUrl] = useState("");
  const [notes, setNotes] = useState("");

  const toggleCategory = (c: string) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const result = await createOnboardingRequestAction({
      company_name: companyName.trim(),
      website: website.trim() || undefined,
      contact_name: contactName.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      phone: phone.trim() || undefined,
      categories_supplied: categories,
      feed_type: feedType || undefined,
      feed_url: feedUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      submitted_via: "supplier_portal",
    });
    setBusy(false);
    if (result.success && result.id && result.accessToken) {
      router.push(`/supplier-intake/status/${result.accessToken}`);
      router.refresh();
    } else if (result.success && result.id) {
      setError("Created but missing link. Please save this ID and contact support: " + result.id);
    } else {
      setError(result.error ?? "Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="text-sm font-medium mb-1 block">Company name *</label>
        <Input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Acme Gloves Inc."
          required
          className="max-w-md"
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Website</label>
        <Input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://..."
          type="url"
          className="max-w-md"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
        <div>
          <label className="text-sm font-medium mb-1 block">Contact name</label>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Contact email</label>
          <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" placeholder="jane@acme.com" />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Phone</label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+1..." className="max-w-md" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Categories you supply</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {CATEGORY_OPTIONS.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={categories.includes(c)}
                onChange={() => toggleCategory(c)}
                className="rounded border-input"
              />
              <span className="capitalize">{c.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Feed type</label>
        <select
          value={feedType}
          onChange={(e) => setFeedType(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm max-w-md w-full"
        >
          <option value="">— Select —</option>
          {FEED_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Feed URL</label>
        <Input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="https://... (CSV, sheet, or product list URL)"
          type="url"
          className="max-w-md"
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else we should know"
          className="min-h-[80px] w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
          rows={3}
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={busy || !companyName.trim()}>
        {busy ? "Submitting…" : "Submit"}
      </Button>
    </form>
  );
}

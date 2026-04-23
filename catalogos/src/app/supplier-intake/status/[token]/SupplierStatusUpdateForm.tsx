"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  updateOnboardingByTokenAction,
  uploadOnboardingFileAction,
} from "@/app/actions/onboarding";
import type { SupplierOnboardingFileRow } from "@/lib/onboarding/types";

const FEED_TYPES = [
  { value: "url", label: "Product URL" },
  { value: "csv", label: "CSV feed" },
  { value: "api", label: "API" },
  { value: "pdf", label: "PDF catalog" },
  { value: "google_sheet", label: "Google Sheet" },
] as const;

const FILE_KINDS = [
  { value: "catalog_pdf", label: "Catalog (PDF)" },
  { value: "catalog_csv", label: "Catalog (CSV)" },
  { value: "price_list", label: "Price list" },
  { value: "other", label: "Other" },
] as const;

interface Props {
  token: string;
  requestId: string;
  files: SupplierOnboardingFileRow[];
}

export function SupplierStatusUpdateForm({ token, requestId, files: initialFiles }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [feedType, setFeedType] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmitInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    const result = await updateOnboardingByTokenAction(token, {
      company_name: companyName.trim() || undefined,
      website: website.trim() || undefined,
      contact_name: contactName.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      phone: phone.trim() || undefined,
      feed_type: feedType || undefined,
      feed_url: feedUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (result.success) {
      setMessage({ type: "success", text: "Updates saved." });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.error ?? "Failed to save" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setUploadBusy(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("fileKind", (document.querySelector("[name=fileKind]") as HTMLSelectElement)?.value || "other");
    const result = await uploadOnboardingFileAction(token, formData, { byToken: true });
    setUploadBusy(false);
    if (result.success) {
      setMessage({ type: "success", text: "File uploaded." });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.error ?? "Upload failed" });
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Update your information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitInfo} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Company name</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Gloves Inc."
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
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="max-w-md" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Feed type</label>
              <select
                value={feedType}
                onChange={(e) => setFeedType(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm max-w-md w-full"
              >
                <option value="">—</option>
                {FEED_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Feed URL</label>
              <Input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://..." type="url" className="max-w-md" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px] w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save updates"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Upload a file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <select name="fileKind" className="h-9 rounded-md border border-input bg-background px-3 text-sm max-w-xs w-full">
            {FILE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input type="file" onChange={handleFileUpload} disabled={uploadBusy} accept=".pdf,.csv,.xlsx,.xls,.txt,.json" className="text-sm" />
          {initialFiles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {initialFiles.length} file(s) already uploaded. You can add more.
            </p>
          )}
        </CardContent>
      </Card>

      {message && (
        <p className={message.type === "success" ? "text-green-600 text-sm" : "text-destructive text-sm"}>
          {message.text}
        </p>
      )}
    </div>
  );
}

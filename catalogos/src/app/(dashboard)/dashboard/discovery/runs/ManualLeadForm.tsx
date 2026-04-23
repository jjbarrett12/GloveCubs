"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runDiscoveryAction } from "@/app/actions/discovery";

interface ManualLeadFormProps {
  adapters: { name: string }[];
}

export function ManualLeadForm({ adapters }: ManualLeadFormProps) {
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setBusy(true);
    setMessage(null);
    const result = await runDiscoveryAction("manual", {
      company_name: companyName.trim(),
      website: website.trim() || undefined,
      contact_name: contactName.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setBusy(false);
    if (result.success) {
      setMessage({ type: "success", text: `Lead added. ${result.leadsCreated ?? 1} created.` });
      setCompanyName("");
      setWebsite("");
      setContactName("");
      setContactEmail("");
      setPhone("");
    } else {
      setMessage({ type: "error", text: result.error ?? "Failed" });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        placeholder="Company name *"
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        required
        className="max-w-md"
      />
      <Input
        placeholder="Website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        type="url"
        className="max-w-md"
      />
      <Input
        placeholder="Contact name"
        value={contactName}
        onChange={(e) => setContactName(e.target.value)}
        className="max-w-md"
      />
      <Input
        placeholder="Contact email"
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        type="email"
        className="max-w-md"
      />
      <Input
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        type="tel"
        className="max-w-md"
      />
      <Button type="submit" disabled={busy || !companyName.trim()}>
        {busy ? "Adding…" : "Add lead"}
      </Button>
      {message && (
        <p className={message.type === "success" ? "text-green-600 text-sm" : "text-destructive text-sm"}>{message.text}</p>
      )}
    </form>
  );
}

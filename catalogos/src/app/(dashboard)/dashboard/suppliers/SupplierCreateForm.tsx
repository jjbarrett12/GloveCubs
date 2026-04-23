"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplier } from "@/app/actions/suppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function SupplierCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const result = await createSupplier(formData);
    setPending(false);
    if (result.success) {
      setName("");
      setSlug("");
      router.refresh();
    } else {
      setError(result.error ?? "Failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Name</label>
        <Input
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slug) setSlug(slugFromName(e.target.value));
          }}
          placeholder="Acme Gloves Inc."
          required
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Slug</label>
        <Input
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="acme-gloves"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create supplier"}
      </Button>
    </form>
  );
}

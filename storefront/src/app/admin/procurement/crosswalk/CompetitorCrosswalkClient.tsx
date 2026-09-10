"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { adminFormInput, adminPrimaryButton } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export function CompetitorCrosswalkClient() {
  const router = useRouter();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [hits, setHits] = React.useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [picked, setPicked] = React.useState("");

  async function createCompetitor(form: FormData) {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/admin/api/procurement/competitor-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer: String(form.get("manufacturer") ?? "").trim() || null,
          sku: String(form.get("sku") ?? "").trim() || null,
          upc_gtin: String(form.get("upc_gtin") ?? "").trim() || null,
          product_name: String(form.get("product_name") ?? "").trim() || null,
          material: String(form.get("material") ?? "").trim() || null,
          grade: String(form.get("grade") ?? "").trim() || null,
          thickness_mil: form.get("thickness_mil") ? Number(form.get("thickness_mil")) : null,
          invoice_description: String(form.get("invoice_description") ?? "").trim() || null,
          gloves_per_box: form.get("gloves_per_box") ? Number(form.get("gloves_per_box")) : null,
          boxes_per_case: form.get("boxes_per_case") ? Number(form.get("boxes_per_case")) : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "create failed");
      setMsg(`Competitor saved: ${(json as { competitor_product_id: string }).competitor_product_id}`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    }
    setPending(false);
  }

  async function addAlias(form: FormData) {
    setPending(true);
    setMsg(null);
    try {
      const id = String(form.get("competitor_product_id") ?? "").trim();
      const res = await fetch(`/admin/api/procurement/competitor-products/${id}/aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias_type: String(form.get("alias_type") ?? "sku"),
          raw_value: String(form.get("raw_value") ?? ""),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "alias failed");
      setMsg("Alias saved. Future invoices with this key resolve without AI.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Alias failed");
    }
    setPending(false);
  }

  async function propose(form: FormData) {
    setPending(true);
    setMsg(null);
    try {
      const res = await fetch("/admin/api/procurement/competitor-equivalencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitor_product_id: String(form.get("competitor_product_id") ?? ""),
          catalog_product_id: picked || String(form.get("catalog_product_id") ?? ""),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "equivalency failed");
      setMsg(`Candidate equivalency ${(json as { equivalency: { id: string } }).equivalency.id} (not approved).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Propose failed");
    }
    setPending(false);
  }

  async function setStatus(form: FormData, status: "approved" | "rejected") {
    setPending(true);
    setMsg(null);
    try {
      const id = String(form.get("equivalency_id") ?? "").trim();
      const res = await fetch(`/admin/api/procurement/competitor-equivalencies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "update failed");
      setMsg(`Equivalency ${status}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    }
    setPending(false);
  }

  async function searchGc() {
    const q = (document.getElementById("gc-search") as HTMLInputElement | null)?.value ?? "";
    if (q.trim().length < 2) return;
    const res = await fetch(`/admin/api/procurement/glove-products?q=${encodeURIComponent(q)}`);
    const json = await res.json().catch(() => ({}));
    setHits((json as { products?: Array<{ id: string; name: string; slug: string }> }).products ?? []);
  }

  return (
    <div className="space-y-8">
      {msg ? <p className="text-sm text-admin-secondary">{msg}</p> : null}

      <form
        className="grid gap-2 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void createCompetitor(new FormData(e.currentTarget));
        }}
      >
        <h3 className="sm:col-span-3 text-sm font-semibold">1. Create competitor product</h3>
        <input name="manufacturer" placeholder="Manufacturer" className={adminFormInput} />
        <input name="sku" placeholder="SKU" className={adminFormInput} />
        <input name="upc_gtin" placeholder="UPC" className={adminFormInput} />
        <input name="product_name" placeholder="Product name" className={adminFormInput} />
        <input name="material" placeholder="Material" className={adminFormInput} />
        <input name="grade" placeholder="Grade" className={adminFormInput} />
        <input name="thickness_mil" placeholder="Thickness mil" className={adminFormInput} />
        <input name="invoice_description" placeholder="Invoice description alias" className={adminFormInput} />
        <input name="gloves_per_box" placeholder="Gloves/box" className={adminFormInput} />
        <input name="boxes_per_case" placeholder="Boxes/case" className={adminFormInput} />
        <button type="submit" disabled={pending} className={adminPrimaryButton}>
          Save competitor
        </button>
      </form>

      <form
        className="grid gap-2 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void addAlias(new FormData(e.currentTarget));
        }}
      >
        <h3 className="sm:col-span-3 text-sm font-semibold">2. Add alias</h3>
        <input name="competitor_product_id" placeholder="Competitor product UUID" className={adminFormInput} />
        <select name="alias_type" className={adminFormInput}>
          <option value="sku">sku</option>
          <option value="manufacturer_sku">manufacturer_sku</option>
          <option value="upc">upc</option>
          <option value="invoice_description">invoice_description</option>
        </select>
        <input name="raw_value" placeholder="Alias value" className={adminFormInput} />
        <button type="submit" disabled={pending} className={adminPrimaryButton}>
          Save alias
        </button>
      </form>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void propose(new FormData(e.currentTarget));
        }}
      >
        <h3 className="text-sm font-semibold">3. Propose GloveCubs equivalent (candidate only)</h3>
        <input name="competitor_product_id" placeholder="Competitor product UUID" className={adminFormInput} />
        <div className="flex flex-wrap gap-2">
          <input id="gc-search" placeholder="Search GloveCubs" className={cn(adminFormInput, "max-w-md")} />
          <button type="button" className={adminPrimaryButton} onClick={() => void searchGc()}>
            Search
          </button>
        </div>
        {hits.length > 0 ? (
          <ul className="text-sm">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className={adminPrimaryButton} onClick={() => setPicked(h.id)}>
                  Use {h.name}
                </button>{" "}
                <span className="text-admin-muted">{h.slug}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <input name="catalog_product_id" value={picked} onChange={(e) => setPicked(e.target.value)} className={adminFormInput} />
        <button type="submit" disabled={pending} className={adminPrimaryButton}>
          Propose candidate
        </button>
      </form>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <h3 className="w-full text-sm font-semibold">4. Approve or reject equivalency</h3>
        <input name="equivalency_id" placeholder="Equivalency UUID" className={adminFormInput} />
        <button type="button" className={adminPrimaryButton} disabled={pending} onClick={(e) => void setStatus(new FormData((e.currentTarget as HTMLButtonElement).form!), "approved")}>
          Approve
        </button>
        <button type="button" className={adminPrimaryButton} disabled={pending} onClick={(e) => void setStatus(new FormData((e.currentTarget as HTMLButtonElement).form!), "rejected")}>
          Reject
        </button>
      </form>
    </div>
  );
}

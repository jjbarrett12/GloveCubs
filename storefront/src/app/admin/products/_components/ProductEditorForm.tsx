"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminCategoryOption } from "@/lib/admin/product-form-options";
import { adminCreateProductAction, adminUpdateProductAction } from "@/app/admin/products/_components/product-editor-actions";
import {
  adminAlertSurface,
  adminCardSurface,
  adminEyebrow,
  adminFormInput,
  adminFormLabel,
  adminLink,
  adminMutedPanel,
  adminPrimaryButton,
  adminSecondaryButton,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

export type ProductEditorInitial = {
  productId?: string;
  name: string;
  brandName: string;
  categoryId: string;
  material: string;
  color: string;
  milThickness: string;
  casePack: string;
  description: string;
  primaryImageUrl: string;
  status: "draft" | "active";
  quoteOnly: boolean;
  variants: Array<{ sizeCode: string; variantSku: string; listPrice: string }>;
};

function defaultVariants(): ProductEditorInitial["variants"] {
  return [{ sizeCode: "M", variantSku: "", listPrice: "" }];
}

const field = cn(adminFormInput, "mt-2 w-full rounded-lg shadow-inner");
const cellInput = cn(adminFormInput, "rounded-lg shadow-inner");

export function ProductEditorForm({
  categories,
  initial,
  mode,
}: {
  categories: AdminCategoryOption[];
  initial?: ProductEditorInitial;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(initial?.name ?? "");
  const [brandName, setBrandName] = React.useState(initial?.brandName ?? "");
  const [categoryId, setCategoryId] = React.useState(initial?.categoryId ?? "");
  const [material, setMaterial] = React.useState(initial?.material ?? "");
  const [color, setColor] = React.useState(initial?.color ?? "");
  const [milThickness, setMilThickness] = React.useState(initial?.milThickness ?? "");
  const [casePack, setCasePack] = React.useState(initial?.casePack ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [primaryImageUrl, setPrimaryImageUrl] = React.useState(initial?.primaryImageUrl ?? "");
  const [status, setStatus] = React.useState<"draft" | "active">(initial?.status ?? "draft");
  const [quoteOnly, setQuoteOnly] = React.useState(initial?.quoteOnly ?? false);
  const [variants, setVariants] = React.useState<ProductEditorInitial["variants"]>(
    initial?.variants?.length ? initial.variants : defaultVariants(),
  );

  function addVariantRow() {
    setVariants((v) => [...v, { sizeCode: "", variantSku: "", listPrice: "" }]);
  }

  function removeVariantRow(i: number) {
    setVariants((v) => v.filter((_, idx) => idx !== i));
  }

  function patchVariant(i: number, patch: Partial<(typeof variants)[0]>) {
    setVariants((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function buildPayload(statusOverride?: "draft" | "active"): Record<string, unknown> {
    const attrs: Record<string, string> = {};
    if (material.trim()) attrs.material = material.trim();
    if (color.trim()) attrs.color = color.trim();
    if (milThickness.trim()) attrs.thickness_mil = milThickness.trim();
    return {
      name,
      brand_name: brandName,
      category_id: categoryId,
      description,
      primary_image_url: primaryImageUrl,
      status: statusOverride ?? status,
      quote_only: quoteOnly,
      attributes: attrs,
      variants: variants.map((r) => ({
        size_code: r.sizeCode,
        variant_sku: r.variantSku,
        list_price: r.listPrice,
      })),
    };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (status === "active") {
      if (!categoryId.trim()) {
        setError("Category is required to publish (store guard).");
        return;
      }
      if (!primaryImageUrl.trim()) {
        setError("Primary image URL is required to publish (store guard).");
        return;
      }
      if (!variants.some((v) => v.variantSku.trim() || v.sizeCode.trim())) {
        setError("At least one variant with size or SKU is required to publish.");
        return;
      }
    }
    const fd = new FormData();
    fd.set("payload", JSON.stringify(buildPayload()));
    if (mode === "edit" && initial?.productId) {
      fd.set("product_id", initial.productId);
    }
    startTransition(async () => {
      const res =
        mode === "create" ? await adminCreateProductAction(fd) : await adminUpdateProductAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (mode === "create" && "id" in res) {
        router.push(`/admin/products/${res.id}/edit`);
        router.refresh();
        return;
      }
      router.push(`/admin/products/${initial?.productId}`);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(adminCardSurface, "relative max-w-3xl space-y-6 p-6 pb-28 sm:pb-24")}
    >
      {mode === "create" ? (
        <div className={adminAlertSurface("info", "text-sm")}>
          <strong className="text-admin-accent">Draft first, publish later.</strong> New rows default to draft. Switch to{" "}
          <span className="font-semibold text-admin-primary">Published</span> only after category, primary image, and variants satisfy database
          guards.
        </div>
      ) : null}

      <div className={cn(adminMutedPanel, "border-solid p-5")}>
        <p className={cn(adminEyebrow, "mb-4")}>Identity &amp; taxonomy</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={adminFormLabel}>Product name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={adminFormLabel}>Brand (matches catalog brand)</span>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. SHOWA"
              className={field}
            />
          </label>
          <label className="block">
            <span className={adminFormLabel}>Category</span>
            <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={adminFormLabel}>Material</span>
            <input value={material} onChange={(e) => setMaterial(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={adminFormLabel}>Color</span>
            <input value={color} onChange={(e) => setColor(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={adminFormLabel}>Mil thickness</span>
            <input value={milThickness} onChange={(e) => setMilThickness(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={adminFormLabel}>Case pack</span>
            <input value={casePack} onChange={(e) => setCasePack(e.target.value)} className={field} />
          </label>
          <label className="block sm:col-span-2">
            <span className={adminFormLabel}>Primary image URL</span>
            <input
              value={primaryImageUrl}
              onChange={(e) => setPrimaryImageUrl(e.target.value)}
              className={cn(field, "font-mono text-xs")}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={adminFormLabel}>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={field} />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className={adminFormLabel}>Status</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-admin-secondary">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="pub"
                  checked={status === "draft"}
                  onChange={() => setStatus("draft")}
                  className="border-admin-border text-admin-accent focus:ring-admin-accent/30"
                />
                Draft (not on public store)
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="pub"
                  checked={status === "active"}
                  onChange={() => setStatus("active")}
                  className="border-admin-border text-admin-accent focus:ring-admin-accent/30"
                />
                Published (active on store when guards pass)
              </label>
            </div>
          </fieldset>
          <label className="inline-flex cursor-pointer items-center gap-2 sm:col-span-2 text-sm text-admin-secondary">
            <input
              type="checkbox"
              checked={quoteOnly}
              onChange={(e) => setQuoteOnly(e.target.checked)}
              className="rounded border-admin-border text-admin-accent focus:ring-admin-accent/30"
            />
            Quote only (no list price on variants)
          </label>
        </div>
      </div>

      <div className={cn(adminMutedPanel, "border-solid p-5")}>
        <p className={cn(adminEyebrow, "mb-4")}>Variants &amp; pricing</p>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-admin-primary">Size variants</h3>
          <button type="button" onClick={addVariantRow} className={cn("text-sm font-semibold", adminLink)}>
            + Add variant
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {variants.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input
                placeholder="Size"
                value={row.sizeCode}
                onChange={(e) => patchVariant(i, { sizeCode: e.target.value })}
                className={cn(cellInput, "col-span-3 text-sm")}
              />
              <input
                placeholder="Variant SKU (optional — auto)"
                value={row.variantSku}
                onChange={(e) => patchVariant(i, { variantSku: e.target.value })}
                className={cn(cellInput, "col-span-4 font-mono text-xs")}
              />
              <input
                placeholder="List price"
                value={row.listPrice}
                onChange={(e) => patchVariant(i, { listPrice: e.target.value })}
                disabled={quoteOnly}
                className={cn(cellInput, "col-span-3 text-sm disabled:cursor-not-allowed disabled:opacity-45")}
              />
              <button
                type="button"
                onClick={() => removeVariantRow(i)}
                disabled={variants.length <= 1}
                className={cn(adminSecondaryButton, "col-span-2 text-xs disabled:opacity-40")}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className={adminAlertSurface("critical")}>{error}</div>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-6 mt-2 flex flex-wrap gap-3 border-t border-admin-border bg-admin-surface/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-admin-surface/90">
        <button type="submit" disabled={pending} className={cn(adminPrimaryButton, "px-5 py-2.5")}>
          {pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
        </button>
        <Link href="/admin/products" className={cn(adminSecondaryButton, "inline-flex items-center px-4 py-2.5")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

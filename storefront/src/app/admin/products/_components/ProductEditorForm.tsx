"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminCategoryOption } from "@/lib/admin/product-form-options";
import { adminCreateProductAction, adminUpdateProductAction } from "@/app/admin/products/_components/product-editor-actions";

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

const lbl = "text-[10px] font-semibold uppercase tracking-wide text-neutral-500";
const field =
  "mt-1 w-full rounded-md border border-white/12 bg-[#181818] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[#f06232]/45 focus:outline-none focus:ring-1 focus:ring-[#f06232]/35";

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

  function buildPayload(): Record<string, unknown> {
    return {
      name,
      brand_name: brandName,
      category_id: categoryId,
      material,
      color,
      mil_thickness: milThickness,
      case_pack: casePack,
      description,
      primary_image_url: primaryImageUrl,
      status,
      quote_only: quoteOnly,
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
      className="relative max-w-3xl space-y-6 rounded-xl border border-white/10 bg-[#141414] p-6 pb-28 shadow-md ring-1 ring-white/[0.04] sm:pb-24"
    >
      {mode === "create" ? (
        <div className="rounded-lg border border-[#f06232]/25 bg-[#f06232]/[0.07] px-4 py-3 text-sm text-neutral-200">
          <strong className="text-[#f06232]">Draft first, publish later.</strong> New rows default to draft. Switch to{" "}
          <span className="font-medium text-white">Published</span> only after category, primary image, and variants satisfy database
          guards.
        </div>
      ) : null}

      <div className="rounded-lg border border-white/10 bg-[#161616] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f06232]">Identity &amp; taxonomy</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={lbl}>Product name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={lbl}>Brand (matches catalog brand)</span>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. SHOWA"
              className={field}
            />
          </label>
          <label className="block">
            <span className={lbl}>Category</span>
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
            <span className={lbl}>Material</span>
            <input value={material} onChange={(e) => setMaterial(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={lbl}>Color</span>
            <input value={color} onChange={(e) => setColor(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={lbl}>Mil thickness</span>
            <input value={milThickness} onChange={(e) => setMilThickness(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={lbl}>Case pack</span>
            <input value={casePack} onChange={(e) => setCasePack(e.target.value)} className={field} />
          </label>
          <label className="block sm:col-span-2">
            <span className={lbl}>Primary image URL</span>
            <input
              value={primaryImageUrl}
              onChange={(e) => setPrimaryImageUrl(e.target.value)}
              className={`${field} font-mono text-xs`}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={lbl}>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={field} />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className={lbl}>Status</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-200">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="pub"
                  checked={status === "draft"}
                  onChange={() => setStatus("draft")}
                  className="border-white/30 text-[#f06232] focus:ring-[#f06232]/40"
                />
                Draft (not on public store)
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="pub"
                  checked={status === "active"}
                  onChange={() => setStatus("active")}
                  className="border-white/30 text-[#f06232] focus:ring-[#f06232]/40"
                />
                Published (active on store when guards pass)
              </label>
            </div>
          </fieldset>
          <label className="inline-flex cursor-pointer items-center gap-2 sm:col-span-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              checked={quoteOnly}
              onChange={(e) => setQuoteOnly(e.target.checked)}
              className="rounded border-white/30 text-[#f06232] focus:ring-[#f06232]/40"
            />
            Quote only (no list price on variants)
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#161616] p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f06232]">Variants &amp; pricing</p>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Size variants</h3>
          <button type="button" onClick={addVariantRow} className="text-sm font-medium text-[#f06232] hover:text-[#ff8a5c] hover:underline">
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
                className="col-span-3 rounded-md border border-white/12 bg-[#181818] px-2 py-1.5 text-sm text-neutral-100 focus:border-[#f06232]/45 focus:outline-none focus:ring-1 focus:ring-[#f06232]/35"
              />
              <input
                placeholder="Variant SKU (optional — auto)"
                value={row.variantSku}
                onChange={(e) => patchVariant(i, { variantSku: e.target.value })}
                className="col-span-4 rounded-md border border-white/12 bg-[#181818] px-2 py-1.5 font-mono text-xs text-neutral-100 focus:border-[#f06232]/45 focus:outline-none focus:ring-1 focus:ring-[#f06232]/35"
              />
              <input
                placeholder="List price"
                value={row.listPrice}
                onChange={(e) => patchVariant(i, { listPrice: e.target.value })}
                disabled={quoteOnly}
                className="col-span-3 rounded-md border border-white/12 bg-[#181818] px-2 py-1.5 text-sm text-neutral-100 focus:border-[#f06232]/45 focus:outline-none focus:ring-1 focus:ring-[#f06232]/35 disabled:cursor-not-allowed disabled:opacity-45"
              />
              <button
                type="button"
                onClick={() => removeVariantRow(i)}
                disabled={variants.length <= 1}
                className="col-span-2 rounded border border-white/12 text-xs text-neutral-400 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-6 mt-2 flex flex-wrap gap-3 border-t border-white/10 bg-[#121212]/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-[#121212]/90">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[#f06232] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e5582d] disabled:opacity-60"
        >
          {pending ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
        </button>
        <Link
          href="/admin/products"
          className="inline-flex items-center rounded-md border border-white/15 px-4 py-2 text-sm text-neutral-200 hover:border-[#f06232]/35 hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

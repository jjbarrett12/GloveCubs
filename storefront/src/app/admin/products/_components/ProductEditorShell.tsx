"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminCategoryOption } from "@/lib/admin/product-form-options";
import type { AdminProductDetailResult } from "@/lib/admin/product-operations";
import {
  filterAttributesToCategory,
  type AttributeDefinitionRow,
} from "@/lib/admin/product-attribute-sync";
import type { LegacyMetadataField } from "@/lib/admin/legacy-metadata-migration";
import { legacyMetadataToAttributes } from "@/lib/admin/legacy-metadata-migration";
import {
  computeEditorReadiness,
  hasPublishBlockers,
} from "@/lib/admin/product-editor-readiness";
import { detectMissingImportFilterAttributes } from "@/lib/admin/import-suggestion-mapper";
import type { ImportApplyPatch } from "@/lib/admin/import-suggestion-mapper";
import type { EditorVariantRow } from "@/lib/admin/variant-generation";
import { adminUpdateProductAction } from "@/app/admin/products/_components/product-editor-actions";
import { ProductCommandHeader } from "@/app/admin/products/_components/ProductCommandHeader";
import { ProductAttributeEditor } from "@/app/admin/products/_components/ProductAttributeEditor";
import { ImportIntelligencePanel } from "@/app/admin/products/_components/ImportIntelligencePanel";
import { VariantSizeMatrix } from "@/app/admin/products/_components/VariantSizeMatrix";
import { PublishReadinessPanel } from "@/app/admin/products/_components/PublishReadinessPanel";
import { PremiumSectionCard } from "@/components/admin/PremiumSectionCard";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import type { GovernanceWarning } from "@/lib/admin/catalog-governance";

const lbl = "text-xs font-semibold text-slate-600";
const field =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-inner focus:border-[#f06232]/50 focus:outline-none focus:ring-2 focus:ring-[#f06232]/20";

export type ProductEditorShellProps = {
  categories: AdminCategoryOption[];
  productId: string;
  product: NonNullable<AdminProductDetailResult["product"]>;
  variants: NonNullable<AdminProductDetailResult["variants"]>;
  warnings: GovernanceWarning[];
  storefrontPdpPath: string | null;
  editor: NonNullable<AdminProductDetailResult["editor"]>;
  primaryImageUrl: string;
};

function variantsFromDb(
  rows: NonNullable<AdminProductDetailResult["variants"]>
): EditorVariantRow[] {
  const active = rows.filter((v) => v.isActive);
  if (active.length === 0) return [{ sizeCode: "M", variantSku: "", listPrice: "" }];
  return active.map((v) => {
    const vm = (v.metadata ?? {}) as Record<string, unknown>;
    const lp = vm.list_price;
    const listPrice = typeof lp === "number" ? String(lp) : typeof lp === "string" ? lp : "";
    return { id: v.id, sizeCode: v.sizeCode ?? "", variantSku: v.variantSku, listPrice };
  });
}

function metaStr(meta: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!meta || typeof meta !== "object") return "";
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function ProductEditorShell({
  categories,
  productId,
  product,
  variants: dbVariants,
  warnings,
  storefrontPdpPath,
  editor,
  primaryImageUrl: initialPrimaryImageUrl,
}: ProductEditorShellProps) {
  const router = useRouter();
  const meta = (product.metadata ?? {}) as Record<string, unknown>;

  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [pendingCategoryId, setPendingCategoryId] = React.useState<string | null>(null);
  const [pendingCategoryDefs, setPendingCategoryDefs] = React.useState<AttributeDefinitionRow[] | null>(null);

  const [name, setName] = React.useState(product.name);
  const [brandName, setBrandName] = React.useState(product.brandName ?? metaStr(meta, ["brand_name_hint"]));
  const [categoryId, setCategoryId] = React.useState(product.categoryId ?? "");
  const [description, setDescription] = React.useState(product.description ?? "");
  const [primaryImageUrl, setPrimaryImageUrl] = React.useState(initialPrimaryImageUrl);
  const [status, setStatus] = React.useState<"draft" | "active">(product.status === "active" ? "active" : "draft");
  const [quoteOnly, setQuoteOnly] = React.useState(meta.quote_only === true);
  const [attributes, setAttributes] = React.useState<Record<string, string | string[]>>(editor.productAttributes);
  const [definitions, setDefinitions] = React.useState<AttributeDefinitionRow[]>(editor.attributeDefinitions);
  const [legacyFields, setLegacyFields] = React.useState<LegacyMetadataField[]>(editor.legacyMetadataFields);
  const [variants, setVariants] = React.useState<EditorVariantRow[]>(() => variantsFromDb(dbVariants));
  const [importDraft] = React.useState<ImportDraftProductV1 | null>(editor.importDraft);

  const markDirty = React.useCallback(() => setDirty(true), []);

  const allowedByKey = React.useMemo(
    () => new Map(definitions.map((d) => [d.attributeKey, d.allowedValues])),
    [definitions]
  );

  const missingFilterKeys = React.useMemo(
    () =>
      importDraft
        ? detectMissingImportFilterAttributes(importDraft, attributes, allowedByKey).map((m) => m.key)
        : [],
    [importDraft, attributes, allowedByKey]
  );

  React.useEffect(() => {
    if (categoryId === (product.categoryId ?? "")) {
      setDefinitions(editor.attributeDefinitions);
      return;
    }
    if (pendingCategoryId === categoryId) return;
    void fetch(`/admin/api/products/${productId}/attribute-definitions?category_id=${encodeURIComponent(categoryId)}`)
      .then((r) => r.json())
      .then((data: { definitions?: AttributeDefinitionRow[] }) => {
        if (data.definitions) setDefinitions(data.definitions);
      })
      .catch(() => {});
  }, [categoryId, product.categoryId, productId, editor.attributeDefinitions, pendingCategoryId]);

  const draftReadiness = computeEditorReadiness({
    categoryId,
    primaryImageUrl,
    publishIntent: false,
    quoteOnly,
    attributes,
    variants,
    metadata: product.metadata,
    governanceWarnings: warnings,
    attributeDefinitions: definitions,
    dirty,
    importDraft,
    allowedByKey,
  });

  const publishReadiness = computeEditorReadiness({
    categoryId,
    primaryImageUrl,
    publishIntent: true,
    quoteOnly,
    attributes,
    variants,
    metadata: product.metadata,
    governanceWarnings: warnings,
    attributeDefinitions: definitions,
    dirty: false,
    importDraft,
    allowedByKey,
  });

  function buildPayload(targetStatus: "draft" | "active") {
    return {
      name,
      brand_name: brandName,
      category_id: categoryId,
      description,
      primary_image_url: primaryImageUrl,
      status: targetStatus,
      quote_only: quoteOnly,
      attributes,
      variants: variants.map((r) => ({
        id: r.id,
        size_code: r.sizeCode,
        variant_sku: r.variantSku,
        list_price: r.listPrice,
      })),
    };
  }

  function save(targetStatus: "draft" | "active") {
    setError(null);
    const fd = new FormData();
    fd.set("product_id", productId);
    fd.set("payload", JSON.stringify(buildPayload(targetStatus)));
    startTransition(async () => {
      const res = await adminUpdateProductAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirty(false);
      router.refresh();
    });
  }

  function applyImportPatch(patch: ImportApplyPatch) {
    if (patch.identity) {
      if (patch.identity.name !== undefined) setName(patch.identity.name);
      if (patch.identity.brandName !== undefined) setBrandName(patch.identity.brandName);
      if (patch.identity.description !== undefined) setDescription(patch.identity.description);
      if (patch.identity.primaryImageUrl !== undefined) setPrimaryImageUrl(patch.identity.primaryImageUrl);
    }
    if (patch.attributes) setAttributes((a) => ({ ...a, ...patch.attributes }));
    if (patch.variants) setVariants(patch.variants);
    markDirty();
  }

  function migrateLegacy() {
    const allowed = new Map(definitions.map((d) => [d.attributeKey, d.allowedValues]));
    const { attributes: migrated, skipped } = legacyMetadataToAttributes(legacyFields, allowed);
    if (Object.keys(migrated).length > 0) {
      setAttributes((a) => ({ ...a, ...migrated }));
      setLegacyFields((prev) => prev.filter((f) => !migrated[f.attrKey]));
      markDirty();
    }
    if (skipped.length > 0) setError(`Migration skipped: ${skipped.join("; ")}`);
  }

  async function requestCategoryChange(nextCategoryId: string) {
    if (nextCategoryId === categoryId) return;
    if (!nextCategoryId) {
      setCategoryId("");
      markDirty();
      return;
    }
    try {
      const res = await fetch(
        `/admin/api/products/${productId}/attribute-definitions?category_id=${encodeURIComponent(nextCategoryId)}`
      );
      const data = (await res.json()) as { definitions?: AttributeDefinitionRow[] };
      setPendingCategoryDefs(data.definitions ?? []);
      setPendingCategoryId(nextCategoryId);
    } catch {
      setError("Could not load attribute definitions for the selected category.");
    }
  }

  function confirmCategoryChange() {
    if (!pendingCategoryId || !pendingCategoryDefs) return;
    setAttributes((prev) => filterAttributesToCategory(prev, pendingCategoryDefs));
    setCategoryId(pendingCategoryId);
    setDefinitions(pendingCategoryDefs);
    setPendingCategoryId(null);
    setPendingCategoryDefs(null);
    markDirty();
  }

  function cancelCategoryChange() {
    setPendingCategoryId(null);
    setPendingCategoryDefs(null);
  }

  const sourceUrl = typeof meta.import_source_url === "string" ? meta.import_source_url : null;
  const pendingCategoryName = categories.find((c) => c.id === pendingCategoryId)?.name ?? "new category";

  return (
    <div className="relative pb-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href="/admin/products" className="hover:text-[#f06232]">
          Products
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/admin/products/${productId}`} className="hover:text-[#f06232]">
          {product.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">Edit</span>
      </nav>

      <ProductCommandHeader
        name={name}
        status={status}
        quoteOnly={quoteOnly}
        parserVersion={editor.parserVersion}
        readiness={publishReadiness}
        storefrontPath={storefrontPdpPath}
        pending={pending}
        dirty={dirty}
        onSaveDraft={() => save("draft")}
        onPublish={() => {
          if (hasPublishBlockers(publishReadiness)) {
            setError(
              `Cannot publish: ${publishReadiness.publishBlockers.map((b) => b.label).join("; ")}`
            );
            return;
          }
          setStatus("active");
          save("active");
        }}
      />

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      {pendingCategoryId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Change category?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Switching to <strong>{pendingCategoryName}</strong> removes storefront filter attributes that are not
              valid for the new category. Overlapping keys are preserved.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelCategoryChange}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCategoryChange}
                className="rounded-lg bg-[#f06232] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e5582d]"
              >
                Confirm change
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <PremiumSectionCard title="Identity & taxonomy" dense>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={lbl}>Product name</span>
                <input
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    markDirty();
                  }}
                  className={field}
                />
              </label>
              <label className="block">
                <span className={lbl}>Brand</span>
                <input
                  value={brandName}
                  onChange={(e) => {
                    setBrandName(e.target.value);
                    markDirty();
                  }}
                  className={field}
                />
              </label>
              <label className="block">
                <span className={lbl}>Category</span>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => {
                    void requestCategoryChange(e.target.value);
                  }}
                  className={field}
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className={lbl}>Primary image URL</span>
                <div className="mt-1 flex gap-3">
                  {primaryImageUrl.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={primaryImageUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : null}
                  <input
                    value={primaryImageUrl}
                    onChange={(e) => {
                      setPrimaryImageUrl(e.target.value);
                      markDirty();
                    }}
                    className={`${field} mt-0 flex-1 font-mono text-xs`}
                  />
                </div>
              </label>
              <label className="block sm:col-span-2">
                <span className={lbl}>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    markDirty();
                  }}
                  rows={4}
                  className={field}
                />
              </label>
              <label className="inline-flex items-center gap-2 sm:col-span-2 text-sm">
                <input
                  type="checkbox"
                  checked={quoteOnly}
                  onChange={(e) => {
                    setQuoteOnly(e.target.checked);
                    markDirty();
                  }}
                  className="rounded border-slate-300 text-[#f06232]"
                />
                Quote only
              </label>
            </div>
          </PremiumSectionCard>

          <ProductAttributeEditor
            categoryId={categoryId}
            definitions={definitions}
            values={attributes}
            legacyFields={legacyFields}
            missingFilterKeys={missingFilterKeys}
            onChange={(v) => {
              setAttributes(v);
              markDirty();
            }}
            onMigrateLegacy={migrateLegacy}
          />

          <VariantSizeMatrix
            variants={variants}
            quoteOnly={quoteOnly}
            importDraft={importDraft}
            onChange={(v) => {
              setVariants(v);
              markDirty();
            }}
          />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[4.5rem] lg:self-start">
          <ImportIntelligencePanel
            draft={importDraft}
            sourceUrl={sourceUrl}
            parserVersion={editor.parserVersion}
            definitions={definitions}
            currentAttributes={attributes}
            currentVariants={variants}
            currentIdentity={{ name, brandName, description, primaryImageUrl }}
            onApply={applyImportPatch}
          />
          <PublishReadinessPanel readiness={draftReadiness} />
          <div className="text-center">
            <Link href={`/admin/products/${productId}`} className="text-xs font-medium text-slate-500 hover:text-[#f06232]">
              View read-only detail →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

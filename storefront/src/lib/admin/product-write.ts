import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

import { createRequire } from "node:module";

import { randomBytes } from "crypto";

import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";
import { evaluateActivePublishReadiness } from "@/lib/admin/product-write-active-readiness";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import {
  evaluateStorefrontManualActivePublishGuard,
  URL_IMPORT_CATALOGOS_PUBLISH_REQUIRED_MESSAGE,
} from "@/lib/admin/canonical-publish-policy";
import {
  isUrlImportProductMetadata,
  URL_IMPORT_NON_ADMIN_PUBLISH_BLOCKED_MESSAGE,
} from "@/lib/admin/clipboard-promote-guards";
import { sortVariantsByGloveSize, type ManufacturerSkuSource } from "@/lib/admin/variant-generation";
import {
  runManualPostActiveSideEffects,
  shouldRunManualPostActiveSideEffects,
} from "@/lib/admin/product-write-manual-post-active";

import { IMPORT_DRAFT_PARSER_VERSION, IMPORT_DRAFT_SCHEMA_VERSION } from "@/lib/admin/import-draft-types";

import {
  fetchCategoryAttributeDefinitions,
  syncProductAttributesFromEditor,
  attributesFromImportDraft,
} from "@/lib/admin/product-attribute-sync";

import type { CommercePackagingV1 } from "@commerce-packaging/types";
import {
  applyCommercePackagingToMetadata,
  commercePackagingToFilterAttributes,
} from "@/lib/admin/commerce-packaging-editor";

const require = createRequire(import.meta.url);
const { deleteInventoryForCanonicalProduct } = require("../../../../lib/inventory.js") as {
  deleteInventoryForCanonicalProduct: (
    canonicalProductId: string
  ) => Promise<{ ok: true } | { error: string }>;
};

export type ProductEditorVariantInput = {

  id?: string;

  sizeCode: string;

  variantSku: string;

  listPrice: string;

  manufacturerSku?: string | null;

  manufacturerSkuSource?: ManufacturerSkuSource;

  manufacturerSkuNeedsReview?: boolean;

};



export type ProductWriteInput = {

  name: string;

  brandName: string;

  categoryId: string;

  description: string;

  primaryImageUrl: string;

  status: "draft" | "active";

  quoteOnly: boolean;

  variants: ProductEditorVariantInput[];

  /** Storefront filter truth — written to catalogos.product_attributes only. */

  attributes: Record<string, string | string[]>;

  /** Case/pallet commerce packaging — written to catalog_v2.catalog_products.metadata. */
  commercePackaging?: CommercePackagingV1 | null;

  /** When set, seeds import/provenance metadata on insert. */

  importDraft?: ImportDraftProductV1 | null;

  importStagingId?: string | null;

  /** Extra import provenance keys merged on insert (clipboard CatalogOS metadata). */
  importMetadataExtras?: Record<string, unknown> | null;

  /** GloveCubs parent SKU (catalog_products.internal_sku). Applied when operator confirms proposal. */
  internalSku?: string | null;

};



const PRESERVED_METADATA_KEYS = new Set([

  "import_schema_version",

  "import_parser_version",

  "import_source_url",

  "import_staging_id",

  "import_parsed_at",

  "import_field_provenance",

  "import_extraction_authority",

  "catalogos_url_import_job_id",

  "catalogos_url_import_product_id",

  "product_setup_contract_schema_version",

  "import_has_product_setup_contract_summary",

]);



const LEGACY_FILTER_METADATA_KEYS = ["material", "color", "mil_thickness", "mil"] as const;

const DELETABLE_CATALOG_PRODUCT_STATUSES = new Set(["draft", "active", "archived"]);



function slugifyBase(name: string): string {

  return name

    .trim()

    .toLowerCase()

    .replace(/[^a-z0-9]+/g, "-")

    .replace(/^-+|-+$/g, "")

    .slice(0, 80) || "product";

}



async function pickDefaultProductTypeId(supabase: any): Promise<string | null> {

  const { data } = await supabase

    .schema("catalog_v2")

    .from("catalog_product_types")

    .select("id")

    .eq("is_active", true)

    .order("sort_order", { ascending: true })

    .limit(1)

    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;

}



async function resolveBrandId(supabase: any, brandName: string): Promise<string | null> {

  const t = brandName.trim();

  if (!t) return null;

  const { data } = await supabase

    .schema("catalogos")

    .from("brands")

    .select("id")

    .ilike("name", t)

    .limit(1)

    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;

}



async function uniqueSlug(supabase: any, base: string): Promise<string> {

  for (let i = 0; i < 8; i++) {

    const suffix = i === 0 ? "" : `-${randomBytes(2).toString("hex")}`;

    const slug = `${base}${suffix}`.slice(0, 120);

    const { data } = await supabase.schema("catalog_v2").from("catalog_products").select("id").eq("slug", slug).maybeSingle();

    if (!data) return slug;

  }

  return `${base}-${randomBytes(4).toString("hex")}`.slice(0, 120);

}



async function uniqueVariantSku(supabase: any, base: string): Promise<string> {

  const b = base.slice(0, 80);

  for (let i = 0; i < 8; i++) {

    const sku = i === 0 ? b : `${b}-${randomBytes(2).toString("hex")}`;

    const { data } = await supabase.schema("catalog_v2").from("catalog_variants").select("id").eq("variant_sku", sku).maybeSingle();

    if (!data) return sku;

  }

  return `${b}-${randomBytes(4).toString("hex")}`.slice(0, 120);

}



async function assertInternalSkuAvailable(

  supabase: any,

  sku: string,

  excludeProductId?: string | null

): Promise<{ ok: true } | { error: string }> {

  const normalized = sku.trim().toUpperCase();

  if (!normalized) return { error: "Internal SKU is empty." };

  let query = supabase.schema("catalog_v2").from("catalog_products").select("id").eq("internal_sku", normalized);

  if (excludeProductId) query = query.neq("id", excludeProductId);

  const { data } = await query.maybeSingle();

  if (data) return { error: `SKU already exists: ${normalized}` };

  return { ok: true };

}



async function assertVariantSkuAvailable(

  supabase: any,

  sku: string,

  excludeVariantId?: string | null

): Promise<{ ok: true } | { error: string }> {

  const normalized = sku.trim().toUpperCase();

  if (!normalized) return { error: "Variant SKU is empty." };

  let query = supabase.schema("catalog_v2").from("catalog_variants").select("id").eq("variant_sku", normalized);

  if (excludeVariantId) query = query.neq("id", excludeVariantId);

  const { data } = await query.maybeSingle();

  if (data) return { error: `SKU already exists: ${normalized}` };

  return { ok: true };

}



async function resolveVariantSkuForWrite(

  supabase: any,

  variantInput: ProductEditorVariantInput,

  internalSku: string,

  sizeKey: string,

  excludeVariantId?: string | null

): Promise<{ ok: true; sku: string } | { error: string }> {

  const explicit = variantInput.variantSku.trim();

  if (explicit) {

    const check = await assertVariantSkuAvailable(supabase, explicit, excludeVariantId);

    if ("error" in check) return check;

    return { ok: true, sku: explicit.toUpperCase() };

  }

  const skuBase = `${internalSku}-${sizeKey}`.toUpperCase();

  const sku = await uniqueVariantSku(supabase, skuBase);

  return { ok: true, sku };

}



function manufacturerSkuForVariant(

  input: ProductWriteInput,

  sizeKey: string,

  variantInput?: ProductEditorVariantInput

): string | null {

  const fromInput = variantInput?.manufacturerSku?.trim();

  if (fromInput) return fromInput;

  const draftVar = input.importDraft?.variants.find(

    (v) => (v.normalized_size_code ?? "").trim().toUpperCase() === sizeKey

  );

  return draftVar?.manufacturer_sku?.trim() ?? draftVar?.source_sku?.trim() ?? null;

}



function buildImportMetadataSeed(

  draft: ImportDraftProductV1,

  stagingId?: string | null

): Record<string, unknown> {

  const seed: Record<string, unknown> = {

    import_schema_version: IMPORT_DRAFT_SCHEMA_VERSION,

    import_parser_version: IMPORT_DRAFT_PARSER_VERSION,

    import_source_url: draft.source_url,

    import_parsed_at: new Date().toISOString(),

  };

  if (stagingId?.trim()) seed.import_staging_id = stagingId.trim();

  if (draft.units_per_case != null && Number.isFinite(draft.units_per_case)) {

    seed.units_per_case = draft.units_per_case;

  }

  if (draft.case_pack) seed.case_pack = draft.case_pack;

  if (draft.powder_free === true) seed.powder_free = true;

  if (draft.exam_grade === true) seed.exam_grade = true;

  const prov = draft.field_provenance;

  if (prov && Object.keys(prov).length > 0) {

    seed.import_field_provenance = prov;

  }

  return seed;

}



function applyImportDraftSupportFields(

  meta: Record<string, unknown>,

  draft: ImportDraftProductV1 | null | undefined

): void {

  if (!draft) return;

  if (draft.units_per_case != null && Number.isFinite(draft.units_per_case)) {

    meta.units_per_case = draft.units_per_case;

  }

  if (draft.case_pack) meta.case_pack = draft.case_pack;

  if (draft.powder_free === true) meta.powder_free = true;

  else if (draft.powder_free === false) meta.powder_free = false;

  if (draft.exam_grade === true) meta.exam_grade = true;

}



/** Merge editor fields into metadata — provenance/support only; no filter dual-write. */

export function mergeProductMetadata(

  existing: Record<string, unknown> | null | undefined,

  input: ProductWriteInput,

  brandNameUnmatched: boolean

): Record<string, unknown> {

  const base = { ...(existing ?? {}) };



  for (const key of LEGACY_FILTER_METADATA_KEYS) {

    if (key in base) delete base[key];

  }



  base.quote_only = input.quoteOnly;

  if (input.categoryId.trim()) {

    base.category_id = input.categoryId.trim();

  }



  if (brandNameUnmatched && input.brandName.trim()) {

    base.brand_name_hint = input.brandName.trim();

  } else if (!input.brandName.trim() && "brand_name_hint" in base) {

    delete base.brand_name_hint;

  }



  applyImportDraftSupportFields(base, input.importDraft);

  if (input.commercePackaging) {
    applyCommercePackagingToMetadata(base, input.commercePackaging);
  }

  return base;

}



function buildMetadataForInsert(input: ProductWriteInput, brandNameUnmatched: boolean): Record<string, unknown> {

  const meta = mergeProductMetadata(null, input, brandNameUnmatched);

  if (input.importDraft) {

    Object.assign(meta, buildImportMetadataSeed(input.importDraft, input.importStagingId));

  }

  if (input.importMetadataExtras && Object.keys(input.importMetadataExtras).length > 0) {
    Object.assign(meta, input.importMetadataExtras);
  }

  return meta;

}



function defaultVariantsFallback(internalSku: string): ProductWriteInput["variants"] {

  return [{ sizeCode: "UNKNOWN", variantSku: `${internalSku}-unknown`.toUpperCase(), listPrice: "" }];

}



function normSize(code: string): string {

  return code.trim().toUpperCase() || "UNKNOWN";

}



async function mergeVariantsForProduct(

  supabase: any,

  productId: string,

  internalSku: string,

  input: ProductWriteInput

): Promise<{ error?: string }> {

  const { data: existingRows } = await supabase

    .schema("catalog_v2")

    .from("catalog_variants")

    .select("id, variant_sku, size_code, metadata, sort_order")

    .eq("catalog_product_id", productId);



  const existing = (existingRows ?? []) as Array<{

    id: string;

    variant_sku: string;

    size_code: string | null;

    metadata: Record<string, unknown> | null;

    sort_order: number | null;

  }>;



  const existingById = new Map(existing.map((r) => [r.id, r]));

  const existingBySize = new Map<string, typeof existing[0]>();

  for (const r of existing) {

    const k = normSize(r.size_code ?? "");

    if (!existingBySize.has(k)) existingBySize.set(k, r);

  }



  const variants = sortVariantsByGloveSize(
    (input.variants.length ? input.variants : [{ sizeCode: "UNKNOWN", variantSku: "", listPrice: "" }]).map((v) => ({
      ...v,
      manufacturerSku: v.manufacturerSku ?? undefined,
    })),
  );

  const touchedIds = new Set<string>();

  let sort = 0;

  const resolvedSkusInProduct = new Set<string>();

  for (const v of variants) {

    const sizeKey = normSize(v.sizeCode);

    const priceRaw = v.listPrice.trim();

    const listPrice = priceRaw === "" ? null : Number.parseFloat(priceRaw);

    const vmeta: Record<string, unknown> = {};

    if (!input.quoteOnly && listPrice != null && Number.isFinite(listPrice)) vmeta.list_price = listPrice;

    const mfrSku = manufacturerSkuForVariant(input, sizeKey, v);

    if (mfrSku) vmeta.manufacturer_sku = mfrSku;
    if (v.manufacturerSkuSource) vmeta.manufacturer_sku_source = v.manufacturerSkuSource;



    let rowId = v.id?.trim();

    let prev = rowId ? existingById.get(rowId) : existingBySize.get(sizeKey);



    if (prev) {

      rowId = prev.id;

      touchedIds.add(rowId);

      let sku = prev.variant_sku;

      if (v.variantSku.trim()) {

        const resolved = await resolveVariantSkuForWrite(supabase, v, internalSku, sizeKey, prev.id);

        if ("error" in resolved) return { error: resolved.error };

        sku = resolved.sku;

      }

      const skuKey = sku.trim().toUpperCase();
      if (resolvedSkusInProduct.has(skuKey)) {
        return { error: `Duplicate variant SKU within product: ${sku}` };
      }
      resolvedSkusInProduct.add(skuKey);

      const mergedMeta = { ...(prev.metadata ?? {}), ...vmeta };

      const { error } = await supabase

        .schema("catalog_v2")

        .from("catalog_variants")

        .update({

          variant_sku: sku,

          size_code: v.sizeCode.trim() || null,

          sort_order: sort++,

          is_active: true,

          metadata: mergedMeta,

        })

        .eq("id", rowId);

      if (error) return { error: error.message };

    } else {

      const resolved = await resolveVariantSkuForWrite(supabase, v, internalSku, sizeKey, null);

      if ("error" in resolved) return { error: resolved.error };

      const variantSku = resolved.sku;

      const skuKey = variantSku.trim().toUpperCase();
      if (resolvedSkusInProduct.has(skuKey)) {
        return { error: `Duplicate variant SKU within product: ${variantSku}` };
      }
      resolvedSkusInProduct.add(skuKey);

      const { data: inserted, error } = await supabase

        .schema("catalog_v2")

        .from("catalog_variants")

        .insert({

          catalog_product_id: productId,

          variant_sku: variantSku,

          sort_order: sort++,

          is_active: true,

          size_code: v.sizeCode.trim() || null,

          metadata: vmeta,

        })

        .select("id")

        .single();

      if (error) return { error: error.message };

      if (inserted) touchedIds.add((inserted as { id: string }).id);

    }

  }



  for (const r of existing) {

    if (touchedIds.has(r.id)) continue;

    await supabase.schema("catalog_v2").from("catalog_variants").update({ is_active: false }).eq("id", r.id);

  }



  return {};

}



async function syncProductImages(

  supabase: any,

  productId: string,

  primaryImageUrl: string,

  galleryUrls?: string[]

): Promise<{ error?: string }> {

  const ordered: string[] = [];

  const seen = new Set<string>();

  const add = (raw: string) => {

    const img = raw.trim();

    if (!img || seen.has(img)) return;

    seen.add(img);

    ordered.push(img);

  };

  add(primaryImageUrl);

  for (const u of galleryUrls ?? []) add(u);



  const { data: imgs } = await supabase

    .schema("catalog_v2")

    .from("catalog_product_images")

    .select("id, url, is_primary, sort_order")

    .eq("catalog_product_id", productId)

    .order("sort_order", { ascending: true });



  const rows = (imgs ?? []) as Array<{ id: string; url: string; is_primary: boolean; sort_order: number }>;



  if (ordered.length === 0) {

    if (rows.length > 0) {

      await supabase.schema("catalog_v2").from("catalog_product_images").delete().eq("catalog_product_id", productId);

    }

    return {};

  }



  const existingUrls = rows.map((r) => r.url);

  if (

    existingUrls.length === ordered.length &&

    ordered.every((url, i) => existingUrls[i] === url) &&

    rows[0]?.is_primary === true

  ) {

    return {};

  }



  await supabase.schema("catalog_v2").from("catalog_product_images").delete().eq("catalog_product_id", productId);



  for (let i = 0; i < ordered.length; i++) {

    const { error } = await supabase.schema("catalog_v2").from("catalog_product_images").insert({

      catalog_product_id: productId,

      url: ordered[i],

      is_primary: i === 0,

      sort_order: i,

      metadata: { image_provenance: "editorial", source: "admin_product_editor" },

    });

    if (error) return { error: error.message };

  }

  return {};

}



function galleryUrlsFromImportDraft(draft: ImportDraftProductV1 | null | undefined): string[] | undefined {

  const urls = draft?.image_urls?.filter((u) => typeof u === "string" && u.trim()) ?? [];

  return urls.length > 0 ? urls : undefined;

}



async function resolveAttributesForWrite(
  categoryId: string,
  input: ProductWriteInput
): Promise<Record<string, string | string[]>> {
  let attrs = { ...input.attributes };
  if (input.importDraft && categoryId.trim()) {
    const fromDraft = await attributesFromImportDraft(categoryId, input.importDraft);
    attrs = { ...fromDraft, ...attrs };
  }
  if (input.commercePackaging) {
    attrs = { ...commercePackagingToFilterAttributes(input.commercePackaging), ...attrs };
  }
  return attrs;
}

async function syncAttributes(

  productId: string,

  categoryId: string,

  attributes: Record<string, string | string[]>

): Promise<{ error?: string }> {

  const defs = await fetchCategoryAttributeDefinitions(categoryId);

  const { errors } = await syncProductAttributesFromEditor(productId, categoryId, attributes, defs);

  if (errors.length > 0) return { error: errors.join("; ") };

  return {};

}

async function finalizeManualActivePublish(
  supabase: any,
  productId: string,
  input: ProductWriteInput,
  metadata: Record<string, unknown>,
  internalSku: string
): Promise<{ error?: string }> {
  const canonicalBlock = evaluateStorefrontManualActivePublishGuard("active");
  if (canonicalBlock) return { error: canonicalBlock };

  if (isUrlImportProductMetadata(metadata)) {
    return { error: URL_IMPORT_CATALOGOS_PUBLISH_REQUIRED_MESSAGE };
  }

  if (!shouldRunManualPostActiveSideEffects(metadata, input.status, input.importStagingId)) {
    return { error: "Active publish blocked: product is not eligible for manual storefront active publish." };
  }

  const postActive = await runManualPostActiveSideEffects({
    supabase,
    productId,
    input,
    metadata,
    internalSku,
    productName: input.name,
  });
  if (!postActive.ok) {
    return { error: postActive.error };
  }

  const { error: uErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .update({ status: "active" })
    .eq("id", productId);
  if (uErr) return { error: uErr.message };

  return {};
}



export async function insertCatalogProduct(input: ProductWriteInput): Promise<{ id: string } | { error: string }> {

  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };

  const supabase = getSupabaseAdmin() as any;



  const typeId = await pickDefaultProductTypeId(supabase);

  if (!typeId) return { error: "No active catalog_product_types row found." };



  const brandId = await resolveBrandId(supabase, input.brandName);

  const brandUnmatched = Boolean(input.brandName.trim()) && !brandId;



  const slug = await uniqueSlug(supabase, slugifyBase(input.name));

  let internalSku = `GC-${randomBytes(3).toString("hex").toUpperCase()}`;

  if (input.internalSku?.trim()) {

    const check = await assertInternalSkuAvailable(supabase, input.internalSku);

    if ("error" in check) return { error: check.error };

    internalSku = input.internalSku.trim().toUpperCase();

  }



  const status = input.importStagingId?.trim() ? "draft" : input.status;

  const metadata = buildMetadataForInsert(input, brandUnmatched);

  const activeGuard =
    status === "active"
      ? await evaluateActivePublishReadiness(
          supabase,
          { ...input, status: "active", internalSku },
          { metadata, productId: null, importDraft: input.importDraft ?? null }
        )
      : null;
  if (activeGuard) return { error: activeGuard };



  const { data: product, error: pErr } = await supabase

    .schema("catalog_v2")

    .from("catalog_products")

    .insert({

      product_type_id: typeId,

      brand_id: brandId,

      slug,

      internal_sku: internalSku,

      name: input.name.trim(),

      description: input.description.trim() || null,

      status: "draft",

      metadata,

    })

    .select("id")

    .single();



  if (pErr || !product) {

    return { error: pErr?.message ?? "Failed to create product." };

  }

  const productId = (product as { id: string }).id;



  const variants = input.variants.length ? input.variants : defaultVariantsFallback(internalSku);

  let sort = 0;
  const resolvedSkusInProduct = new Set<string>();

  for (const v of variants) {

    const sizeKey = (v.sizeCode || "SZ").trim().toUpperCase();

    const resolved = await resolveVariantSkuForWrite(supabase, v, internalSku, sizeKey, null);

    if ("error" in resolved) {

      await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);

      return { error: resolved.error };

    }

    const variantSku = resolved.sku;
    if (resolvedSkusInProduct.has(variantSku.toUpperCase())) {
      await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);
      return { error: `Duplicate variant SKU within product: ${variantSku}` };
    }
    resolvedSkusInProduct.add(variantSku.toUpperCase());

    const priceRaw = v.listPrice.trim();

    const listPrice = priceRaw === "" ? null : Number.parseFloat(priceRaw);

    const vmeta: Record<string, unknown> = {};

    if (!input.quoteOnly && listPrice != null && Number.isFinite(listPrice)) vmeta.list_price = listPrice;

    const mfrSku = manufacturerSkuForVariant(input, (v.sizeCode || "SZ").trim().toUpperCase(), v);

    if (mfrSku) vmeta.manufacturer_sku = mfrSku;
    if (v.manufacturerSkuSource) vmeta.manufacturer_sku_source = v.manufacturerSkuSource;



    const { error: vErr } = await supabase.schema("catalog_v2").from("catalog_variants").insert({

      catalog_product_id: productId,

      variant_sku: variantSku,

      sort_order: sort++,

      is_active: true,

      size_code: v.sizeCode.trim() || null,

      metadata: vmeta,

    });

    if (vErr) {

      await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);

      return { error: vErr.message };

    }

  }



  const imgRes = await syncProductImages(
    supabase,
    productId,
    input.primaryImageUrl,
    galleryUrlsFromImportDraft(input.importDraft)
  );

  if (imgRes.error) {

    await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);

    return { error: imgRes.error };

  }



  if (input.categoryId.trim()) {

    const attrs = await resolveAttributesForWrite(input.categoryId, input);
    const attrRes = await syncAttributes(productId, input.categoryId, attrs);

    if (attrRes.error) {

      await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);

      return { error: attrRes.error };

    }

  }



  if (status === "active" && !input.importStagingId?.trim()) {
    const activeRes = await finalizeManualActivePublish(supabase, productId, input, metadata, internalSku);
    if (activeRes.error) {
      await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);
      return { error: activeRes.error };
    }
  }



  return { id: productId };

}



export async function updateCatalogProduct(

  productId: string,

  input: ProductWriteInput

): Promise<{ ok: true } | { error: string }> {

  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };

  const supabase = getSupabaseAdmin() as any;



  const { data: existingRow } = await supabase

    .schema("catalog_v2")

    .from("catalog_products")

    .select("metadata, internal_sku")

    .eq("id", productId)

    .maybeSingle();



  const existingMeta = (existingRow as { metadata?: Record<string, unknown>; internal_sku?: string } | null)?.metadata ?? null;

  let internalSku = (existingRow as { internal_sku?: string } | null)?.internal_sku ?? `GC-${productId.slice(0, 8)}`;

  if (input.internalSku?.trim()) {

    const nextSku = input.internalSku.trim().toUpperCase();

    if (nextSku !== internalSku.toUpperCase()) {

      const check = await assertInternalSkuAvailable(supabase, nextSku, productId);

      if ("error" in check) return { error: check.error };

      const { error: skuErr } = await supabase

        .schema("catalog_v2")

        .from("catalog_products")

        .update({ internal_sku: nextSku, updated_at: new Date().toISOString() })

        .eq("id", productId);

      if (skuErr) return { error: skuErr.message };

      internalSku = nextSku;

    }

  }



  const brandId = await resolveBrandId(supabase, input.brandName);

  const brandUnmatched = Boolean(input.brandName.trim()) && !brandId;

  const metadata = mergeProductMetadata(existingMeta, input, brandUnmatched);

  const targetStatus = input.status;

  if (targetStatus === "active") {
    if (isUrlImportProductMetadata(metadata)) {
      const admin = await getAdminUser();
      if (!admin) return { error: URL_IMPORT_NON_ADMIN_PUBLISH_BLOCKED_MESSAGE };
    }
    const activeGuard = await evaluateActivePublishReadiness(
      supabase,
      { ...input, status: "active", internalSku },
      { metadata, productId, importDraft: input.importDraft ?? null, adminReviewPublish: true }
    );
    if (activeGuard) return { error: activeGuard };
  }



  const { error: pErr } = await supabase

    .schema("catalog_v2")

    .from("catalog_products")

    .update({

      name: input.name.trim(),

      description: input.description.trim() || null,

      brand_id: brandId,

      metadata,

      status: "draft",

      updated_at: new Date().toISOString(),

    })

    .eq("id", productId);



  if (pErr) return { error: pErr.message };



  const varRes = await mergeVariantsForProduct(supabase, productId, internalSku, input);

  if (varRes.error) return { error: varRes.error };



  const imgRes = await syncProductImages(
    supabase,
    productId,
    input.primaryImageUrl,
    galleryUrlsFromImportDraft(input.importDraft)
  );

  if (imgRes.error) return { error: imgRes.error };



  if (input.categoryId.trim()) {

    const attrs = await resolveAttributesForWrite(input.categoryId, input);
    const attrRes = await syncAttributes(productId, input.categoryId, attrs);

    if (attrRes.error) return { error: attrRes.error };

  }



  if (targetStatus === "active") {
    const activeRes = await finalizeManualActivePublish(
      supabase,
      productId,
      { ...input, status: "active" },
      metadata,
      internalSku
    );
    if (activeRes.error) return { error: activeRes.error };
  }



  return { ok: true };

}



export async function promoteStagingToDraftProduct(

  stagingId: string,

  input: ProductWriteInput,

  createdBy: string | null

): Promise<{ productId: string } | { error: string }> {

  const created = await insertCatalogProduct({

    ...input,

    status: "draft",

    importStagingId: stagingId,

    importMetadataExtras: input.importMetadataExtras,

  });

  if ("error" in created) return created;



  const supabase = getSupabaseAdmin() as any;

  await supabase

    .schema("catalog_v2")

    .from("admin_url_clipboard_staging")

    .update({

      review_status: "converted_to_draft",

      created_catalog_product_id: created.id,

    })

    .eq("id", stagingId);



  void createdBy;

  return { productId: created.id };

}

export function resolveManufacturerSkuForVariantWrite(
  input: ProductWriteInput,
  sizeKey: string,
  variantInput?: ProductEditorVariantInput
): string | null {
  return manufacturerSkuForVariant(input, sizeKey, variantInput);
}

export async function checkInternalSkuCollision(
  supabase: unknown,
  sku: string,
  excludeProductId?: string | null
): Promise<{ ok: true } | { error: string }> {
  return assertInternalSkuAvailable(supabase, sku, excludeProductId);
}

export async function checkVariantSkuCollision(
  supabase: unknown,
  sku: string,
  excludeVariantId?: string | null
): Promise<{ ok: true } | { error: string }> {
  return assertVariantSkuAvailable(supabase, sku, excludeVariantId);
}

async function purgeCatalogProductDependencies(
  supabase: any,
  productId: string
): Promise<{ ok: true } | { error: string }> {
  const { error: quicklistErr } = await supabase
    .schema("gc_commerce")
    .from("company_quicklist_items")
    .delete()
    .eq("catalog_product_id", productId);
  if (quicklistErr) return { error: quicklistErr.message };

  const { data: sellables, error: sellableSelErr } = await supabase
    .schema("gc_commerce")
    .from("sellable_products")
    .select("id")
    .eq("catalog_product_id", productId);
  if (sellableSelErr) return { error: sellableSelErr.message };

  const sellableIds = ((sellables ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (sellableIds.length > 0) {
    const { count: orderLineCount, error: orderLineErr } = await supabase
      .schema("gc_commerce")
      .from("order_lines")
      .select("*", { count: "exact", head: true })
      .in("sellable_product_id", sellableIds);
    if (orderLineErr) return { error: orderLineErr.message };
    if ((orderLineCount ?? 0) > 0) {
      return {
        error: `Cannot delete: this product appears on ${orderLineCount} order line(s). Archive or deactivate it instead.`,
      };
    }
  }

  const { data: variants, error: variantSelErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_variants")
    .select("id")
    .eq("catalog_product_id", productId);
  if (variantSelErr) return { error: variantSelErr.message };

  const variantIds = ((variants ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (variantIds.length > 0) {
    const { count: variantOrderLineCount, error: variantOrderLineErr } = await supabase
      .schema("gc_commerce")
      .from("order_lines")
      .select("*", { count: "exact", head: true })
      .in("catalog_variant_id", variantIds);
    if (variantOrderLineErr) return { error: variantOrderLineErr.message };
    if ((variantOrderLineCount ?? 0) > 0) {
      return {
        error: `Cannot delete: a variant appears on ${variantOrderLineCount} order line(s). Archive or deactivate instead.`,
      };
    }
  }

  const { count: legacyOrderItemCount, error: legacyOrderItemErr } = await supabase
    .from("order_items")
    .select("*", { count: "exact", head: true })
    .eq("canonical_product_id", productId);
  if (legacyOrderItemErr && !/order_items|schema cache/i.test(legacyOrderItemErr.message)) {
    return { error: legacyOrderItemErr.message };
  }
  if ((legacyOrderItemCount ?? 0) > 0) {
    return { error: "Product cannot be deleted because it appears on one or more legacy orders." };
  }

  const { error: sellableDelErr } = await supabase
    .schema("gc_commerce")
    .from("sellable_products")
    .delete()
    .eq("catalog_product_id", productId);
  if (sellableDelErr) return { error: sellableDelErr.message };

  const { error: stockHistoryErr } = await supabase
    .from("stock_history")
    .delete()
    .eq("canonical_product_id", productId);
  if (stockHistoryErr && !/stock_history|schema cache/i.test(stockHistoryErr.message)) {
    return { error: stockHistoryErr.message };
  }

  const inventoryResult = await deleteInventoryForCanonicalProduct(productId);
  if ("error" in inventoryResult) return { error: inventoryResult.error };

  return { ok: true };
}

export async function deleteCatalogProduct(
  productId: string
): Promise<{ ok: true } | { error: string; status?: number }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", status: 503 };
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: product, error: prodErr } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id, status")
    .eq("id", productId)
    .maybeSingle();

  if (prodErr || !product) {
    return { error: "Product not found.", status: 404 };
  }

  const prod = product as { id: string; status: string };
  if (!DELETABLE_CATALOG_PRODUCT_STATUSES.has(prod.status)) {
    return { error: `Product status "${prod.status}" cannot be deleted.`, status: 409 };
  }

  const purge = await purgeCatalogProductDependencies(supabase, productId);
  if ("error" in purge) {
    return { error: purge.error, status: 409 };
  }

  const { error: delErr } = await supabase.schema("catalog_v2").from("catalog_products").delete().eq("id", productId);
  if (delErr) {
    return { error: delErr.message, status: 500 };
  }

  await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .update({ review_status: "dismissed", created_catalog_product_id: null })
    .eq("created_catalog_product_id", productId)
    .eq("review_status", "converted_to_draft");

  return { ok: true };
}

/** @deprecated Use deleteCatalogProduct */
export const deleteCatalogDraftProduct = deleteCatalogProduct;

export type BulkDeleteProductsResult = {
  deleted: string[];
  failed: Array<{ productId: string; error: string }>;
};

/** @deprecated Use BulkDeleteProductsResult */
export type BulkDeleteDraftResult = BulkDeleteProductsResult;

export async function deleteCatalogProducts(
  productIds: string[]
): Promise<BulkDeleteProductsResult | { error: string; status?: number }> {
  const unique = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { error: "No product ids provided.", status: 400 };
  }
  if (unique.length > 100) {
    return { error: "Too many products (max 100 per request).", status: 400 };
  }

  const deleted: string[] = [];
  const failed: Array<{ productId: string; error: string }> = [];

  for (const productId of unique) {
    const res = await deleteCatalogProduct(productId);
    if ("error" in res) {
      failed.push({ productId, error: res.error });
    } else {
      deleted.push(productId);
    }
  }

  return { deleted, failed };
}

/** @deprecated Use deleteCatalogProducts */
export const deleteCatalogDraftProducts = deleteCatalogProducts;


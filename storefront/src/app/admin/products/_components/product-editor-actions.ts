"use server";

import { getAdminUser } from "@/lib/admin/get-admin-user";
import { insertCatalogProduct, updateCatalogProduct, type ProductWriteInput } from "@/lib/admin/product-write";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";
import type { CommercePackagingV1 } from "@commerce-packaging/types";
import { normalizeCommercePackaging } from "@commerce-packaging/labels";

function parseAttributes(body: Record<string, unknown>): Record<string, string | string[]> {
  const raw = body.attributes;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      out[k] = v.map(String).filter(Boolean);
    } else if (typeof v === "string" && v.trim()) {
      out[k] = v.trim();
    }
  }
  return out;
}

function parseProductWrite(body: Record<string, unknown>): { ok: true; value: ProductWriteInput } | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  const brandName = typeof body.brand_name === "string" ? body.brand_name : "";
  const categoryId = typeof body.category_id === "string" ? body.category_id.trim() : "";
  if (!categoryId) return { ok: false, error: "category_id is required" };
  const description = typeof body.description === "string" ? body.description : "";
  const primaryImageUrl = typeof body.primary_image_url === "string" ? body.primary_image_url : "";
  const statusRaw = typeof body.status === "string" ? body.status.trim() : "draft";
  const status = statusRaw === "active" || statusRaw === "published" ? "active" : "draft";
  const quoteOnly = body.quote_only === true;

  let attributes = parseAttributes(body);
  if (Object.keys(attributes).length === 0) {
    const legacy: Record<string, string> = {};
    if (typeof body.material === "string" && body.material.trim()) legacy.material = body.material.trim();
    if (typeof body.color === "string" && body.color.trim()) legacy.color = body.color.trim();
    const mil = typeof body.mil_thickness === "string" ? body.mil_thickness : "";
    if (mil.trim()) legacy.thickness_mil = mil.trim();
    attributes = legacy;
  }

  const rawVariants = body.variants;
  const variants: ProductWriteInput["variants"] = [];
  if (Array.isArray(rawVariants)) {
    for (const rv of rawVariants) {
      if (!rv || typeof rv !== "object") continue;
      const o = rv as Record<string, unknown>;
      variants.push({
        id: typeof o.id === "string" ? o.id : undefined,
        sizeCode: typeof o.size_code === "string" ? o.size_code : "",
        variantSku: typeof o.variant_sku === "string" ? o.variant_sku : "",
        listPrice: typeof o.list_price === "string" ? o.list_price : typeof o.list_price === "number" ? String(o.list_price) : "",
        manufacturerSku: typeof o.manufacturer_sku === "string" ? o.manufacturer_sku : null,
        manufacturerSkuSource:
          o.manufacturer_sku_source === "imported" ||
          o.manufacturer_sku_source === "derived" ||
          o.manufacturer_sku_source === "manual" ||
          o.manufacturer_sku_source === "missing"
            ? o.manufacturer_sku_source
            : undefined,
        manufacturerSkuNeedsReview: o.manufacturer_sku_needs_review === true,
      });
    }
  }

  let commercePackaging: CommercePackagingV1 | null = null;
  const cpRaw = body.commerce_packaging;
  if (cpRaw && typeof cpRaw === "object" && !Array.isArray(cpRaw)) {
    commercePackaging = normalizeCommercePackaging(cpRaw as CommercePackagingV1);
  }

  const internalSku = typeof body.internal_sku === "string" ? body.internal_sku.trim() : "";

  return {
    ok: true,
    value: {
      name,
      brandName,
      categoryId,
      description,
      primaryImageUrl,
      status,
      quoteOnly,
      variants,
      attributes,
      commercePackaging,
      internalSku: internalSku || null,
    },
  };
}

export async function adminCreateProductAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await getAdminUser())) return { ok: false, error: "Unauthorized" };

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { ok: false, error: "Missing payload" };
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Invalid JSON payload" };
  }
  const parsed = parseProductWrite(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const res = await insertCatalogProduct(parsed.value);
  if ("error" in res) return { ok: false, error: res.error };
  return { ok: true, id: res.id };
}

export async function adminUpdateProductAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getAdminUser())) return { ok: false, error: "Unauthorized" };

  const productId = typeof formData.get("product_id") === "string" ? String(formData.get("product_id")).trim() : "";
  if (!ADMIN_PRODUCT_UUID_RE.test(productId)) return { ok: false, error: "Invalid product id" };

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { ok: false, error: "Missing payload" };
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Invalid JSON payload" };
  }
  const parsed = parseProductWrite(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const res = await updateCatalogProduct(productId, parsed.value);
  if ("error" in res) return { ok: false, error: res.error };
  return { ok: true };
}

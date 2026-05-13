"use server";

import { getAdminUser } from "@/lib/admin/get-admin-user";
import { insertCatalogProduct, updateCatalogProduct, type ProductWriteInput } from "@/lib/admin/product-write";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";

function parseProductWrite(body: Record<string, unknown>): { ok: true; value: ProductWriteInput } | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  const brandName = typeof body.brand_name === "string" ? body.brand_name : "";
  const categoryId = typeof body.category_id === "string" ? body.category_id.trim() : "";
  if (!categoryId) return { ok: false, error: "category_id is required" };
  const material = typeof body.material === "string" ? body.material : "";
  const color = typeof body.color === "string" ? body.color : "";
  const milThickness = typeof body.mil_thickness === "string" ? body.mil_thickness : "";
  const casePack = typeof body.case_pack === "string" ? body.case_pack : "";
  const description = typeof body.description === "string" ? body.description : "";
  const primaryImageUrl = typeof body.primary_image_url === "string" ? body.primary_image_url : "";
  const statusRaw = typeof body.status === "string" ? body.status.trim() : "draft";
  const status = statusRaw === "active" || statusRaw === "published" ? "active" : "draft";
  const quoteOnly = body.quote_only === true;
  const rawVariants = body.variants;
  const variants: ProductWriteInput["variants"] = [];
  if (Array.isArray(rawVariants)) {
    for (const rv of rawVariants) {
      if (!rv || typeof rv !== "object") continue;
      const o = rv as Record<string, unknown>;
      variants.push({
        sizeCode: typeof o.size_code === "string" ? o.size_code : "",
        variantSku: typeof o.variant_sku === "string" ? o.variant_sku : "",
        listPrice: typeof o.list_price === "string" ? o.list_price : typeof o.list_price === "number" ? String(o.list_price) : "",
      });
    }
  }
  return {
    ok: true,
    value: {
      name,
      brandName,
      categoryId,
      material,
      color,
      milThickness,
      casePack,
      description,
      primaryImageUrl,
      status,
      quoteOnly,
      variants,
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

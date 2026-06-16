import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";
import { deleteCatalogProducts } from "@/lib/admin/product-write";
import { parseJsonBody } from "@/lib/admin/products-import-proxy";

export const dynamic = "force-dynamic";

/** Permanently deletes multiple catalog products (draft, active, or archived). */
export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody<{ product_ids?: unknown }>(request);
  if (!parsed.ok) return parsed.response;

  const raw = parsed.value.product_ids;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "product_ids must be an array" }, { status: 400 });
  }

  const productIds = raw
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => ADMIN_PRODUCT_UUID_RE.test(id));

  if (productIds.length === 0) {
    return NextResponse.json({ error: "No valid product ids provided." }, { status: 400 });
  }

  const res = await deleteCatalogProducts(productIds);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
  }

  return NextResponse.json(res, { status: 200 });
}

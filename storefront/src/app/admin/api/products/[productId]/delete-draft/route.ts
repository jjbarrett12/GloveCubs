import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";
import { deleteCatalogProduct } from "@/lib/admin/product-write";

export const dynamic = "force-dynamic";

/** Permanently deletes a catalog product (draft, active, or archived). */
export async function POST(_request: Request, { params }: { params: { productId: string } }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = params.productId?.trim();
  if (!productId || !ADMIN_PRODUCT_UUID_RE.test(productId)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }

  const res = await deleteCatalogProduct(productId);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

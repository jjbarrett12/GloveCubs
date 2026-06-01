import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";
import { fetchCategoryAttributeDefinitions } from "@/lib/admin/product-attribute-sync";

export async function GET(
  req: Request,
  { params }: { params: { productId: string } }
) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ADMIN_PRODUCT_UUID_RE.test(params.productId)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }
  const url = new URL(req.url);
  const categoryId = url.searchParams.get("category_id")?.trim() ?? "";
  if (!categoryId) {
    return NextResponse.json({ definitions: [] });
  }
  const definitions = await fetchCategoryAttributeDefinitions(categoryId);
  return NextResponse.json({ definitions });
}

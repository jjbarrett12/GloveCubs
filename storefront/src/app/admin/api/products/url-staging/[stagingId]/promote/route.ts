import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { parseJsonBody, nonEmptyString } from "@/lib/admin/products-import-proxy";
import { promoteStagingToDraftProduct, type ProductWriteInput } from "@/lib/admin/product-write";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { stagingId: string } }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const stagingId = params.stagingId?.trim();
  if (!stagingId) return NextResponse.json({ error: "stagingId required" }, { status: 400 });

  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const categoryId = nonEmptyString(body.category_id, 80);
  if (!categoryId.ok) return NextResponse.json({ error: `category_id ${categoryId.reason}` }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const { data: row, error } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("id, review_status, product_page_url, image_url, extracted")
    .eq("id", stagingId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Staging row not found." }, { status: 404 });
  }
  const st = row as {
    review_status: string;
    product_page_url: string;
    image_url: string | null;
    extracted: Record<string, unknown>;
  };
  if (st.review_status !== "needs_review") {
    return NextResponse.json({ error: "Staging row is not awaiting review." }, { status: 409 });
  }

  const ex = st.extracted ?? {};
  const nameFromBody = typeof body.name === "string" ? body.name.trim() : "";
  const name =
    nameFromBody ||
    String(ex.suggested_name ?? ex.page_title ?? "Imported listing")
      .trim()
      .slice(0, 300) ||
    "Imported listing";

  const brandName = typeof body.brand_name === "string" ? body.brand_name : "";
  const material = typeof body.material === "string" ? body.material : "";
  const color = typeof body.color === "string" ? body.color : "";
  const milThickness = typeof body.mil_thickness === "string" ? body.mil_thickness : "";
  const casePack = typeof body.case_pack === "string" ? body.case_pack : "";
  const descriptionExtra = typeof body.description === "string" ? body.description : "";
  const baseDesc = String(ex.suggested_description ?? "").trim();
  const description = [baseDesc, descriptionExtra, `Source: ${st.product_page_url}`].filter(Boolean).join("\n\n").slice(0, 12000);

  const primaryFromBody = typeof body.primary_image_url === "string" ? body.primary_image_url.trim() : "";
  const primaryImageUrl =
    primaryFromBody || (st.image_url ?? "").trim() || String(ex.suggested_image_from_page ?? "").trim();

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

  const merged: ProductWriteInput = {
    name,
    brandName,
    categoryId: categoryId.value,
    material,
    color,
    milThickness,
    casePack,
    description,
    primaryImageUrl,
    status: "draft",
    quoteOnly: true,
    variants: variants.length ? variants : [{ sizeCode: "OS", variantSku: "", listPrice: "" }],
  };

  const res = await promoteStagingToDraftProduct(stagingId, merged, admin.id);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ productId: res.productId }, { status: 201 });
}

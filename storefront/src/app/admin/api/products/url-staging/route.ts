import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { listClipboardStaging, createClipboardStaging } from "@/lib/admin/clipboard-url-staging";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await listClipboardStaging(100);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const productPageUrl = typeof b.product_page_url === "string" ? b.product_page_url : "";
  const imageUrl = typeof b.image_url === "string" ? b.image_url : null;

  const res = await createClipboardStaging({
    productPageUrl,
    imageUrl: imageUrl?.trim() ? imageUrl : null,
    createdBy: admin.id,
  });
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json(res, { status: 201 });
}

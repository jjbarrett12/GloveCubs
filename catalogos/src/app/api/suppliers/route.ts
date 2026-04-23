/**
 * GET /api/suppliers — list all suppliers (catalogos.suppliers).
 * POST /api/suppliers — create supplier. Body: { name, slug, settings?, is_active? }.
 */

import { NextResponse } from "next/server";
import { listSuppliers, createSupplier } from "@/lib/catalogos/suppliers";

export async function GET() {
  try {
    const suppliers = await listSuppliers(false);
    return NextResponse.json(suppliers);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = body?.name?.toString()?.trim();
    const slug = body?.slug?.toString()?.trim();
    if (!name || !slug) {
      return NextResponse.json({ error: "name and slug required" }, { status: 400 });
    }
    const { id } = await createSupplier({
      name,
      slug,
      settings: body.settings ?? {},
      is_active: body.is_active !== false,
    });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

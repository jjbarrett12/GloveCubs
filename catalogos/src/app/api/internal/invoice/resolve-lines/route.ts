/**
 * Internal: resolve invoice line rows via CatalogOS normalization + matchToMaster ONLY.
 * POST /api/internal/invoice/resolve-lines
 * Auth: x-api-key or Authorization Bearer = INTERNAL_API_KEY (same pattern as /api/internal/notifications).
 * Does NOT write supplier_products_* or any ingestion staging tables.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveOneInvoiceLine } from "@/lib/invoice/resolve-one-line";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "dev-internal-key";

function validateApiKey(request: NextRequest): boolean {
  const apiKey =
    request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.NODE_ENV === "development") return true;
  return apiKey === INTERNAL_API_KEY;
}

const bodySchema = z.object({
  lines: z.array(
    z.object({
      line_id: z.string().uuid(),
      row: z.record(z.string(), z.any()),
    })
  ),
});

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const results = [];
  for (const line of parsed.data.lines) {
    results.push(await resolveOneInvoiceLine(line.line_id, line.row));
  }

  return NextResponse.json({ ok: true, results });
}

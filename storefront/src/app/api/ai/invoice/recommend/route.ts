import { NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * Public AI invoice "cheaper or better" recommendations are disabled.
 * Savings must use governed spec compatibility + deterministic pricing (Phase 2+).
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Invoice AI recommendations are disabled. Use invoice intake and governed review.",
      code: "invoice_recommend_disabled",
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Invoice AI recommendations are disabled.", code: "invoice_recommend_disabled" },
    { status: 410 },
  );
}

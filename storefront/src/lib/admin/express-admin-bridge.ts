import jwt from "jsonwebtoken";
import { buildExpressCommerceApiUrl } from "@/lib/api";

const MINT_TTL = "5m";

export type AdminOperator = { id: string; email: string | null };

export type ExpressBridgeError = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  body?: unknown;
};

export type ExpressBridgeOk<T = unknown> = { ok: true; status: number; data: T };

/**
 * Server-only bridge: mint a short-lived Express JWT for the Supabase operator (same `id` as `admin_users`).
 * Requires `JWT_SECRET` (must match Express `server.js`) and `NEXT_PUBLIC_GLOVECUBS_API`.
 */
export function mintExpressAdminJwt(operator: AdminOperator): { token: string } | { error: string } {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    return { error: "JWT_SECRET is not configured on the storefront server" };
  }
  const token = jwt.sign(
    {
      id: operator.id,
      email: operator.email ?? undefined,
      approved: true,
      active_company_id: null,
    },
    secret,
    { expiresIn: MINT_TTL, subject: operator.id },
  );
  return { token };
}

export async function expressAdminFetch(
  operator: AdminOperator,
  pathname: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<ExpressBridgeOk | ExpressBridgeError> {
  const minted = mintExpressAdminJwt(operator);
  if ("error" in minted) {
    return { ok: false, status: 503, error: minted.error };
  }

  const base = buildExpressCommerceApiUrl(pathname);
  if (!base.startsWith("http")) {
    return {
      ok: false,
      status: 503,
      error: "NEXT_PUBLIC_GLOVECUBS_API is not configured (Express API origin required for admin mutations)",
    };
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${minted.token}`);
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(base, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Express API request failed";
    return { ok: false, status: 502, error: msg };
  }

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { error: text.slice(0, 500) };
    }
  }

  if (!res.ok) {
    const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const errMsg =
      typeof obj.error === "string"
        ? obj.error
        : typeof obj.message === "string"
          ? obj.message
          : res.statusText || "Express admin request failed";
    const code = typeof obj.code === "string" ? obj.code : undefined;
    return { ok: false, status: res.status, error: errMsg, code, body: parsed };
  }

  return { ok: true, status: res.status, data: parsed };
}

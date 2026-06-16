/**
 * Staging buyer portal browser smoke (Playwright + Supabase session).
 * Usage:
 *   FEATURE_GC_ORDER_HISTORY=1 FEATURE_GC_REORDER_TO_QUOTE=1 npx tsx scripts/portal-smoke-browser.ts
 *
 * Auth (one required):
 *   GC_PORTAL_SMOKE_BUYER_PASSWORD — buyer password (preferred)
 *   or magic-link via service role when password unset
 *
 * Does not print secrets.
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

function parseBaseUrl(): string {
  const argIdx = process.argv.findIndex((a) => a === "--base-url" || a.startsWith("--base-url="));
  if (argIdx >= 0) {
    const raw = process.argv[argIdx];
    if (raw.includes("=")) return raw.split("=").slice(1).join("=").trim();
    const next = process.argv[argIdx + 1];
    if (next) return next.trim();
  }
  return process.env.PORTAL_SMOKE_BASE_URL?.trim() || "http://localhost:3005";
}

const BASE = parseBaseUrl();

function resolveVercelProtectionBypass(baseUrl: string): string {
  const fromEnv = process.env.PORTAL_SMOKE_VERCEL_PROTECTION_BYPASS?.trim();
  if (fromEnv) return fromEnv;
  if (!baseUrl.includes(".vercel.app")) return "";
  const deploymentUrl = new URL(baseUrl).origin;
  const repoRoot = join(__dirname, "../..");
  const r = spawnSync(
    "vercel",
    ["curl", "/account", "--deployment", deploymentUrl, "-d"],
    { encoding: "utf8", cwd: repoRoot, shell: process.platform === "win32" }
  );
  const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = combined.match(/x-vercel-protection-bypass:\s*(\S+)/);
  return m?.[1]?.replace(/"/g, "") ?? "";
}

const VERCEL_BYPASS = resolveVercelProtectionBypass(BASE);
const redact = (id) => (id ? `${id.slice(0, 8)}…${id.slice(-4)}` : null);

function envTruthy(v) {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

async function resolveBuyerSession(sb) {
  const { data: members } = await sb
    .schema("gc_commerce")
    .from("company_members")
    .select("user_id, company_id, role")
    .limit(1);
  const member = members?.[0];
  if (!member) throw new Error("no_company_members");

  const { data: userRes } = await sb.auth.admin.getUserById(member.user_id);
  const email = userRes?.user?.email;
  if (!email) throw new Error("buyer_email_missing");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("supabase_public_env_missing");

  const password =
    process.env.GC_PORTAL_SMOKE_BUYER_PASSWORD?.trim() ||
    process.env.GC_LOCAL_AUTH_BOOTSTRAP_PASSWORD?.trim() ||
    "";

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (password) {
    const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(`buyer_sign_in_failed:${error?.message ?? "no_session"}`);
    return {
      member,
      emailRedacted: `${email.slice(0, 2)}***${email.slice(email.indexOf("@"))}`,
      session: data.session,
      authMethod: "password",
    };
  }

  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(`buyer_magic_link_failed:${linkErr?.message ?? "no_token"}`);
  }

  const verifyUrl = `${url}/auth/v1/verify?token=${linkData.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(`${BASE}/account`)}`;
  const verifyRes = await fetch(verifyUrl, { redirect: "manual" });
  const location = verifyRes.headers.get("location") ?? "";
  const tokenMatch = location.match(/access_token=([^&]+)/);
  const refreshMatch = location.match(/refresh_token=([^&]+)/);
  if (!tokenMatch) throw new Error("buyer_magic_link_no_access_token");

  const access_token = decodeURIComponent(tokenMatch[1]);
  const refresh_token = refreshMatch ? decodeURIComponent(refreshMatch[1]) : undefined;
  const { data: sessData, error: sessErr } = await anonClient.auth.setSession({
    access_token,
    refresh_token: refresh_token ?? "",
  });
  if (sessErr || !sessData.session) {
    throw new Error(`buyer_session_set_failed:${sessErr?.message ?? "no_session"}`);
  }

  return {
    member,
    emailRedacted: `${email.slice(0, 2)}***${email.slice(email.indexOf("@"))}`,
    session: sessData.session,
    authMethod: "magiclink",
  };
}

function supabaseCookieProjectRef(url) {
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return m ? m[1] : "local";
  } catch {
    return "local";
  }
}

function browserContextOptions() {
  if (!VERCEL_BYPASS) return {};
  return { extraHTTPHeaders: { "x-vercel-protection-bypass": VERCEL_BYPASS } };
}

async function injectSupabaseCookies(context, session) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  if (!url) throw new Error("supabase_url_missing");
  const ref = supabaseCookieProjectRef(url);
  const baseUrl = new URL(BASE);
  const cookieBase = {
    domain: baseUrl.hostname,
    path: "/",
    httpOnly: false,
    secure: baseUrl.protocol === "https:",
    sameSite: "Lax" as const,
  };
  await context.addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      }),
      ...cookieBase,
    },
  ]);
}

async function main() {
  const flagsOn =
    envTruthy(process.env.FEATURE_GC_ORDER_HISTORY) || envTruthy(process.env.FEATURE_GC_REORDER_TO_QUOTE);
  const report = {
    flags: {
      FEATURE_GC_ORDER_HISTORY: process.env.FEATURE_GC_ORDER_HISTORY ?? "(unset)",
      FEATURE_GC_REORDER_TO_QUOTE: process.env.FEATURE_GC_REORDER_TO_QUOTE ?? "(unset)",
      effectiveForSmoke: flagsOn,
    },
    baseUrl: BASE.replace(/^(https:\/\/)[^./]+(\.vercel\.app)/, "$1storefront-…$2"),
    vercelProtectionBypass: VERCEL_BYPASS ? "configured" : "not_used",
  };

  const { getSupabaseAdmin } = await import("../src/lib/supabase/server");
  const sb = getSupabaseAdmin();

  let buyer;
  try {
    buyer = await resolveBuyerSession(sb);
    report.buyer = {
      userId: redact(buyer.member.user_id),
      companyId: redact(buyer.member.company_id),
      email: buyer.emailRedacted,
      authMethod: buyer.authMethod,
    };
  } catch (e) {
    report.error = String(e instanceof Error ? e.message : e);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (process.env.PORTAL_SMOKE_FLAGS_OFF_ONLY === "1") {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(browserContextOptions());
    await injectSupabaseCookies(context, buyer.session);
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/account/orders`, { waitUntil: "networkidle" });
      const html = await page.content();
      report.flagsOffShell = {
        path: page.url().replace(BASE, ""),
        showsUnavailableShell: /not available yet|order history is not available/i.test(html),
        crashed: false,
      };
      report.overall = report.flagsOffShell.showsUnavailableShell ? "STAGING PASS (flags off shell)" : "FAIL";
    } finally {
      await browser.close();
    }
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.flagsOffShell?.showsUnavailableShell ? 0 : 1);
  }

  const { data: sameCompanyOrder } = await sb
    .schema("gc_commerce")
    .from("orders")
    .select("id, order_number, company_id")
    .eq("company_id", buyer.member.company_id)
    .order("placed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  report.smokeData = {
    sameCompanyOrderId: redact(sameCompanyOrder?.id),
    sameCompanyOrderNumber: sameCompanyOrder?.order_number ?? null,
  };

  const { data: foreignCompanies } = await sb
    .schema("gc_commerce")
    .from("companies")
    .select("id, trade_name")
    .neq("id", buyer.member.company_id)
    .limit(5);
  let foreignOrderId = null;
  for (const fc of foreignCompanies ?? []) {
    const { data: fo } = await sb
      .schema("gc_commerce")
      .from("orders")
      .select("id, order_number")
      .eq("company_id", fc.id)
      .limit(1)
      .maybeSingle();
    if (fo?.id) {
      foreignOrderId = fo.id;
      report.smokeData.foreignCompanyId = redact(fc.id);
      report.smokeData.foreignOrderId = redact(fo.id);
      report.smokeData.foreignOrderNumber = fo.order_number;
      break;
    }
  }
  if (!foreignOrderId) {
    report.smokeData.foreignOrderId = null;
    report.smokeData.foreignOrderNote = "no_foreign_company_order_in_db";
  }

  if (sameCompanyOrder?.id) {
    const { buildReorderQuotePayload } = await import("../src/lib/account/reorder-to-quote-read-model");
    const reorderApi = await buildReorderQuotePayload(sb, buyer.member.company_id, sameCompanyOrder.id, {});
    report.reorderApi = {
      error: reorderApi.error,
      available: reorderApi.payload?.summary.available ?? 0,
      blocked: reorderApi.payload?.summary.blocked ?? 0,
      blockedReasons: (reorderApi.payload?.blockedLines ?? []).slice(0, 3).map((b) => ({
        status: b.status,
        explanation: b.explanation.slice(0, 120),
      })),
    };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(browserContextOptions());
  await injectSupabaseCookies(context, buyer.session);
  const page = await context.newPage();

  try {
    if (!flagsOn) {
      report.flagsOffShell = { skipped: "flags_not_enabled_in_env" };
    } else {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
      const accountHtml = await page.content();
      const accountUrl = page.url();
      report.account = {
        httpStatusPath: accountUrl.replace(BASE, ""),
        redirectedToLogin: accountUrl.includes("/login"),
        hasOrderRecordsLink: /order records|\/account\/orders/i.test(accountHtml),
        hasStock: /in stock|inventory available|qty available/i.test(accountHtml),
      };

      await page.goto(`${BASE}/account/orders`, { waitUntil: "networkidle" });
      const ordersHtml = await page.content();
      report.orderList = {
        httpStatusPath: page.url().replace(BASE, ""),
        showsUnavailableShell: /not available yet|order history is not available/i.test(ordersHtml),
        showsOrderTableOrEmpty: /order records|no orders yet|order number|R6ADD|LEGACY/i.test(ordersHtml),
        hasStock: /in stock|inventory available|qty available/i.test(ordersHtml),
      };

      if (sameCompanyOrder?.id) {
        await page.goto(`${BASE}/account/orders/${sameCompanyOrder.id}`, { waitUntil: "networkidle" });
        const detailHtml = await page.content();
        report.orderDetail = {
          orderId: redact(sameCompanyOrder.id),
          httpStatusPath: page.url().replace(BASE, ""),
          is404: /not found|404/i.test(detailHtml) && page.url().includes(sameCompanyOrder.id) === false,
          hasReadOnlyLines: /line|quantity|subtotal|total|shipped/i.test(detailHtml),
          hasReorderCta: /prepare selected lines|build repeat quote/i.test(detailHtml),
          hasStock: /in stock|inventory available|qty available/i.test(detailHtml),
          hasCheckout:
            /checkout|pay now|credit card|stripe/i.test(detailHtml) &&
            !/not checkout|not a checkout/i.test(detailHtml),
        };

        const prepareBtn = page.getByRole("button", { name: /prepare selected lines/i });
        if (await prepareBtn.isVisible().catch(() => false)) {
          await prepareBtn.click();
          await page.waitForTimeout(2000);
          const addBtn = page.getByRole("button", { name: /add .* to quote cart/i });
          const addToCartVisible = await addBtn.isVisible().catch(() => false);
          const blockedCopyVisible = /need review|unavailable|cannot pick one safely/i.test(await page.content());
          if (addToCartVisible) {
            await addBtn.click();
            await page.waitForTimeout(1000);
          }
          await page.goto(`${BASE}/quote-cart`, { waitUntil: "networkidle" });
          const cartHtml = await page.content();
          const cartItems = await page.evaluate(() => {
            try {
              const raw = localStorage.getItem("glovecubs-quote-cart-v1");
              return raw ? JSON.parse(raw) : null;
            } catch {
              return null;
            }
          });
          report.reorderQuoteCart = {
            prepareClicked: true,
            addToCartVisible,
            blockedCopyVisible,
            cartItemCount: cartItems?.items?.length ?? 0,
            hasQuoteCopy: /quote|review|request pricing/i.test(cartHtml),
            hasHonestNoCheckoutCopy: /not a checkout|not checkout/i.test(cartHtml),
            hasSelfServePaymentCta: /pay now|credit card|complete purchase|place order/i.test(cartHtml),
            hasStockCopy: /in stock|inventory available/i.test(cartHtml),
          };
        } else {
          report.reorderQuoteCart = { skipped: "prepare_selected_lines_not_visible" };
        }
      }

      const aclTarget =
        foreignOrderId ??
        "00000000-0000-4000-8000-000000000099";
      await page.goto(`${BASE}/account/orders/${aclTarget}`, { waitUntil: "networkidle" });
      const aclHtml = await page.content();
      const aclUrl = page.url();
      const showsNotFound = /not found|404|couldn't find|could not find/i.test(aclHtml);
      report.acl = {
        targetOrderId: redact(aclTarget),
        usedRealForeignOrder: Boolean(foreignOrderId),
        finalPath: aclUrl.replace(BASE, ""),
        showsNotFound,
        leakedForeignOrderNumber:
          foreignOrderId && report.smokeData.foreignOrderNumber
            ? aclHtml.includes(report.smokeData.foreignOrderNumber)
            : false,
        leakedBuyerOrderNumber:
          sameCompanyOrder?.order_number && !showsNotFound
            ? aclHtml.includes(sameCompanyOrder.order_number)
            : false,
      };
    }
  } finally {
    await browser.close();
  }

  report.overall = deriveOverall(report);
  console.log(JSON.stringify(report, null, 2));
  if (report.overall !== "STAGING PASS" && report.overall !== "PARTIAL PASS") process.exit(1);
}

function deriveOverall(report) {
  if (report.error) return "FAIL";
  if (!report.flags.effectiveForSmoke) return "NOT RUN — missing operator credentials/data";
  const a = report.account;
  const ol = report.orderList;
  const od = report.orderDetail;
  const acl = report.acl;
  if (!a || a.redirectedToLogin) return "FAIL";
  if (!ol || ol.showsUnavailableShell) return "FAIL";
  if (!od || od.is404) return "FAIL";
  if (!acl?.showsNotFound || acl.leakedForeignOrderNumber) return "FAIL";
  const rq = report.reorderQuoteCart;
  const corePass =
    a.hasOrderRecordsLink &&
    !a.hasStock &&
    ol.showsOrderTableOrEmpty &&
    !ol.hasStock &&
    od.hasReadOnlyLines &&
    !od.hasCheckout &&
    !od.hasStock &&
    acl.showsNotFound;
  if (!corePass) return "FAIL";
  if (rq?.prepareClicked && rq.blockedCopyVisible && rq.cartItemCount === 0) {
    return "PARTIAL PASS";
  }
  if (rq?.cartItemCount > 0 && rq.hasHonestNoCheckoutCopy) return "STAGING PASS";
  if (rq?.prepareClicked) return "PARTIAL PASS";
  return "PARTIAL PASS";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

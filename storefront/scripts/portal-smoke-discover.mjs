/**
 * Read-only portal smoke data discovery (redacted output, no secrets).
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const redact = (id) => (id ? `${id.slice(0, 8)}…${id.slice(-4)}` : null);
const redactEmail = (email) => {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "(redacted)";
  return `${email.slice(0, 2)}***${email.slice(at)}`;
};

async function main() {
  const { getSupabaseAdmin } = await import("../src/lib/supabase/server");
  const sb = getSupabaseAdmin();

  const { data: members } = await sb
    .schema("gc_commerce")
    .from("company_members")
    .select("user_id, company_id, role");
  const { data: companies, error: companiesErr } = await sb
    .schema("gc_commerce")
    .from("companies")
    .select("id, trade_name");

  const memberUserIds = [...new Set((members ?? []).map((m) => m.user_id))];
  const buyerUsers = [];
  for (const uid of memberUserIds.slice(0, 5)) {
    const { data: u } = await sb.auth.admin.getUserById(uid);
    if (u?.user?.email) {
      buyerUsers.push({ userId: redact(uid), email: redactEmail(u.user.email) });
    }
  }

  const companyIds = [...new Set((members ?? []).map((m) => m.company_id))];
  const ordersByCompany = {};
  for (const cid of companyIds) {
    const { data: orders } = await sb
      .schema("gc_commerce")
      .from("orders")
      .select("id, order_number, company_id, status, total_minor")
      .eq("company_id", cid)
      .order("placed_at", { ascending: false })
      .limit(3);
    ordersByCompany[redact(cid)] = (orders ?? []).map((o) => ({
      id: redact(o.id),
      order_number: o.order_number,
      status: o.status,
    }));
  }

  const memberCompanySet = new Set(companyIds);
  const foreignOrders = [];
  for (const fc of (companies ?? []).filter((c) => !memberCompanySet.has(c.id))) {
    const { data: fo } = await sb
      .schema("gc_commerce")
      .from("orders")
      .select("id, order_number, company_id")
      .eq("company_id", fc.id)
      .limit(1);
    if (fo?.length) {
      foreignOrders.push({
        companyId: redact(fc.id),
        companyName: fc.trade_name ?? fc.name,
        orderId: redact(fo[0].id),
        orderNumber: fo[0].order_number,
      });
    }
  }

  let reorderCheck = null;
  const firstMember = members?.[0];
  if (firstMember) {
    const { data: ord } = await sb
      .schema("gc_commerce")
      .from("orders")
      .select("id, order_number")
      .eq("company_id", firstMember.company_id)
      .order("placed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ord) {
      const { data: lines } = await sb
        .schema("gc_commerce")
        .from("order_lines")
        .select("id, sellable_product_id, product_snapshot, quantity")
        .eq("order_id", ord.id);
      const lineChecks = [];
      for (const ln of lines ?? []) {
        const { data: sellable } = await sb
          .schema("gc_commerce")
          .from("sellable_products")
          .select("id, catalog_product_id, sku, is_active")
          .eq("id", ln.sellable_product_id)
          .maybeSingle();
        let catalogProduct = null;
        let variants = 0;
        if (sellable?.catalog_product_id) {
          const { data: cp } = await sb
            .schema("catalog_v2")
            .from("catalog_products")
            .select("id, status, slug")
            .eq("id", sellable.catalog_product_id)
            .maybeSingle();
          catalogProduct = cp ? { id: redact(cp.id), status: cp.status, slug: cp.slug } : null;
          const { count } = await sb
            .schema("catalog_v2")
            .from("catalog_variants")
            .select("id", { count: "exact", head: true })
            .eq("catalog_product_id", sellable.catalog_product_id)
            .eq("is_active", true);
          variants = count ?? 0;
        }
        lineChecks.push({
          lineId: redact(ln.id),
          sellableActive: sellable?.is_active ?? null,
          catalogProduct,
          activeVariants: variants,
        });
      }
      reorderCheck = {
        orderId: redact(ord.id),
        orderNumber: ord.order_number,
        lineCount: lines?.length ?? 0,
        lineChecks,
      };
    }
  }

  console.log(
    JSON.stringify(
      {
        membershipCount: members?.length ?? 0,
        companyCount: companies?.length ?? 0,
        companiesError: companiesErr?.message ?? null,
        buyerUsers,
        ordersByCompany,
        foreignOrders,
        foreignOrderAvailable: foreignOrders.length > 0,
        reorderCheck,
        flagsInEnv: {
          FEATURE_GC_ORDER_HISTORY: process.env.FEATURE_GC_ORDER_HISTORY ?? "(unset)",
          FEATURE_GC_REORDER_TO_QUOTE: process.env.FEATURE_GC_REORDER_TO_QUOTE ?? "(unset)",
        },
        buyerPasswordEnv: process.env.GC_PORTAL_SMOKE_BUYER_PASSWORD
          ? "(GC_PORTAL_SMOKE_BUYER_PASSWORD set)"
          : process.env.GC_LOCAL_AUTH_BOOTSTRAP_PASSWORD
            ? "(GC_LOCAL_AUTH_BOOTSTRAP_PASSWORD set)"
            : "(unset)",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

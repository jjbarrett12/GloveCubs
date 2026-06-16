/**
 * Ensure a foreign-company order exists for portal ACL smoke (idempotent).
 * Creates only when no order exists for a non-member company. Redacted stdout.
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const redact = (id) => (id ? `${id.slice(0, 8)}…${id.slice(-4)}` : null);

async function main() {
  const { getSupabaseAdmin } = await import("../src/lib/supabase/server");
  const sb = getSupabaseAdmin();

  const { data: member } = await sb
    .schema("gc_commerce")
    .from("company_members")
    .select("company_id")
    .limit(1)
    .maybeSingle();
  if (!member?.company_id) throw new Error("no_member_company");

  const { data: foreignCompanies } = await sb
    .schema("gc_commerce")
    .from("companies")
    .select("id, trade_name")
    .neq("id", member.company_id)
    .limit(1);
  const foreign = foreignCompanies?.[0];
  if (!foreign) throw new Error("no_foreign_company");

  const { data: existing } = await sb
    .schema("gc_commerce")
    .from("orders")
    .select("id, order_number")
    .eq("company_id", foreign.id)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    console.log(
      JSON.stringify({
        action: "exists",
        foreignCompanyId: redact(foreign.id),
        foreignOrderId: redact(existing.id),
        orderNumber: existing.order_number,
      })
    );
    return;
  }

  const { data: template } = await sb
    .schema("gc_commerce")
    .from("orders")
    .select("*")
    .eq("company_id", member.company_id)
    .order("placed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!template) throw new Error("no_template_order");

  const orderId = crypto.randomUUID();
  const orderNumber = `ACL-SMOKE-${Date.now()}`;
  const row = {
    id: orderId,
    company_id: foreign.id,
    order_number: orderNumber,
    status: template.status ?? "shipped",
    currency_code: template.currency_code ?? "USD",
    subtotal_minor: template.subtotal_minor ?? 1000,
    discount_minor: template.discount_minor ?? 0,
    shipping_minor: template.shipping_minor ?? 0,
    tax_minor: template.tax_minor ?? 0,
    total_minor: template.total_minor ?? 1000,
    placed_at: template.placed_at ?? new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: insErr } = await sb.schema("gc_commerce").from("orders").insert(row);
  if (insErr) throw insErr;

  console.log(
    JSON.stringify({
      action: "created",
      foreignCompanyId: redact(foreign.id),
      foreignOrderId: redact(orderId),
      orderNumber,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

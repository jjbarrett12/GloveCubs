import dotenv from 'dotenv';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(JSON.stringify({ ok: false, error: 'DATABASE_URL missing' }));
  process.exit(1);
}

function resolvePgUrl(raw) {
  const parsed = new URL(raw);
  const ref = parsed.hostname.replace(/^db\./, '').replace(/\.supabase\.co$/, '');
  const password = parsed.password;
  if (parsed.hostname.startsWith('db.') && parsed.port === '5432') {
    return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`;
  }
  return raw;
}

const pgUrl = resolvePgUrl(url);

const statements = [
  `REVOKE ALL ON FUNCTION public.admin_assign_po_line_variant_atomic(bigint, int, uuid, uuid) FROM PUBLIC`,
  `GRANT EXECUTE ON FUNCTION public.admin_assign_po_line_variant_atomic(bigint, int, uuid, uuid) TO service_role`,
  `REVOKE ALL ON FUNCTION public.admin_update_variant_fulfillment_atomic(uuid, uuid, text, text, boolean, int, text, text) FROM PUBLIC`,
  `GRANT EXECUTE ON FUNCTION public.admin_update_variant_fulfillment_atomic(uuid, uuid, text, text, boolean, int, text, text) TO service_role`,
  `REVOKE ALL ON FUNCTION public.admin_receive_purchase_order_shipment_atomic(bigint, uuid, jsonb, text, text, boolean) FROM PUBLIC`,
  `GRANT EXECUTE ON FUNCTION public.admin_receive_purchase_order_shipment_atomic(bigint, uuid, jsonb, text, text, boolean) TO service_role`,
  `REVOKE ALL ON FUNCTION public.admin_adjust_variant_inventory_atomic(uuid, uuid, int, text, text) FROM PUBLIC`,
  `GRANT EXECUTE ON FUNCTION public.admin_adjust_variant_inventory_atomic(uuid, uuid, int, text, text) TO service_role`,
  `REVOKE ALL ON FUNCTION public.gc_reserve_variant_stock_for_order_atomic(uuid, uuid, jsonb) FROM PUBLIC`,
  `GRANT EXECUTE ON FUNCTION public.gc_reserve_variant_stock_for_order_atomic(uuid, uuid, jsonb) TO service_role`,
  `COMMENT ON TABLE catalog_v2.variant_inventory IS 'Canonical GloveCubs warehouse stock (case units). public.inventory is legacy read-only compatibility only.'`,
];

const sql = postgres(pgUrl, { max: 1 });
try {
  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
  await sql.unsafe(
    `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261224120006') ON CONFLICT DO NOTHING`,
  );
  console.log(JSON.stringify({ ok: true, applied: statements.length }));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
} finally {
  await sql.end();
}

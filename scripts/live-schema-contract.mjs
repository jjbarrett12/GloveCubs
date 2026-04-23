/**
 * Read-only live Postgres contract for public.* (+ targeted auth checks).
 * Usage: node scripts/live-schema-contract.mjs
 * Requires DATABASE_URL or SUPABASE_DB_URL in .env (gitignored).
 */
import "dotenv/config";
import pg from "pg";

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Missing DATABASE_URL or SUPABASE_DB_URL");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  statement_timeout: 600000,
  query_timeout: 600000,
});
await client.connect();

const Q = {
  tables: `
    SELECT c.oid, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`,
  columns: `
    SELECT a.attname AS column_name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
           a.attnotnull AS not_null,
           pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
    WHERE a.attrelid = $1::oid AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum`,
  pk: `
    SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod) AS typ
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = $1::oid AND i.indisprimary
    ORDER BY array_position(i.indkey::int[], a.attnum)`,
  fks: `
    SELECT con.conname,
           att2.attname AS from_column,
           confrelid::regclass::text AS to_table,
           att.attname AS to_column,
           con.confdeltype, con.confupdtype,
           pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN pg_attribute att2 ON att2.attrelid = con.conrelid AND att2.attnum = ck.attnum
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord2) ON ck.ord = ord2
    JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = fk.attnum
    WHERE n.nspname = 'public' AND con.contype = 'f' AND con.conrelid = $1::oid`,
  indexes: `
    SELECT indexrelid::regclass::text AS index_name, pg_get_indexdef(indexrelid) AS def
    FROM pg_index
    WHERE indrelid = $1::oid AND NOT indisprimary`,
  constraints: `
    SELECT conname, contype::text, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = $1::oid
    ORDER BY contype, conname`,
};

function escIdent(s) {
  return '"' + String(s).replaceAll('"', '""') + '"';
}

async function tableRowCount(relname) {
  const r = await client.query(`SELECT COUNT(*)::bigint AS c FROM public.${escIdent(relname)}`);
  return BigInt(r.rows[0].c);
}

const out = [];
const log = (s) => out.push(s);

try {
  const { rows: tables } = await client.query(Q.tables);
  log("# SECTION 1: FULL PUBLIC TABLE INVENTORY\n");
  log("Query (table list): pg_catalog pg_class relkind='r', nspname='public'\n");

  for (const t of tables) {
    const oid = t.oid;
    const name = t.table_name;
    log(`## Table: public.${name}\n`);

    let count;
    try {
      count = await tableRowCount(name);
    } catch (e) {
      count = `ERROR: ${e.message}`;
    }
    log(`- row_count (query: SELECT COUNT(*) FROM public."${name.replace(/"/g, '""')}" ): ${count}\n`);

    const { rows: cols } = await client.query(Q.columns, [oid]);
    const { rows: pks } = await client.query(Q.pk, [oid]);
    log(
      `- primary_key (query: pg_index indisprimary): ${pks.length ? pks.map((p) => `${p.attname} (${p.typ})`).join(", ") : "(none)"}\n`
    );
    log("- columns (query: pg_attribute + format_type):\n");
    for (const c of cols) {
      const nullab = c.not_null ? "NOT NULL" : "NULL";
      const def = c.column_default != null ? c.column_default : "";
      log(`  - ${c.column_name}: ${c.data_type} | ${nullab} | default: ${def || "(none)"}\n`);
    }

    const { rows: fks } = await client.query(Q.fks, [oid]);
    log("- foreign_keys (query: pg_constraint contype=f):\n");
    if (!fks.length) log("  (none)\n");
    else
      for (const f of fks) {
        log(`  - ${f.conname}: ${f.from_column} -> ${f.to_table}.${f.to_column} | def: ${f.def}\n`);
      }

    const { rows: idxs } = await client.query(Q.indexes, [oid]);
    log("- indexes (query: pg_index + pg_get_indexdef, excl. PK):\n");
    if (!idxs.length) log("  (none)\n");
    else for (const i of idxs) log(`  - ${i.index_name}: ${i.def}\n`);

    const { rows: cons } = await client.query(Q.constraints, [oid]);
    log("- constraints (query: pg_constraint):\n");
    for (const c of cons) {
      log(`  - ${c.conname} [${c.contype}]: ${c.def}\n`);
    }
    log("\n");
  }

  // --- Section 2 Identity
  log("# SECTION 2: IDENTITY CONTRACT\n");

  async function colType(schema, table, col) {
    const r = await client.query(
      `
      SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS t
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3 AND a.attnum > 0 AND NOT a.attisdropped`,
      [schema, table, col]
    );
    return r.rows[0]?.t ?? null;
  }

  async function tableExists(schema, table) {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [schema, table]
    );
    return r.rowCount > 0;
  }

  const pubUsersOid = (await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='users' AND c.relkind='r'`)).rows[0]?.oid;

  log("## public.users\n");
  if (pubUsersOid) {
    const pk = await client.query(Q.pk, [pubUsersOid]);
    log(`Query: pg_index indisprimary on public.users\n`);
    log(`primary key: ${pk.rows.map((p) => `${p.attname} ${p.typ}`).join(", ") || "(none)"}\n\n`);
  } else log("Table missing.\n\n");

  log("## auth.users\n");
  const authUsersOid = (await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='auth' AND c.relname='users' AND c.relkind='r'`)).rows[0]?.oid;
  if (authUsersOid) {
    const pk = await client.query(Q.pk, [authUsersOid]);
    log(`Query: pg_index indisprimary on auth.users\n`);
    log(`primary key: ${pk.rows.map((p) => `${p.attname} ${p.typ}`).join(", ") || "(none)"}\n\n`);
  } else log("Not visible or missing (permission / no table).\n\n");

  log("## company_members.user_id\n");
  if (await tableExists("public", "company_members")) {
    const t = await colType("public", "company_members", "user_id");
    log(`Query: format_type for public.company_members.user_id\n`);
    log(`type: ${t}\n\n`);
  } else log("Table public.company_members not found.\n\n");

  log("## orders.user_id\n");
  if (await tableExists("public", "orders")) {
    const t = await colType("public", "orders", "user_id");
    log(`Query: format_type for public.orders.user_id\n`);
    log(`type: ${t}\n\n`);
  } else log("Table public.orders not found.\n\n");

  log("## user_id columns on public base tables (commerce-adjacent scan)\n");
  log(`Query: information_schema.columns WHERE column_name = 'user_id' AND table_schema='public'\n`);
  const { rows: userIdCols } = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id'
    ORDER BY table_name`);
  for (const r of userIdCols) {
    const ft = await colType("public", r.table_name, "user_id");
    log(`- public.${r.table_name}.user_id -> ${ft} (info_schema data_type=${r.data_type}, udt=${r.udt_name}, nullable=${r.is_nullable})\n`);
  }
  log("\n");

  log("## bigint vs UUID evidence\n");
  log("Query: information_schema.columns where table_schema=public and (data_type='bigint' or udt_name='uuid') and column_name ilike '%user%id%'\n");
  const { rows: mix } = await client.query(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (data_type = 'bigint' OR udt_name = 'uuid')
      AND (column_name ILIKE '%user%id%' OR column_name = 'id')
    ORDER BY table_name, column_name`);
  for (const r of mix) log(`- public.${r.table_name}.${r.column_name}: ${r.data_type} / udt ${r.udt_name}\n`);
  log("\n");

  log("## orders.user_id -> public.users join check\n");
  if (await tableExists("public", "orders") && pubUsersOid) {
    const q = `
      SELECT
        (SELECT COUNT(*)::bigint FROM public.orders) AS orders_total,
        (SELECT COUNT(*)::bigint FROM public.orders o WHERE o.user_id IS NULL) AS user_id_nulls,
        (SELECT COUNT(*)::bigint FROM public.orders o
         LEFT JOIN public.users u ON u.id = o.user_id
         WHERE o.user_id IS NOT NULL AND u.id IS NULL) AS orphan_user_id_vs_public_users`;
    log(`Query:\n${q}\n`);
    const j = await client.query(q);
    log(`Result: ${JSON.stringify(j.rows[0])}\n\n`);
  } else log("Skipped (missing orders or public.users).\n\n");

  log("## company_members.user_id -> auth.users join check\n");
  if (await tableExists("public", "company_members") && authUsersOid) {
    const q = `
      SELECT
        (SELECT COUNT(*)::bigint FROM public.company_members) AS cm_total,
        (SELECT COUNT(*)::bigint FROM public.company_members m WHERE m.user_id IS NULL) AS user_id_nulls,
        (SELECT COUNT(*)::bigint FROM public.company_members m
         LEFT JOIN auth.users au ON au.id = m.user_id
         WHERE m.user_id IS NOT NULL AND au.id IS NULL) AS orphan_user_id_vs_auth_users`;
    log(`Query:\n${q}\n`);
    try {
      const j = await client.query(q);
      log(`Result: ${JSON.stringify(j.rows[0])}\n\n`);
    } catch (e) {
      log(`ERROR (likely no SELECT on auth.users): ${e.message}\n\n`);
    }
  } else log("Skipped (missing company_members or auth.users not visible).\n\n");

  // Section 3 Inventory
  log("# SECTION 3: INVENTORY CONTRACT\n");
  if (await tableExists("public", "inventory") && (await tableExists("public", "products"))) {
    const invPid = await colType("public", "inventory", "product_id");
    const prodId = await colType("public", "products", "id");
    log(`inventory.product_id type (pg_attribute): ${invPid}\n`);
    log(`products.id type (pg_attribute): ${prodId}\n`);

    const invOid = (await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='inventory' AND c.relkind='r'`)).rows[0].oid;
    const { rows: invFks } = await client.query(Q.fks, [invOid]);
    const fkProd = invFks.filter((f) => f.to_table.includes("products") && f.from_column === "product_id");
    log(`FK inventory.product_id -> products: ${fkProd.length ? fkProd.map((f) => f.def).join("; ") : "(no such FK in pg_constraint)"}\n`);

    const q = `
      SELECT
        (SELECT COUNT(*)::bigint FROM public.inventory) AS inventory_rows,
        (SELECT COUNT(*)::bigint FROM public.products) AS products_rows,
        (SELECT COUNT(*)::bigint FROM public.inventory WHERE product_id IS NULL) AS inventory_null_product_id_rows,
        (SELECT COUNT(*)::bigint FROM public.inventory i
         LEFT JOIN public.products p ON p.id = i.product_id
         WHERE i.product_id IS NOT NULL AND p.id IS NULL) AS orphan_inventory_rows`;
    log(`Query:\n${q}\n`);
    const ir = await client.query(q);
    log(`Result: ${JSON.stringify(ir.rows[0])}\n`);
    const o = BigInt(ir.rows[0].orphan_inventory_rows);
    log(`Deterministic mapping possible from live data: ${o === 0n ? "YES (zero orphans on product_id join)" : "NO (non-zero orphans)"} — proof: orphan count above.\n\n`);
  } else {
    log("inventory or products table missing.\n\n");
  }

  // Section 4 Orders
  log("# SECTION 4: ORDERS CONTRACT\n");
  if (await tableExists("public", "orders")) {
    const ordOid = (await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='orders' AND c.relkind='r'`)).rows[0].oid;
    const { rows: ocols } = await client.query(Q.columns, [ordOid]);
    log("Columns (query: pg_attribute on public.orders):\n");
    for (const c of ocols) log(`- ${c.column_name}: ${c.data_type} | ${c.not_null ? "NOT NULL" : "NULL"}\n`);
    log("\n");

    const { rows: stripeCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='orders'
        AND (column_name ILIKE '%stripe%intent%' OR column_name ILIKE '%payment_intent%')`);
    log(`Stripe/payment-intent column candidates (information_schema): ${stripeCols.map((r) => r.column_name).join(", ") || "(none matched pattern)"}\n`);

    const stripeCol = stripeCols.find((r) => /stripe|payment_intent/i.test(r.column_name))?.column_name;
    if (stripeCol) {
      const q = `
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(${escIdent(stripeCol)}) FILTER (WHERE ${escIdent(stripeCol)} IS NOT NULL)::bigint AS non_null,
          COUNT(*) FILTER (WHERE ${escIdent(stripeCol)} IS NULL)::bigint AS nulls,
          (SELECT COUNT(*)::bigint FROM (
            SELECT ${escIdent(stripeCol)} AS v, COUNT(*) c FROM public.orders WHERE ${escIdent(stripeCol)} IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1
          ) d) AS duplicate_values_rows`;
      log(`Query (stripe column ${stripeCol}):\n${q}\n`);
      const sr = await client.query(q);
      log(`Result: ${JSON.stringify(sr.rows[0])}\n\n`);
    } else {
      log("No stripe_payment_intent-like column name matched; manual inspection of column list above.\n\n");
    }

    const hasCo = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='company_id'`
    );
    const hasUs = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='user_id'`
    );
    const q2 = `
      SELECT
        (SELECT COUNT(*)::bigint FROM public.orders) AS total,
        (SELECT COUNT(*)::bigint FROM public.orders WHERE ${hasCo.rowCount ? "company_id IS NULL" : "false"}) AS company_nulls,
        (SELECT COUNT(*)::bigint FROM public.orders WHERE ${hasUs.rowCount ? "user_id IS NULL" : "false"}) AS user_nulls`;
    log(`Query (null coverage):\n${q2}\n`);
    const n = await client.query(q2);
    const row = n.rows[0];
    const tot = BigInt(row.total);
    const cn = BigInt(row.company_nulls);
    const un = BigInt(row.user_nulls);
    if (!hasCo.rowCount) log("Note: orders.company_id column absent — company_nulls subquery used WHERE false → 0.\n");
    if (!hasUs.rowCount) log("Note: orders.user_id column absent — user_nulls subquery used WHERE false → 0.\n");
    log(`Result: total=${row.total} company_id_nulls=${row.company_nulls} (${tot && hasCo.rowCount ? ((Number(cn) / Number(tot)) * 100).toFixed(4) : "N/A"}%) user_id_nulls=${row.user_nulls} (${tot && hasUs.rowCount ? ((Number(un) / Number(tot)) * 100).toFixed(4) : "N/A"}%)\n`);

    if (pubUsersOid) {
      const q3 = `
        SELECT COUNT(*)::bigint AS orphan_orders_user
        FROM public.orders o
        LEFT JOIN public.users u ON u.id = o.user_id
        WHERE o.user_id IS NOT NULL AND u.id IS NULL`;
      log(`Query (orphan user_id vs public.users):\n${q3}\n`);
      const o3 = await client.query(q3);
      log(`Result: ${o3.rows[0].orphan_orders_user}\n\n`);
    }
  } else log("public.orders not found.\n\n");

  // Section 5 Tenancy
  log("# SECTION 5: TENANCY CONTRACT (company_id)\n");
  log(`Query: information_schema.columns where table_schema='public' AND column_name='company_id'\n`);
  const { rows: ccols } = await client.query(`
    SELECT table_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'company_id'
    ORDER BY table_name`);

  const companiesOid = (await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='companies' AND c.relkind='r'`)).rows[0]?.oid;

  for (const c of ccols) {
    const tn = c.table_name;
    const nullCatalog = c.is_nullable;
    let total, nulls;
    try {
      const r = await client.query(`
        SELECT COUNT(*)::bigint AS t, COUNT(*) FILTER (WHERE company_id IS NULL)::bigint AS n
        FROM public.${escIdent(tn)}`);
      total = BigInt(r.rows[0].t);
      nulls = BigInt(r.rows[0].n);
    } catch (e) {
      log(`- public.${tn}: ERROR ${e.message}\n`);
      continue;
    }
    const pct = total > 0n ? (Number(nulls) / Number(total)) * 100 : 0;
    let fkCompanies = "N/A";
    if (companiesOid) {
      const toid = (await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname=$1 AND c.relkind='r'`, [tn])).rows[0]?.oid;
      if (toid) {
        const { rows: fks } = await client.query(Q.fks, [toid]);
        const hit = fks.find((f) => f.from_column === "company_id" && /public\.companies\b|companies\b/.test(f.to_table));
        fkCompanies = hit ? `YES: ${hit.def}` : "NO (no FK from company_id to public.companies in pg_constraint)";
      }
    }
    log(`- public.${tn}: rows=${total} | catalog nullable=${nullCatalog} | company_id NULLs=${nulls} (${pct.toFixed(4)}%) | FK to companies: ${fkCompanies}\n`);
    log(`  (query: SELECT COUNT(*), COUNT(*) FILTER (WHERE company_id IS NULL) FROM public."${tn}")\n`);
  }
  log("\n");

  // Section 6 Carts
  log("# SECTION 6: CART CONTRACT\n");
  if (await tableExists("public", "carts")) {
    const cartOid = (await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname='carts' AND c.relkind='r'`)).rows[0].oid;
    const { rows: ccols2 } = await client.query(Q.columns, [cartOid]);
    for (const c of ccols2) log(`- ${c.column_name}: ${c.data_type} | ${c.not_null ? "NOT NULL" : "NULL"}\n`);
    const cnt = await client.query(`SELECT COUNT(*)::bigint AS c FROM public.carts`);
    log(`\nrow_count: ${cnt.rows[0].c} (SELECT COUNT(*) FROM public.carts)\n`);

    const itemsInfo = await client.query(
      `SELECT data_type, udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='carts' AND column_name='items'`
    );
    const itemsRow = itemsInfo.rows[0];
    log(`items column: ${itemsRow ? `data_type=${itemsRow.data_type} udt=${itemsRow.udt_name} (JSONB if udt=jsonb)` : "MISSING"}\n`);

    const ck = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='carts' AND column_name='cart_key'`
    );
    if (ck.rowCount) {
      const uq = await client.query(`
        SELECT COUNT(*)::bigint AS total,
               COUNT(DISTINCT cart_key)::bigint AS distinct_keys,
               (SELECT COUNT(*)::bigint FROM (
                 SELECT cart_key FROM public.carts WHERE cart_key IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1
               ) x) AS keys_with_duplicates
        FROM public.carts`);
      log(`cart_key uniqueness (query counts): ${JSON.stringify(uq.rows[0])}\n`);
      const r = uq.rows[0];
      log(`cart_key has duplicate non-null values: ${BigInt(r.keys_with_duplicates) > 0n ? "YES" : "NO"} (subquery: GROUP BY cart_key HAVING COUNT(*)>1)\n`);
    } else log("cart_key column: not present\n");

    const { rows: cidx } = await client.query(Q.indexes, [cartOid]);
    log(`indexes: ${cidx.map((i) => i.def).join(" | ") || "(none besides PK)"}\n\n`);
  } else {
    log("public.carts not found.\n\n");
  }

  // Section 7 Risk flags
  log("# SECTION 7: RISK FLAGS (PASS/FAIL + proof)\n");
  log("Definitions: PASS = condition met per live queries above; FAIL = violated or could not verify.\n\n");

  // Re-fetch key metrics for flags (minimal)
  let idPass = "FAIL";
  let invPass = "FAIL";
  let tenPass = "FAIL";
  let ordPass = "FAIL";
  let cartPass = "FAIL";

  try {
    if (pubUsersOid && authUsersOid) {
      const pkPub = await client.query(Q.pk, [pubUsersOid]);
      const pkAuth = await client.query(Q.pk, [authUsersOid]);
      const sameType =
        pkPub.rows[0] &&
        pkAuth.rows[0] &&
        pkPub.rows.map((p) => p.typ).join() === pkAuth.rows.map((p) => p.typ).join();
      const oq = await client.query(`
        SELECT COUNT(*)::bigint c FROM public.orders o
        LEFT JOIN public.users u ON u.id = o.user_id
        WHERE o.user_id IS NOT NULL AND u.id IS NULL`);
      idPass = sameType && BigInt(oq.rows[0].c) === 0n ? "PASS" : "FAIL";
      log(`- identity model consistent: ${idPass} | proof: public.users PK types=[${pkPub.rows.map((p) => p.typ).join(",")}] auth.users PK=[${pkAuth.rows.map((p) => p.typ).join(",")}] orphan orders.user_id vs public.users=${oq.rows[0].c}\n`);
    } else log(`- identity model consistent: FAIL | proof: could not compare PKs (public.users oid=${!!pubUsersOid}, auth.users visible=${!!authUsersOid})\n`);
  } catch (e) {
    log(`- identity model consistent: FAIL | proof: ${e.message}\n`);
  }

  try {
    if (await tableExists("public", "inventory")) {
      const ir = await client.query(`
        SELECT COUNT(*)::bigint o FROM public.inventory i
        LEFT JOIN public.products p ON p.id = i.product_id
        WHERE i.product_id IS NOT NULL AND p.id IS NULL`);
      invPass = BigInt(ir.rows[0].o) === 0n ? "PASS" : "FAIL";
      log(`- inventory mapping deterministic: ${invPass} | proof: orphan inventory rows=${ir.rows[0].o} (LEFT JOIN products on product_id)\n`);
    } else log(`- inventory mapping deterministic: FAIL | proof: no public.inventory\n`);
  } catch (e) {
    log(`- inventory mapping deterministic: FAIL | ${e.message}\n`);
  }

  try {
    const { rows: tcols } = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='company_id'`);
    let allHaveFk = true;
    const problems = [];
    for (const { table_name } of tcols) {
      const toid = (await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relname=$1 AND c.relkind='r'`, [table_name])).rows[0]?.oid;
      if (!toid) continue;
      const { rows: fks } = await client.query(Q.fks, [toid]);
      const hit = fks.find((f) => f.from_column === "company_id" && String(f.to_table).includes("companies"));
      if (!hit) {
        allHaveFk = false;
        problems.push(table_name);
      }
    }
    tenPass = allHaveFk && tcols.length > 0 ? "PASS" : "FAIL";
    log(`- tenancy consistently represented (FK company_id->companies for every public table with company_id): ${tenPass} | proof: tables missing FK: ${problems.length ? problems.join(", ") : "(none)"}\n`);
  } catch (e) {
    log(`- tenancy consistently represented: FAIL | ${e.message}\n`);
  }

  try {
    if (await tableExists("public", "orders")) {
      const r = await client.query(`
        SELECT COUNT(*)::bigint c FROM public.orders o
        LEFT JOIN public.users u ON u.id = o.user_id
        WHERE o.user_id IS NOT NULL AND u.id IS NULL`);
      ordPass = BigInt(r.rows[0].c) === 0n ? "PASS" : "FAIL";
      log(`- orders can preserve lineage (no orphan user_id vs public.users): ${ordPass} | proof: orphan count=${r.rows[0].c}\n`);
    } else log(`- orders lineage: FAIL | no orders table\n`);
  } catch (e) {
    log(`- orders lineage: FAIL | ${e.message}\n`);
  }

  try {
    if (await tableExists("public", "carts")) {
      const r = await client.query(`
        SELECT COUNT(*)::bigint c FROM (
          SELECT cart_key FROM public.carts WHERE cart_key IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1
        ) x`);
      cartPass = BigInt(r.rows[0].c) === 0n ? "PASS" : "FAIL";
      log(`- carts migratable as-is (no duplicate cart_key): ${cartPass} | proof: duplicate key groups=${r.rows[0].c}\n`);
    } else log(`- carts migratable as-is: FAIL | no carts table\n`);
  } catch (e) {
    log(`- carts: FAIL | ${e.message}\n`);
  }

  log("\n# SECTION 8: OUTPUT DISCIPLINE\n");
  log("All structural facts: queries labeled in sections above (pg_catalog / information_schema).\n");
  log("Numeric row counts: COUNT(*) on named tables as labeled.\n");
} finally {
  await client.end();
}

process.stdout.write(out.join(""));

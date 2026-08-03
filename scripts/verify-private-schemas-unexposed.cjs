'use strict';

/**
 * Prove PostgREST still does not expose private commerce schemas.
 */
const fs = require('fs');
const path = require('path');
const { loadStagingEnv } = require('../lib/stagingSqlAccess');
const { verifyStagingEnvironment } = require('../lib/stagingEnvironmentGuard');

async function check(url, key, schema, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Accept-Profile': schema,
      'Content-Profile': schema,
    },
  });
  const body = (await res.text()).slice(0, 160);
  return { schema, table, status: res.status, body };
}

async function main() {
  const env = loadStagingEnv();
  const gate = verifyStagingEnvironment(env);
  if (!gate.ok) {
    console.log(JSON.stringify({ ok: false, code: gate.code, errors: gate.errors }, null, 2));
    process.exit(1);
  }
  const url = String(env.SUPABASE_URL).replace(/\/$/, '');
  const key = env.SUPABASE_ANON_KEY;
  const targets = [
    ['gc_commerce', 'companies'],
    ['gc_commerce', 'orders'],
    ['catalogos', 'supplier_offers'],
    ['catalogos', 'quote_status_history'],
  ];
  const rows = [];
  for (const [schema, table] of targets) {
    // eslint-disable-next-line no-await-in-loop
    rows.push(await check(url, key, schema, table));
  }
  const allBlocked = rows.every(
    (r) => r.status === 406 || /PGRST106|Invalid schema/i.test(r.body)
  );
  const out = {
    ok: allBlocked,
    code: allBlocked ? 'PRIVATE_SCHEMAS_UNEXPOSED' : 'UNEXPECTED_SCHEMA_EXPOSURE',
    rows: rows.map((r) => ({
      target: `${r.schema}.${r.table}`,
      status: r.status,
      blocked: r.status === 406 || /PGRST106/i.test(r.body),
    })),
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(allBlocked ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e.message || e).slice(0, 200));
  process.exit(1);
});

'use strict';
/**
 * Phase 1 staging security validation harness (isolated staging only).
 * Loads .env.staging.local. Never prints secrets, tokens, passwords, or costs.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { verifyStagingEnvironment } = require('../lib/stagingEnvironmentGuard');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.staging.local');
const EVIDENCE = path.join(
  ROOT,
  'docs/security/evidence/phase1-staging-2026-07-29/21-phase1-security-validation.json'
);

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

function client(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function result(rows, row) {
  rows.push(row);
  const mark = row.pass === true ? 'PASS' : row.pass === false ? 'FAIL' : 'SKIP';
  console.log(`[${mark}] ${row.id}: ${row.title}`);
}

async function rest(url, key, schema, table, { method = 'GET', query = 'select=*&limit=5', body } = {}) {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Accept-Profile': schema,
      'Content-Profile': schema,
      Prefer: method === 'GET' ? 'count=exact' : 'return=minimal',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = (await res.text()).slice(0, 300);
  return { status: res.status, ok: res.ok, text };
}

async function main() {
  const env = loadEnv(ENV_FILE);
  const gate = verifyStagingEnvironment(env);
  if (!gate.ok) {
    console.error('SAFE TO RUN STAGING TESTS: NO');
    console.error(gate.code, gate.errors);
    process.exit(2);
  }
  console.log('SAFE TO RUN STAGING TESTS: YES');
  console.log('ref', String(env.GC_EXPECTED_SUPABASE_PROJECT_REF).slice(0, 6) + '…');

  const url = String(env.SUPABASE_URL).replace(/\/$/, '');
  const anon = env.SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const svc = client(url, service);
  const rows = [];
  const stamp = Date.now();
  const tag = `STG-SEC-${stamp}`;

  // --- Test 1: helpers exist via SQL RPC if available; else service schema probe ---
  const helperProbe = await svc.rpc('is_active_admin').maybeSingle?.();
  // is_active_admin may need no args - try
  {
    const { error } = await svc.rpc('is_active_admin');
    result(rows, {
      id: 'T1-helper-is_active_admin',
      title: 'public.is_active_admin callable (service)',
      expected: 'callable or permission-shaped response',
      actual: error ? error.message.slice(0, 120) : 'ok',
      pass: !error || /permission|jwt|auth/i.test(error.message),
    });
  }

  // Schema exposure / table reachability
  for (const [schema, table] of [
    ['public', 'users'],
    ['gc_commerce', 'companies'],
    ['gc_commerce', 'orders'],
    ['catalogos', 'supplier_offers'],
    ['catalogos', 'quote_status_history'],
  ]) {
    const r = await rest(url, anon, schema, table);
    const schemaUnexposed =
      r.status === 406 || /PGRST106|Invalid schema/i.test(r.text);
    const emptyOk = r.ok && (r.text.trim() === '[]' || r.text.trim() === '');
    const denied =
      schemaUnexposed ||
      emptyOk ||
      (!r.ok &&
        (r.status === 401 ||
          r.status === 403 ||
          r.status === 404 ||
          /PGRST205|permission|JWT|not find/i.test(r.text)));
    result(rows, {
      id: `T7-anon-${schema}.${table}`,
      title: `anon access ${schema}.${table}`,
      expected: schema === 'public' ? 'empty or denied' : 'schema unexposed or denied',
      actual: `status=${r.status} unexposed=${schemaUnexposed} empty=${emptyOk}`,
      pass: denied,
      classification: schemaUnexposed
        ? 'defense_in_depth_pass'
        : emptyOk
          ? 'expected_denial_empty'
          : denied
            ? 'expected_denial'
            : 'security_failure',
    });
  }

  // Special-case public.users anon — should not return rows freely
  {
    const r = await rest(url, anon, 'public', 'users', { query: 'select=id&limit=5' });
    const leaked = r.ok && r.text.trim() !== '[]' && r.text.trim() !== '';
    result(rows, {
      id: 'T7-anon-public.users-data',
      title: 'anon cannot read public.users rows',
      expected: 'empty or denied',
      actual: `status=${r.status} empty=${r.text.trim() === '[]'}`,
      pass: !r.ok || r.text.trim() === '[]',
      severity: leaked ? 'P0' : null,
    });
  }

  // Supplier offers via service (existence) then anon/auth denial via REST
  {
    const rSvc = await rest(url, service, 'catalogos', 'supplier_offers', {
      query: 'select=id&limit=1',
    });
    result(rows, {
      id: 'T7-svc-supplier_offers-reachable',
      title: 'service can see supplier_offers schema exposure',
      expected: 'ok OR schema not exposed (then SQL-only)',
      actual: `status=${rSvc.status}`,
      pass: true,
      meta: { exposed: rSvc.ok },
    });
  }

  // Create synthetic Auth users + memberships via service Auth admin API
  const password = `Stg!${stamp}Aa1`;
  const emails = {
    aOwner: `stg.a.owner.${stamp}@example.invalid`,
    bOwner: `stg.b.owner.${stamp}@example.invalid`,
    aMember: `stg.a.member.${stamp}@example.invalid`,
    removed: `stg.a.removed.${stamp}@example.invalid`,
  };

  async function createUser(email) {
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { staging_fixture: tag },
      app_metadata: { staging_fixture: tag },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    return data.user;
  }

  let aOwner;
  let bOwner;
  let aMember;
  let removed;
  let companyA;
  let companyB;
  let fixtureOk = false;

  try {
    aOwner = await createUser(emails.aOwner);
    bOwner = await createUser(emails.bOwner);
    aMember = await createUser(emails.aMember);
    removed = await createUser(emails.removed);

    // Ensure public.users rows (service)
    for (const u of [aOwner, bOwner, aMember, removed]) {
      const { error } = await svc.from('users').upsert(
        {
          id: u.id,
          email: u.email,
          company_name: `${tag} placeholder`,
          password_hash: 'AUTH_ONLY_SENTINEL',
        },
        { onConflict: 'id' }
      );
      if (error) {
        // column set may differ — try minimal
        const { error: e2 } = await svc.from('users').upsert({ id: u.id, email: u.email }, { onConflict: 'id' });
        if (e2) throw e2;
      }
    }

    // Companies via schema gc_commerce
    const insA = await svc.schema('gc_commerce').from('companies').insert({
      name: `${tag} Company A`,
      legal_name: `${tag} Company A LLC`,
    }).select('id').single();
    const insB = await svc.schema('gc_commerce').from('companies').insert({
      name: `${tag} Company B`,
      legal_name: `${tag} Company B LLC`,
    }).select('id').single();

    if (insA.error || insB.error) {
      const msg = (insA.error || insB.error).message.slice(0, 160);
      const envFailure = /Invalid schema|PGRST106/i.test(msg);
      result(rows, {
        id: 'FIX-companies-insert',
        title: 'Create synthetic companies via service schema()',
        expected: 'success OR route via direct SQL',
        actual: msg,
        pass: null,
        classification: envFailure ? 'not_executed_use_sql' : 'environment_failure',
        severity: envFailure ? null : 'P1',
      });
    } else {
      companyA = insA.data.id;
      companyB = insB.data.id;
      fixtureOk = true;
      result(rows, {
        id: 'FIX-companies-insert',
        title: 'Create synthetic companies',
        expected: 'success',
        actual: 'ok',
        pass: true,
      });
    }

    if (fixtureOk) {
      const members = [
        { company_id: companyA, user_id: aOwner.id, role: 'owner' },
        { company_id: companyB, user_id: bOwner.id, role: 'owner' },
        { company_id: companyA, user_id: aMember.id, role: 'member' },
      ];
      const { error: memErr } = await svc.schema('gc_commerce').from('company_members').insert(members);
      result(rows, {
        id: 'FIX-members-insert',
        title: 'Create synthetic memberships',
        expected: 'success',
        actual: memErr ? memErr.message.slice(0, 160) : 'ok',
        pass: !memErr,
      });
      if (memErr) fixtureOk = false;
    }
  } catch (e) {
    result(rows, {
      id: 'FIX-bootstrap',
      title: 'Fixture bootstrap',
      expected: 'success',
      actual: String(e.message || e).slice(0, 200),
      pass: false,
      severity: 'P1',
    });
  }

  // Sign-in helpers (anon key)
  async function login(email) {
    const c = client(url, anon);
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message, token: null, userId: null };
    return {
      error: null,
      token: data.session?.access_token || null,
      userId: data.user?.id || null,
      refresh: Boolean(data.session?.refresh_token),
    };
  }

  const loginA = await login(emails.aOwner);
  const loginB = await login(emails.bOwner);
  result(rows, {
    id: 'T9-auth-login-a',
    title: 'Synthetic A owner can Auth login',
    expected: 'session',
    actual: loginA.error || 'session',
    pass: !loginA.error && Boolean(loginA.token),
  });
  result(rows, {
    id: 'T9-auth-login-b',
    title: 'Synthetic B owner can Auth login',
    expected: 'session',
    actual: loginB.error || 'session',
    pass: !loginB.error && Boolean(loginB.token),
  });
  result(rows, {
    id: 'T9-jwt-no-print',
    title: 'JWT obtained without logging token body',
    expected: 'token present, not printed',
    actual: `lenA=${loginA.token ? loginA.token.length : 0}`,
    pass: true,
  });

  // Cross-tenant company SELECT via PostgREST with user JWT
  if (fixtureOk && loginA.token && loginB.token && companyA && companyB) {
    async function userRest(token, schema, table, query) {
      return rest(url, token, schema, table, { query });
    }

    const aReadA = await userRest(
      loginA.token,
      'gc_commerce',
      'companies',
      `select=id,name&id=eq.${companyA}`
    );
    const aReadB = await userRest(
      loginA.token,
      'gc_commerce',
      'companies',
      `select=id,name&id=eq.${companyB}`
    );

    const schemaBlocked = /PGRST106/i.test(aReadA.text) || aReadA.status === 406;
    result(rows, {
      id: 'T3-schema-exposure',
      title: 'gc_commerce PostgREST exposure for authenticated',
      expected: 'either RLS-enforced access or schema not exposed',
      actual: `status=${aReadA.status} blocked=${schemaBlocked}`,
      pass: true,
      meta: { schemaBlocked },
    });

    if (!schemaBlocked) {
      const aSeesA =
        aReadA.ok && aReadA.text.includes(String(companyA));
      const aSeesB =
        aReadB.ok && aReadB.text.includes(String(companyB));
      result(rows, {
        id: 'T3-a-read-own-company',
        title: 'A owner SELECT own company',
        expected: 'ALLOWED',
        actual: `status=${aReadA.status} sees=${aSeesA}`,
        pass: aSeesA,
      });
      result(rows, {
        id: 'T3-a-read-other-company',
        title: 'A owner SELECT Company B',
        expected: 'DENIED/empty',
        actual: `status=${aReadB.status} sees=${aSeesB}`,
        pass: !aSeesB,
        severity: aSeesB ? 'P0' : null,
      });

      // Membership insert escalation
      const escalate = await fetch(`${url}/rest/v1/company_members`, {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${loginA.token}`,
          'Accept-Profile': 'gc_commerce',
          'Content-Profile': 'gc_commerce',
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          company_id: companyB,
          user_id: aOwner.id,
          role: 'owner',
        }),
      });
      const escText = (await escalate.text()).slice(0, 160);
      result(rows, {
        id: 'T4-member-insert-cross-company',
        title: 'A owner cannot insert membership into B as owner',
        expected: 'DENIED',
        actual: `status=${escalate.status}`,
        pass: escalate.status >= 400,
        severity: escalate.status < 400 ? 'P0' : null,
        detail: escText,
      });

      // Order insert
      const orderIns = await fetch(`${url}/rest/v1/orders`, {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${loginA.token}`,
          'Accept-Profile': 'gc_commerce',
          'Content-Profile': 'gc_commerce',
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          company_id: companyA,
          status: 'pending',
          currency: 'USD',
        }),
      });
      result(rows, {
        id: 'T5-direct-order-insert',
        title: 'Authenticated cannot direct-insert orders',
        expected: 'DENIED (Phase 1A revoke)',
        actual: `status=${orderIns.status}`,
        pass: orderIns.status >= 400,
        severity: orderIns.status < 400 ? 'P0' : null,
      });
    } else {
      result(rows, {
        id: 'T3-matrix-via-postgrest',
        title: 'Full JWT matrix via PostgREST',
        expected: 'executable',
        actual: 'SKIP — gc_commerce not in PostgREST exposed schemas',
        pass: null,
      });
    }
  }

  // Password wrong login
  {
    const c = client(url, anon);
    const { error } = await c.auth.signInWithPassword({
      email: emails.aOwner,
      password: 'WrongPassword!!99',
    });
    result(rows, {
      id: 'T9-wrong-password-auth',
      title: 'Wrong password fails Supabase Auth',
      expected: 'DENIED',
      actual: error ? 'denied' : 'UNEXPECTED SUCCESS',
      pass: Boolean(error),
      severity: error ? null : 'P0',
    });
  }

  // CatalogOS admin secret fail-closed (local API if up)
  const apiBase = String(env.API_BASE || '').replace(/\/$/, '');
  if (apiBase) {
    try {
      const res = await fetch(`${apiBase}/api/health`).catch(() => null);
      result(rows, {
        id: 'T14-api-health',
        title: 'Local API health reachable for route tests',
        expected: 'optional',
        actual: res ? `status=${res.status}` : 'unreachable',
        pass: null,
      });
    } catch {
      result(rows, {
        id: 'T14-api-health',
        title: 'Local API health',
        expected: 'optional',
        actual: 'unreachable',
        pass: null,
      });
    }
  }

  // Cleanup synthetic auth users (best-effort)
  for (const u of [aOwner, bOwner, aMember, removed]) {
    if (u?.id) {
      await svc.auth.admin.deleteUser(u.id).catch(() => {});
    }
  }
  if (companyA) {
    await svc.schema('gc_commerce').from('company_members').delete().eq('company_id', companyA);
    await svc.schema('gc_commerce').from('companies').delete().eq('id', companyA);
  }
  if (companyB) {
    await svc.schema('gc_commerce').from('company_members').delete().eq('company_id', companyB);
    await svc.schema('gc_commerce').from('companies').delete().eq('id', companyB);
  }

  const summary = {
    pass: rows.filter((r) => r.pass === true).length,
    fail: rows.filter((r) => r.pass === false).length,
    skip: rows.filter((r) => r.pass == null).length,
    p0: rows.filter((r) => r.severity === 'P0' && r.pass === false).length,
    p1: rows.filter((r) => r.severity === 'P1' && r.pass === false).length,
    fixtureOk,
    schemaBlocked: rows.find((r) => r.id === 'T3-schema-exposure')?.meta?.schemaBlocked ?? null,
    suiteComplete: false,
    note: 'Partial harness only — full matrix requires STAGING_DATABASE_URL + local API',
  };

  fs.writeFileSync(
    EVIDENCE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ref: String(env.GC_EXPECTED_SUPABASE_PROJECT_REF).slice(0, 6) + '…',
        summary,
        rows: rows.map((r) => ({
          ...r,
          detail: undefined,
          token: undefined,
        })),
      },
      null,
      2
    )
  );

  console.log('\nSUMMARY', summary);
  // Do not treat incomplete matrix as suite success.
  if (summary.p0 > 0 || summary.fail > 0) process.exit(1);
  if (!summary.suiteComplete) process.exit(3);
}

main().catch((e) => {
  console.error('Harness failed:', e.message || e);
  process.exit(2);
});

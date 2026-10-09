'use strict';

/**
 * Staging-only SQL access resolution and identity guard.
 * Never logs connection strings, passwords, or full JWTs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  verifyStagingEnvironment,
  parseSupabaseProjectRef,
  DENYLIST_PROJECT_REFS,
} = require('./stagingEnvironmentGuard');

const EXPECTED_STAGING_REF = 'fmrupehxifzkpfphiyvm';
const PHASE1_LAST_VERSION = '20261227120500';

const APPROVED_DB_URL_KEYS = Object.freeze([
  'STAGING_DATABASE_URL',
  'SUPABASE_DB_URL',
  // Last-resort staging-local aliases — never PRODUCTION_DATABASE_URL / Vercel prod.
  'DATABASE_URL',
]);

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

function loadStagingEnv(cwd = process.cwd()) {
  const filePath = path.join(cwd, '.env.staging.local');
  const fileEnv = loadEnvFile(filePath);
  // File wins over process env for staging isolation (except already-set CI overrides
  // that match approved keys and point at staging — still verified below).
  return { ...process.env, ...fileEnv, __STAGING_ENV_FILE: filePath };
}

function resolveStagingDatabaseUrl(env) {
  for (const key of APPROVED_DB_URL_KEYS) {
    const val = String(env[key] || '').trim();
    if (val) {
      return { key, url: val };
    }
  }
  return { key: null, url: null };
}

function fingerprintHost(urlString) {
  try {
    const u = new URL(urlString);
    return crypto.createHash('sha256').update(u.host).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
}

function assertUrlLooksLikePostgres(urlString) {
  return /^postgres(ql)?:\/\//i.test(String(urlString || ''));
}

function projectRefFromDbUrl(urlString) {
  try {
    const u = new URL(urlString);
    // pooler user often postgres.<ref>
    const user = decodeURIComponent(u.username || '');
    const m = user.match(/^postgres\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
    // hostname may include ref for some formats
    const hm = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (hm) return hm[1].toLowerCase();
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: boolean, code: string, errors: string[], report: object, resolved?: { key: string, url: string } }}
 */
function resolveAndPrecheckStagingDb(env) {
  const errors = [];
  const apiGate = verifyStagingEnvironment(env);
  if (!apiGate.ok) {
    return {
      ok: false,
      code: apiGate.code || 'STAGING_ENV_FAILED',
      errors: apiGate.errors,
      report: { apiGate: apiGate.report },
    };
  }

  const expectedRef = String(env.GC_EXPECTED_SUPABASE_PROJECT_REF || '')
    .trim()
    .toLowerCase();
  if (expectedRef !== EXPECTED_STAGING_REF) {
    errors.push(`GC_EXPECTED_SUPABASE_PROJECT_REF must be ${EXPECTED_STAGING_REF}`);
  }

  const resolved = resolveStagingDatabaseUrl(env);
  if (!resolved.url) {
    return {
      ok: false,
      code: 'BLOCKED_ON_OPERATOR_SECRET',
      errors: [
        'Missing STAGING_DATABASE_URL (or SUPABASE_DB_URL / DATABASE_URL) in .env.staging.local',
      ],
      report: {
        expectedRef,
        approvedKeys: APPROVED_DB_URL_KEYS,
        populatedKeys: APPROVED_DB_URL_KEYS.filter((k) => Boolean(String(env[k] || '').trim())),
        apiGate: apiGate.report,
      },
    };
  }

  if (!assertUrlLooksLikePostgres(resolved.url)) {
    errors.push('Staging DB URL must be a postgres(ql):// connection string');
  }

  const urlRef = projectRefFromDbUrl(resolved.url);
  if (urlRef && DENYLIST_PROJECT_REFS.includes(urlRef)) {
    errors.push('Staging DB URL resolves to a denylisted/production project ref');
  }
  if (urlRef && urlRef !== expectedRef) {
    errors.push('Staging DB URL project ref does not match GC_EXPECTED_SUPABASE_PROJECT_REF');
  }

  // Never allow NEXT_PUBLIC_ database URLs
  if (String(env.NEXT_PUBLIC_DATABASE_URL || '').trim()) {
    errors.push('NEXT_PUBLIC_DATABASE_URL must not be set');
  }

  if (errors.length) {
    return {
      ok: false,
      code: 'STAGING_DB_REJECTED',
      errors,
      report: {
        expectedRef,
        resolvedKey: resolved.key,
        hostFingerprint: fingerprintHost(resolved.url),
        urlRef: urlRef || null,
      },
    };
  }

  return {
    ok: true,
    code: 'STAGING_DB_PRECHECK_OK',
    errors: [],
    resolved,
    report: {
      expectedRef,
      resolvedKey: resolved.key,
      hostFingerprint: fingerprintHost(resolved.url),
      urlRef: urlRef || null,
      apiGate: apiGate.report,
    },
  };
}

/**
 * Connect and verify migration history + safe identifiers.
 * Requires `pg` package.
 */
async function verifyStagingDatabase(env, options = {}) {
  const pre = resolveAndPrecheckStagingDb(env);
  if (!pre.ok) return pre;

  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    return {
      ok: false,
      code: 'PG_CLIENT_MISSING',
      errors: ['Node pg client is not installed (add dependency "pg")'],
      report: pre.report,
    };
  }

  const client = new Client({
    connectionString: pre.resolved.url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: options.timeoutMs || 15000,
  });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');

    const ident = await client.query(`
      SELECT
        current_database() AS db,
        current_user AS db_user,
        inet_server_addr()::text AS server_addr
    `);

    const mig = await client.query(
      `
      SELECT version
      FROM supabase_migrations.schema_migrations
      WHERE version = $1
      LIMIT 1
    `,
      [PHASE1_LAST_VERSION]
    );

    const helpers = await client.query(`
      SELECT
        to_regclass('gc_commerce.companies') IS NOT NULL AS companies,
        to_regclass('gc_commerce.user_profiles') IS NULL AS user_profiles_absent,
        EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'gc_commerce' AND p.proname = 'is_company_member'
        ) AS has_is_company_member
    `);

    await client.query('COMMIT');

    const errors = [];
    if (!mig.rowCount) {
      errors.push(`Remote migration ${PHASE1_LAST_VERSION} not found`);
    }
    if (!helpers.rows[0]?.companies) {
      errors.push('gc_commerce.companies missing');
    }
    if (!helpers.rows[0]?.user_profiles_absent) {
      errors.push('gc_commerce.user_profiles unexpectedly present');
    }
    if (!helpers.rows[0]?.has_is_company_member) {
      errors.push('gc_commerce.is_company_member missing');
    }

    const report = {
      ...pre.report,
      database: ident.rows[0]?.db || null,
      dbUser: ident.rows[0]?.db_user || null,
      phase1LastPresent: Boolean(mig.rowCount),
      companies: Boolean(helpers.rows[0]?.companies),
      userProfilesAbsent: Boolean(helpers.rows[0]?.user_profiles_absent),
      hasIsCompanyMember: Boolean(helpers.rows[0]?.has_is_company_member),
    };

    if (errors.length) {
      return { ok: false, code: 'STAGING_DB_REJECTED', errors, report };
    }

    return { ok: true, code: 'STAGING_DB_OK', errors: [], report, clientReady: true };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const msg = String(err && err.message ? err.message : err);
    return {
      ok: false,
      code: 'STAGING_DB_CONNECT_FAILED',
      errors: [msg.replace(/:[^:@/]+@/g, ':***@').slice(0, 200)],
      report: pre.report,
    };
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Open a pg client after STAGING_DB_OK precheck (caller must end()).
 * Write ops require ALLOW_STAGING_FIXTURE_WRITES=true.
 */
async function openStagingSqlClient(env, { allowWrites = false } = {}) {
  const pre = resolveAndPrecheckStagingDb(env);
  if (!pre.ok) {
    const err = new Error(pre.code);
    err.details = pre;
    throw err;
  }
  if (allowWrites && String(env.ALLOW_STAGING_FIXTURE_WRITES || '').trim() !== 'true') {
    const err = new Error('FIXTURE_WRITES_DISABLED');
    err.details = {
      code: 'FIXTURE_WRITES_DISABLED',
      errors: ['Set ALLOW_STAGING_FIXTURE_WRITES=true for fixture writes'],
    };
    throw err;
  }

  const { Client } = require('pg');
  const client = new Client({
    connectionString: pre.resolved.url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  if (!allowWrites) {
    await client.query('BEGIN READ ONLY');
  } else {
    await client.query('BEGIN');
  }
  return { client, resolvedKey: pre.resolved.key, report: pre.report };
}

async function closeStagingSqlClient(session, { commit = false } = {}) {
  if (!session?.client) return;
  try {
    if (commit) await session.client.query('COMMIT');
    else await session.client.query('ROLLBACK');
  } catch {
    try {
      await session.client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
  }
  await session.client.end();
}

/**
 * Emulate PostgREST JWT claims for RLS (transaction-local).
 * Pattern from scripts/sql/tenant-isolation-policy-tests.sql
 */
async function setRequestJwt(client, { role, sub, email, claims } = {}) {
  const payload = {
    role: role || 'authenticated',
    sub: sub || null,
    email: email || null,
    ...(claims || {}),
  };
  await client.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [
    payload.role,
  ]);
  if (payload.sub) {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [
      payload.sub,
    ]);
  }
  if (payload.email) {
    await client.query(`SELECT set_config('request.jwt.claim.email', $1, true)`, [
      payload.email,
    ]);
  }
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify(payload),
  ]);
  if (payload.role === 'anon') {
    await client.query('SET LOCAL ROLE anon');
  } else if (payload.role === 'authenticated') {
    await client.query('SET LOCAL ROLE authenticated');
  } else if (payload.role === 'service_role') {
    // service_role typically bypasses RLS as table owner / bypass role — keep as current user
    await client.query('RESET ROLE');
  }
}

module.exports = {
  EXPECTED_STAGING_REF,
  PHASE1_LAST_VERSION,
  APPROVED_DB_URL_KEYS,
  loadStagingEnv,
  resolveStagingDatabaseUrl,
  resolveAndPrecheckStagingDb,
  verifyStagingDatabase,
  openStagingSqlClient,
  closeStagingSqlClient,
  setRequestJwt,
  fingerprintHost,
  projectRefFromDbUrl,
  parseSupabaseProjectRef,
};

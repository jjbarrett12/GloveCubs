'use strict';

/**
 * Verify isolated staging DB identity via STAGING_DATABASE_URL.
 * Never prints connection strings.
 */
const path = require('path');
const fs = require('fs');
const {
  loadStagingEnv,
  resolveAndPrecheckStagingDb,
  verifyStagingDatabase,
} = require('../lib/stagingSqlAccess');

const LOG = path.join(__dirname, '..', 'debug-9a8ca1.log');
const ENDPOINT = 'http://127.0.0.1:7509/ingest/b93805e8-6d0d-449a-a28d-f5a520f7995a';

function agentLog(hypothesisId, message, data) {
  // #region agent log
  const payload = {
    sessionId: '9a8ca1',
    runId: 'debug-sql-access',
    hypothesisId,
    location: 'scripts/verify-staging-db.cjs',
    message,
    data,
    timestamp: Date.now(),
  };
  try {
    fs.appendFileSync(LOG, JSON.stringify(payload) + '\n');
  } catch {
    /* ignore */
  }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '9a8ca1',
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

async function main() {
  const env = loadStagingEnv();
  const pre = resolveAndPrecheckStagingDb(env);
  agentLog('A', 'precheck', {
    code: pre.code,
    ok: pre.ok,
    resolvedKey: pre.report?.resolvedKey || null,
    populatedKeys: pre.report?.populatedKeys || null,
  });

  if (pre.code === 'BLOCKED_ON_OPERATOR_SECRET') {
    console.log(
      JSON.stringify(
        {
          ok: false,
          code: 'BLOCKED_ON_OPERATOR_SECRET',
          errors: pre.errors,
          report: pre.report,
          operator_action:
            'Add STAGING_DATABASE_URL to .env.staging.local (staging project only). Do not commit. Do not paste into chat.',
        },
        null,
        2
      )
    );
    process.exit(2);
  }

  if (!pre.ok) {
    console.log(JSON.stringify({ ok: false, code: pre.code, errors: pre.errors, report: pre.report }, null, 2));
    process.exit(1);
  }

  const result = await verifyStagingDatabase(env);
  agentLog('B', 'verifyStagingDatabase', {
    code: result.code,
    ok: result.ok,
    phase1LastPresent: result.report?.phase1LastPresent ?? null,
    userProfilesAbsent: result.report?.userProfilesAbsent ?? null,
  });
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        code: result.code,
        errors: result.errors,
        report: result.report,
      },
      null,
      2
    )
  );
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  agentLog('X', 'fatal', { error: String(e.message || e).slice(0, 160) });
  console.error(String(e.message || e).slice(0, 200));
  process.exit(1);
});

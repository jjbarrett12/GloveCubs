'use strict';

/**
 * Read-only staging SQL file runner (orphan / advisor audits).
 * Usage: node scripts/staging-sql-runner.cjs --file scripts/sql/security-advisor-audit.sql
 */
const fs = require('fs');
const path = require('path');
const {
  loadStagingEnv,
  openStagingSqlClient,
  closeStagingSqlClient,
  resolveAndPrecheckStagingDb,
} = require('../lib/stagingSqlAccess');

function parseArgs(argv) {
  const out = { file: null, label: 'query' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file') out.file = argv[++i];
    else if (argv[i] === '--label') out.label = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Usage: node scripts/staging-sql-runner.cjs --file <sql> [--label name]');
    process.exit(2);
  }
  const sqlPath = path.resolve(args.file);
  if (!fs.existsSync(sqlPath)) {
    console.error('SQL file not found');
    process.exit(2);
  }

  const env = loadStagingEnv();
  const pre = resolveAndPrecheckStagingDb(env);
  if (!pre.ok) {
    console.log(JSON.stringify({ ok: false, code: pre.code, errors: pre.errors, report: pre.report }, null, 2));
    process.exit(pre.code === 'BLOCKED_ON_OPERATOR_SECRET' ? 2 : 1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  // Strip psql meta-commands (\echo) for node-pg
  const cleaned = sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*\\/.test(line))
    .join('\n');

  const session = await openStagingSqlClient(env, { allowWrites: false });
  const artifactDir = path.join(process.cwd(), '.artifacts', 'staging-security');
  fs.mkdirSync(artifactDir, { recursive: true });

  try {
    // Execute as a single script; multi-statement supported by pg simple query protocol
    const result = await session.client.query(cleaned);
    const batches = Array.isArray(result) ? result : [result];
    const summary = batches.map((r, i) => ({
      batch: i,
      rowCount: r.rowCount,
      fields: (r.fields || []).map((f) => f.name),
      // Cap rows to avoid dumping PII; orphan report returns aggregates first
      rows: (r.rows || []).slice(0, 50),
    }));

    const outPath = path.join(
      artifactDir,
      `${args.label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          ok: true,
          code: 'STAGING_SQL_OK',
          label: args.label,
          file: path.relative(process.cwd(), sqlPath),
          resolvedKey: session.resolvedKey,
          report: session.report,
          summary,
        },
        null,
        2
      )
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          code: 'STAGING_SQL_OK',
          label: args.label,
          artifact: path.relative(process.cwd(), outPath),
          batches: summary.length,
        },
        null,
        2
      )
    );
    await closeStagingSqlClient(session, { commit: false });
    process.exit(0);
  } catch (err) {
    await closeStagingSqlClient(session, { commit: false });
    const msg = String(err.message || err)
      .replace(/:[^:@/]+@/g, ':***@')
      .slice(0, 300);
    console.log(JSON.stringify({ ok: false, code: 'STAGING_SQL_FAILED', error: msg }, null, 2));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(String(e.message || e).slice(0, 200));
  process.exit(1);
});

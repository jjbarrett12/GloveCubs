#!/usr/bin/env node
/**
 * Non-destructive staging environment verification.
 *
 * Usage:
 *   node scripts/verify-staging-environment.cjs
 *   node scripts/verify-staging-environment.cjs --env-file=.env.staging.local
 *
 * Exit 0 only when markers, project refs, keys, kill switch, and email sandbox pass.
 * Never prints secrets. Never mutates the database.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  verifyStagingEnvironment,
} = require('../lib/stagingEnvironmentGuard');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const envFileArg = args.find((a) => a.startsWith('--env-file='));
const envFile = envFileArg
  ? envFileArg.slice('--env-file='.length)
  : process.env.GC_STAGING_ENV_FILE || '.env.staging.local';

const envPath = path.isAbsolute(envFile) ? envFile : path.join(root, envFile);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else if (!process.env.GC_ENVIRONMENT) {
  console.error(
    JSON.stringify({
      ok: false,
      code: 'MISSING_ENV_FILE',
      error: `Env file not found: ${envFile}. Create .env.staging.local (see .env.staging.example).`,
    }),
  );
  process.exit(1);
}

const result = verifyStagingEnvironment(process.env, { allowLocal: true });

const out = {
  ok: result.ok,
  code: result.code,
  errors: result.errors,
  warnings: result.warnings,
  report: result.report,
  env_file: envFile,
  note: 'No secrets printed. No database mutations.',
};

console.log(JSON.stringify(out, null, 2));
process.exit(result.ok ? 0 : 1);

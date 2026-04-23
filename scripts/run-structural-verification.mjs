/**
 * Runs scripts/verification-structural-final-cleanup.sql when DATABASE_URL is set and psql is available.
 * Exit: 0 success, 1 psql/sql failure, 2 skipped (no URL or no psql).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, 'verification-structural-final-cleanup.sql');
const url = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!url || String(url).trim() === '') {
  console.error('[verify:structural-cleanup] SKIP: set DATABASE_URL or DIRECT_URL (not set in this environment).');
  process.exit(2);
}

const psql = spawnSync('psql', [String(url), '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], {
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});

if (psql.error && (psql.error.code === 'ENOENT' || /ENOENT/i.test(String(psql.error.message)))) {
  console.error('[verify:structural-cleanup] SKIP: psql not found in PATH.');
  process.exit(2);
}

if (psql.stdout) process.stdout.write(psql.stdout);
if (psql.stderr) process.stderr.write(psql.stderr);

process.exit(psql.status === 0 ? 0 : 1);

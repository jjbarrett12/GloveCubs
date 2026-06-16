'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');

function readUtf8(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function stripSqlComments(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('commerce-packaging phase 2E guards', () => {
  it('audit SQL contains no mutating statements', () => {
    const sql = stripSqlComments(readUtf8('supabase/sql/audit_commerce_packaging_coverage.sql'));
    const forbidden = /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i;
    assert.equal(forbidden.test(sql), false, 'audit SQL must be read-only');
  });

  it('audit script exits with helpful message when Supabase is not configured', () => {
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'scripts/audit-commerce-packaging-coverage.mjs'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SUPABASE_URL: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
          NEXT_PUBLIC_SUPABASE_URL: '',
        },
        encoding: 'utf8',
        shell: process.platform === 'win32',
      }
    );
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    assert.equal(result.status, 1);
    assert.match(out, /Supabase not configured/i);
  });

  it('backfill script exits with helpful message when Supabase is not configured', () => {
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'scripts/backfill-commerce-packaging.mjs'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SUPABASE_URL: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
          NEXT_PUBLIC_SUPABASE_URL: '',
        },
        encoding: 'utf8',
        shell: process.platform === 'win32',
      }
    );
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    assert.equal(result.status, 1);
    assert.match(out, /Supabase not configured/i);
  });

  it('migration verification script passes locally', () => {
    const result = spawnSync('node', ['scripts/verify-commerce-packaging-migration.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /units_per_case seed/);
  });
});

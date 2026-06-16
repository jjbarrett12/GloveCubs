'use strict';

/**
 * Quarantine planning from contamination-report.json — NO writes to database.
 *
 * Usage:
 *   node scripts/contamination-quarantine-plan.mjs
 *   node scripts/contamination-quarantine-plan.mjs --in=contamination-report.json --out=quarantine-plan.json
 *   node scripts/contamination-quarantine-plan.mjs --in=contamination-report.json --csv --out=quarantine-plan.csv
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { buildQuarantinePlanFromReport, quarantinePlanToCsv } = require('../lib/contamination-quarantine');

const args = process.argv.slice(2);
const inArg = args.find((a) => a.startsWith('--in='));
const outArg = args.find((a) => a.startsWith('--out='));
const wantCsv = args.includes('--csv');
const wantJson = args.includes('--json') || (!wantCsv && !args.includes('--csv-only'));
const writeBoth = !args.includes('--json') && !args.includes('--csv') && !args.includes('--csv-only');

const inPath = inArg ? inArg.slice('--in='.length).trim() : path.join(process.cwd(), 'contamination-report.json');
const outPath = outArg
  ? outArg.slice('--out='.length).trim()
  : wantCsv
    ? path.join(process.cwd(), 'quarantine-plan.csv')
    : path.join(process.cwd(), 'quarantine-plan.json');

function assertReadOnlyScript() {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const body = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
  const forbidden = [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.upsert\s*\(/, /\bTRUNCATE\b/i, /\bDELETE FROM\b/i];
  for (const re of forbidden) {
    if (re.test(body)) {
      throw new Error(`contamination-quarantine-plan.mjs failed read-only self-check: matched ${re}`);
    }
  }
}

function main() {
  assertReadOnlyScript();

  if (!fs.existsSync(inPath)) {
    console.error(`contamination-quarantine-plan: input not found: ${inPath}`);
    console.error('Run: node scripts/contamination-report.mjs --json --out=contamination-report.json');
    process.exit(2);
  }

  const report = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const plan = buildQuarantinePlanFromReport(report);

  console.log('\n=== GloveCubs quarantine plan (planning only — executes nothing) ===');
  console.log(`Source: ${inPath}`);
  console.log(`Candidates: ${plan.summary.totalCandidates}`);
  console.log(`Requires manual review: ${plan.summary.requiresManualReview}`);
  console.log(`Never auto-delete: ${plan.summary.neverAutoDelete}`);
  console.log(`Safe to archive later (after FK check): ${plan.summary.safeToArchiveLater}`);
  console.log(`KPI exclude only: ${plan.summary.kpiExcludeOnly}`);

  if (plan.meta.partialTables?.length) {
    console.log('\nPartial sample coverage (re-run report with more samples before execution):');
    for (const p of plan.meta.partialTables) {
      console.log(`  • ${p.table}: ${p.flagged} flagged, ${p.sampled} in plan`);
    }
  }

  console.log('\nBy cleanup risk:');
  for (const [risk, count] of Object.entries(plan.summary.byCleanupRisk)) {
    console.log(`  ${risk}: ${count}`);
  }

  console.log('\nSample candidates:');
  for (const c of plan.candidates.slice(0, 8)) {
    console.log(`  • [${c.cleanupRisk}] ${c.table} id=${c.id} (${c.entityLabel}) → ${c.proposedOperation}`);
  }
  if (plan.candidates.length > 8) {
    console.log(`  … and ${plan.candidates.length - 8} more`);
  }

  console.log('\nThis plan does NOT modify data. Operator approval required before any cleanup slice.');

  if (wantJson || writeBoth) {
    const jsonOut = outArg && outArg.endsWith('.json') ? outPath : path.join(process.cwd(), 'quarantine-plan.json');
    fs.writeFileSync(jsonOut, JSON.stringify(plan, null, 2), 'utf8');
    console.log(`\nWrote ${jsonOut}`);
  }

  if (wantCsv || writeBoth) {
    const csvOut = outArg && outArg.endsWith('.csv') ? outPath : path.join(process.cwd(), 'quarantine-plan.csv');
    fs.writeFileSync(csvOut, quarantinePlanToCsv(plan), 'utf8');
    console.log(`Wrote ${csvOut}`);
  }
}

main();

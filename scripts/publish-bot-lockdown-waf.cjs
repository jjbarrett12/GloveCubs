'use strict';

/**
 * Publish GloveCubs bot-lockdown WAF config via `vercel api` (authenticated CLI).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'prj_N0EIAYhHKwyORCuPBgh1Yibq9ID0';
const TEAM_ID = 'team_kps9nhK5PNmIe9I9gaYNuMbP';
const VC_JS = path.join(
  process.env.APPDATA,
  'npm',
  'node_modules',
  'vercel',
  'dist',
  'vc.js',
);

function vercel(args) {
  const r = spawnSync(process.execPath, [VC_JS, ...args], {
    encoding: 'utf8',
    shell: false,
  });
  if (r.status !== 0) {
    throw new Error(
      `vercel ${args.join(' ')} failed: ${r.stderr || r.stdout || r.status}`,
    );
  }
  return r.stdout;
}

function rateLimitRule(name, description, pathPrefix, method, limit, windowSec) {
  const conditions = [{ type: 'path', op: 'pre', value: pathPrefix }];
  if (method) {
    conditions.push({ type: 'method', op: 'eq', value: method });
  }
  return {
    name,
    description,
    active: true,
    conditionGroup: [{ conditions }],
    action: {
      mitigate: {
        action: 'rate_limit',
        rateLimit: {
          algo: 'fixed_window',
          window: windowSec,
          limit,
          keys: ['ip'],
          action: 'deny',
        },
      },
    },
  };
}

function main() {
  const overview = JSON.parse(vercel(['firewall', 'overview', '--json']));
  const active = overview.active;
  if (!active || !String(active.projectKey || '').includes(PROJECT_ID)) {
    throw new Error('Unexpected firewall project');
  }

  const rules = [
    rateLimitRule(
      'Emergency rate limit /store',
      'Deny IPs exceeding 20 req/min on /store',
      '/store',
      null,
      20,
      60,
    ),
    rateLimitRule(
      'Emergency rate limit /request-pricing',
      'Deny IPs exceeding 15 req/min on /request-pricing',
      '/request-pricing',
      null,
      15,
      60,
    ),
    rateLimitRule(
      'Emergency rate limit /api/store',
      'Deny IPs exceeding 40 req/min on catalog API',
      '/api/store',
      null,
      40,
      60,
    ),
    {
      name: 'Emergency rate limit GET /login',
      description: 'Deny IPs exceeding 20 GET/min on public /login page shell',
      active: true,
      conditionGroup: [
        {
          conditions: [
            { type: 'path', op: 'eq', value: '/login' },
            { type: 'method', op: 'eq', value: 'GET' },
          ],
        },
      ],
      action: {
        mitigate: {
          action: 'rate_limit',
          rateLimit: {
            algo: 'fixed_window',
            window: 60,
            limit: 20,
            keys: ['ip'],
            action: 'deny',
          },
        },
      },
    },
    rateLimitRule(
      'Lockdown rate limit POST /api/leads/request-pricing',
      'Deny IPs exceeding 3 pricing submissions / 10 min',
      '/api/leads/request-pricing',
      'POST',
      3,
      600,
    ),
    rateLimitRule(
      'Lockdown rate limit POST /api/contact',
      'Deny IPs exceeding 3 contact submissions / 10 min',
      '/api/contact',
      'POST',
      3,
      600,
    ),
    rateLimitRule(
      'Lockdown rate limit POST /api/quote-request',
      'Deny IPs exceeding 5 quote submissions / 10 min',
      '/api/quote-request',
      'POST',
      5,
      600,
    ),
    rateLimitRule(
      'Lockdown rate limit POST /api/auth/self-signup/finalize',
      'Deny IPs exceeding 5 signup finalize / 10 min',
      '/api/auth/self-signup/finalize',
      'POST',
      5,
      600,
    ),
  ];

  const putBody = {
    firewallEnabled: true,
    rules,
    crs: active.crs,
    ips: active.ips || [],
    // Keep managed rules clean — only active + action (no ruleGroups/updatedAt)
    managedRules: {
      bot_protection: { active: true, action: 'challenge' },
      ai_bots: { active: true, action: 'deny' },
    },
    botIdEnabled: true,
  };

  const putPath = path.join(__dirname, '_tmp-firewall-put.json');
  fs.writeFileSync(putPath, JSON.stringify(putBody));

  const putOut = vercel([
    'api',
    `/v1/security/firewall/config?projectId=${PROJECT_ID}&teamId=${TEAM_ID}`,
    '-X',
    'PUT',
    '--input',
    putPath,
    '-H',
    'Content-Type: application/json',
    '--raw',
  ]);

  const result = JSON.parse(putOut);
  const a = result.active || {};
  const summary = {
    ok: true,
    version: a.version,
    managedRules: a.managedRules,
    botIdEnabled: a.botIdEnabled,
    rules: (a.rules || []).map((r) => ({
      name: r.name,
      action: r.action?.mitigate?.action,
      rateLimit: r.action?.mitigate?.rateLimit || null,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(__dirname, '..', 'debug-bot-lockdown-waf.json'),
    JSON.stringify(summary, null, 2),
  );
}

main();

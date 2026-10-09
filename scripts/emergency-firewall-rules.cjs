/**
 * Publish permanent GloveCubs WAF rate limits (no blanket challenges).
 * Keeps /store, /request-pricing, and /api/store catalog API guarded by IP rate limits → deny.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const PROJECT_ID = "prj_N0EIAYhHKwyORCuPBgh1Yibq9ID0";
const TEAM_ID = "team_kps9nhK5PNmIe9I9gaYNuMbP";
const LOG = path.join(__dirname, "..", "debug-ae46a2.log");

const MANAGED_RULE_NAMES = new Set([
  "Emergency rate limit /store",
  "Emergency rate limit /request-pricing",
  "Emergency rate limit /api/store",
  "Emergency rate limit GET /login",
  "Emergency challenge /store",
  "Emergency challenge /request-pricing",
]);

function emit(payload) {
  fs.appendFileSync(
    LOG,
    JSON.stringify({ sessionId: "ae46a2", timestamp: Date.now(), ...payload }) + "\n",
  );
}

function readToken() {
  const p = path.join(process.env.APPDATA, "com.vercel.cli", "Data", "auth.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const token = j.token || j.accessToken || j.refreshToken;
  if (!token) throw new Error("No token in auth.json");
  return token;
}

function request(method, urlPath, body) {
  const token = readToken();
  const bodyStr = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.vercel.com",
        path: urlPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            /* keep */
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function rateLimitDenyRule(name, description, pathPrefix, limit, extraConditions = []) {
  return {
    name,
    description,
    active: true,
    conditionGroup: [
      {
        conditions: [
          { type: "path", op: "pre", value: pathPrefix },
          ...extraConditions,
        ],
      },
    ],
    action: {
      mitigate: {
        action: "rate_limit",
        rateLimit: {
          algo: "fixed_window",
          window: 60,
          limit,
          keys: ["ip"],
          action: "deny",
        },
      },
    },
  };
}

async function main() {
  const mode = process.argv[2] || "rate-limits-only";

  const proj = await request(
    "GET",
    `/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`,
  );
  const name = proj.body && proj.body.name;
  if (proj.status !== 200 || name !== "glovecubs") {
    console.error("ABORT: project verify failed", proj.status, name);
    process.exit(2);
  }

  const before = await request(
    "GET",
    `/v1/security/firewall/config?projectId=${PROJECT_ID}&teamId=${TEAM_ID}`,
  );

  const existingRules =
    before.body && before.body.active && Array.isArray(before.body.active.rules)
      ? before.body.active.rules
      : [];

  const keep = existingRules.filter((r) => !MANAGED_RULE_NAMES.has(r.name));

  let rules;
  if (mode === "with-challenges") {
    rules = [
      ...keep,
      rateLimitDenyRule(
        "Emergency rate limit /store",
        "Deny IPs exceeding 20 req/min on /store",
        "/store",
        20,
      ),
      rateLimitDenyRule(
        "Emergency rate limit /request-pricing",
        "Deny IPs exceeding 15 req/min on /request-pricing",
        "/request-pricing",
        15,
      ),
      rateLimitDenyRule(
        "Emergency rate limit /api/store",
        "Deny IPs exceeding 40 req/min on catalog API",
        "/api/store",
        40,
      ),
      {
        name: "Emergency rate limit GET /login",
        description: "Deny IPs exceeding 20 GET/min on public /login page shell",
        active: true,
        conditionGroup: [
          {
            conditions: [
              { type: "path", op: "eq", value: "/login" },
              { type: "method", op: "eq", value: "GET" },
            ],
          },
        ],
        action: {
          mitigate: {
            action: "rate_limit",
            rateLimit: {
              algo: "fixed_window",
              window: 60,
              limit: 20,
              keys: ["ip"],
              action: "deny",
            },
          },
        },
      },
      {
        name: "Emergency challenge /store",
        description: "Challenge all /store (temporary)",
        active: true,
        conditionGroup: [
          { conditions: [{ type: "path", op: "pre", value: "/store" }] },
        ],
        action: { mitigate: { action: "challenge" } },
      },
      {
        name: "Emergency challenge /request-pricing",
        description: "Challenge all /request-pricing (temporary)",
        active: true,
        conditionGroup: [
          { conditions: [{ type: "path", op: "pre", value: "/request-pricing" }] },
        ],
        action: { mitigate: { action: "challenge" } },
      },
    ];
  } else {
    // Permanent: rate limits only — no blanket challenges.
    rules = [
      ...keep,
      rateLimitDenyRule(
        "Emergency rate limit /store",
        "Deny IPs exceeding 20 req/min on /store",
        "/store",
        20,
      ),
      rateLimitDenyRule(
        "Emergency rate limit /request-pricing",
        "Deny IPs exceeding 15 req/min on /request-pricing",
        "/request-pricing",
        15,
      ),
      rateLimitDenyRule(
        "Emergency rate limit /api/store",
        "Deny IPs exceeding 40 req/min on catalog API",
        "/api/store",
        40,
      ),
      {
        name: "Emergency rate limit GET /login",
        description: "Deny IPs exceeding 20 GET/min on public /login page shell",
        active: true,
        conditionGroup: [
          {
            conditions: [
              { type: "path", op: "eq", value: "/login" },
              { type: "method", op: "eq", value: "GET" },
            ],
          },
        ],
        action: {
          mitigate: {
            action: "rate_limit",
            rateLimit: {
              algo: "fixed_window",
              window: 60,
              limit: 20,
              keys: ["ip"],
              action: "deny",
            },
          },
        },
      },
    ];
  }

  const putBody = { firewallEnabled: true, rules };
  if (before.body && before.body.active) {
    const a = before.body.active;
    if (a.managedRules) putBody.managedRules = a.managedRules;
    if (a.crs) putBody.crs = a.crs;
    if (a.ips) putBody.ips = a.ips;
    if (typeof a.botIdEnabled === "boolean") putBody.botIdEnabled = a.botIdEnabled;
    if (a.rulesets) putBody.rulesets = a.rulesets;
    if (a.logHeaders) putBody.logHeaders = a.logHeaders;
  }

  const put = await request(
    "PUT",
    `/v1/security/firewall/config?projectId=${PROJECT_ID}&teamId=${TEAM_ID}`,
    putBody,
  );

  const after = await request(
    "GET",
    `/v1/security/firewall/config?projectId=${PROJECT_ID}&teamId=${TEAM_ID}`,
  );

  const activeRules =
    after.body && after.body.active && Array.isArray(after.body.active.rules)
      ? after.body.active.rules.map((r) => ({
          id: r.id,
          name: r.name,
          active: r.active,
          action: r.action && r.action.mitigate && r.action.mitigate.action,
          rateLimit:
            r.action && r.action.mitigate && r.action.mitigate.rateLimit,
        }))
      : [];

  emit({
    hypothesisId: "P7",
    location: "scripts/emergency-firewall-rules.cjs",
    message: "firewall_publish",
    data: { mode, putStatus: put.status, rules: activeRules },
    runId: "phase2",
  });

  console.log(
    JSON.stringify(
      {
        ok: put.status === 200,
        mode,
        httpStatus: put.status,
        project: name,
        rules: activeRules,
        putError: put.body && (put.body.error || put.body.message || null),
      },
      null,
      2,
    ),
  );
  if (put.status !== 200) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

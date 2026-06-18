/**
 * Shared .env parsing and login env validation (scripts only). Never logs full secret values.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storefrontRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(storefrontRoot, "..");

export const PUBLIC_SUPABASE_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

/** Required for /login, post-login routing, admin gate, and buyer portal server reads. */
export const REQUIRED_LOGIN_ENV_KEYS = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    visibility: "public",
    description: "Supabase project URL for browser auth",
    fallbacks: ["SUPABASE_URL"],
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    visibility: "public",
    description: "Supabase anon public key for browser auth",
    fallbacks: ["SUPABASE_ANON_KEY"],
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    visibility: "server-only",
    description: "Supabase service role key for server-side auth routing and portal gates",
    fallbacks: [],
  },
];

export const DEFAULT_ENV_FILE_PATHS = [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(storefrontRoot, ".env"),
  path.join(storefrontRoot, ".env.local"),
];

const SECRET_KEY_PATTERNS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "JWT_SECRET",
  "SMTP_PASS",
  "INTERNAL_API_KEY",
  "CATALOGOS_ADMIN_SECRET",
];

/**
 * @param {unknown} raw
 * @returns {"missing" | "blank" | "ok"}
 */
export function envKeyStatus(raw) {
  if (raw === undefined || raw === null) return "missing";
  if (typeof raw !== "string") return "blank";
  if (raw.trim() === "") return "blank";
  return "ok";
}

export function parseEnvFile(filePath) {
  const vars = {};
  const lines = [];
  try {
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      lines.push(line);
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
    return { vars, lines, error: null };
  } catch (e) {
    return { vars: {}, lines: [], error: e };
  }
}

/**
 * Merge env files in order; only non-blank trimmed values are kept.
 * @param {string[]} filePaths
 */
export function mergeEnvFileVars(filePaths) {
  const merged = {};
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const { vars, error } = parseEnvFile(filePath);
    if (error) continue;
    for (const [key, value] of Object.entries(vars)) {
      if (envKeyStatus(value) === "ok") merged[key] = value.trim();
    }
  }
  return merged;
}

/**
 * Resolve effective env for deploy validation.
 * Explicit blank values in process.env fail (common after `vercel env pull` writing KEY="").
 * Undefined process.env falls back to merged env files (local dev).
 *
 * @param {{ processEnv?: NodeJS.ProcessEnv, envFilePaths?: string[], deployOnly?: boolean }} [options]
 */
export function resolveEffectiveLoginEnv(options = {}) {
  const processEnv = options.processEnv ?? process.env;
  const deployOnly = Boolean(options.deployOnly);
  const envFilePaths = options.envFilePaths ?? DEFAULT_ENV_FILE_PATHS;
  const fileMerged = deployOnly ? {} : mergeEnvFileVars(envFilePaths);

  /** @type {Record<string, { key: string, status: "ok" | "missing" | "blank", visibility: string, description: string, source: "process" | "file" | "fallback", hostname?: string | null }>} */
  const resolved = {};

  for (const spec of REQUIRED_LOGIN_ENV_KEYS) {
    const candidates = [spec.key, ...spec.fallbacks];
    let status = "missing";
    let source = "process";
    let hostname = null;

    const processRaw = processEnv[spec.key];
    if (processEnv[spec.key] !== undefined) {
      const processStatus = envKeyStatus(processRaw);
      if (processStatus === "ok") {
        status = "ok";
        source = "process";
        if (spec.key === "NEXT_PUBLIC_SUPABASE_URL") {
          hostname = supabaseUrlHost(String(processRaw).trim());
        }
        resolved[spec.key] = {
          key: spec.key,
          status,
          visibility: spec.visibility,
          description: spec.description,
          source,
          hostname,
        };
        continue;
      }
      if (processStatus === "blank") {
        resolved[spec.key] = {
          key: spec.key,
          status: "blank",
          visibility: spec.visibility,
          description: spec.description,
          source: "process",
          hostname: null,
        };
        continue;
      }
    }

    if (!deployOnly) {
      for (const candidate of candidates) {
        const fileVal = fileMerged[candidate];
        if (envKeyStatus(fileVal) === "ok") {
          status = "ok";
          source = candidate === spec.key ? "file" : "fallback";
          if (spec.key === "NEXT_PUBLIC_SUPABASE_URL") {
            hostname = supabaseUrlHost(String(fileVal).trim());
          }
          resolved[spec.key] = {
            key: spec.key,
            status,
            visibility: spec.visibility,
            description: spec.description,
            source,
            hostname,
          };
          break;
        }
      }
    }

    if (!resolved[spec.key]) {
      resolved[spec.key] = {
        key: spec.key,
        status,
        visibility: spec.visibility,
        description: spec.description,
        source: deployOnly ? "process" : "file",
        hostname: null,
      };
    }
  }

  return resolved;
}

/**
 * @param {ReturnType<typeof resolveEffectiveLoginEnv>} resolved
 */
export function validateRequiredLoginEnv(resolved) {
  return REQUIRED_LOGIN_ENV_KEYS.map((spec) => resolved[spec.key]).filter((row) => row.status !== "ok");
}

export function supabaseUrlHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isSecretEnvKey(key) {
  if (SECRET_KEY_PATTERNS.includes(key)) return true;
  return /SECRET|PASS|TOKEN|KEY$/i.test(key) && key !== "NEXT_PUBLIC_SUPABASE_URL";
}

export function maskEnvValue(key, value) {
  if (!value || String(value).trim() === "") return "(empty)";
  if (isSecretEnvKey(key)) return `[REDACTED len=${String(value).length}]`;
  if (key === "NEXT_PUBLIC_SUPABASE_URL") {
    const host = supabaseUrlHost(String(value));
    return host ? `host=${host}` : `[invalid-url len=${String(value).length}]`;
  }
  if (String(value).length <= 8) return `[len=${String(value).length}]`;
  return `[len=${String(value).length}]`;
}

export function formatEnvLine(key, value) {
  if (/[\s#"'=]/.test(value)) return `${key}="${value.replace(/"/g, '\\"')}"`;
  return `${key}=${value}`;
}

/**
 * @param {ReturnType<typeof validateRequiredLoginEnv> | ReturnType<typeof resolveEffectiveLoginEnv>} input
 * @param {{ ok?: boolean, deployOnly?: boolean }} [options]
 */
export function formatLoginEnvReport(input, options = {}) {
  const lines = [];
  const problems = Array.isArray(input) ? input : validateRequiredLoginEnv(input);
  const resolved = Array.isArray(input) ? null : input;

  if (options.ok || problems.length === 0) {
    lines.push("[env:check] Required Supabase login env OK");
    const rows = resolved
      ? Object.values(resolved)
      : REQUIRED_LOGIN_ENV_KEYS.map((spec) => ({
          key: spec.key,
          status: "ok",
          visibility: spec.visibility,
          hostname: null,
        }));
    for (const row of rows) {
      const hostPart =
        row.key === "NEXT_PUBLIC_SUPABASE_URL" && row.hostname ? ` host=${row.hostname}` : "";
      lines.push(`  ${row.key}: present (${row.visibility})${hostPart}`);
    }
    return lines.join("\n");
  }

  lines.push("[env:check] Required Supabase login env is not ready:");
  for (const p of problems) {
    const hostPart =
      p.key === "NEXT_PUBLIC_SUPABASE_URL" && p.status === "blank"
        ? ""
        : p.hostname
          ? ` host=${p.hostname}`
          : "";
    lines.push(
      `  ${p.key}: ${p.status} (${p.visibility})${hostPart}${p.status === "blank" ? ' — e.g. KEY="" from vercel env pull' : ""}`,
    );
  }

  lines.push("");
  lines.push("Fix:");
  if (options.deployOnly) {
    lines.push("  Set non-empty values in your deployment host (Vercel → Project → Settings → Environment Variables).");
    lines.push("  Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  } else {
    lines.push("  cd storefront");
    lines.push("  npm run env:sync     # copy from repo root .env when SUPABASE_URL / keys exist");
    lines.push("  npm run env:check    # re-verify");
    lines.push("");
    lines.push("  Or set keys in storefront/.env.local from Supabase Dashboard → Settings → API.");
  }
  lines.push("");
  lines.push("Warning: `vercel env pull` can write blank NEXT_PUBLIC_SUPABASE_*=\"\" when the");
  lines.push("target Vercel environment lacks those variables. Blank values are invalid — do not");
  lines.push("commit them and do not deploy with them.");

  return lines.join("\n");
}

/** @returns {boolean} true when output appears to contain a raw JWT/secret-like value */
export function reportContainsSecretLeak(text) {
  if (typeof text !== "string") return false;
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(text)) return true;
  if (/sb_[a-z]+_[A-Za-z0-9]{20,}/.test(text)) return true;
  if (/service_role/.test(text) && /eyJ/.test(text)) return true;
  return false;
}

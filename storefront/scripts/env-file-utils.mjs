/**
 * Shared .env parsing helpers (scripts only). Never logs full secret values.
 */
import fs from "node:fs";

export const PUBLIC_SUPABASE_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

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

export function envKeyStatus(raw) {
  if (raw === undefined) return "missing";
  if (typeof raw !== "string" || raw.trim() === "") return "blank";
  return "ok";
}

export function maskEnvValue(key, value) {
  if (!value || value.trim() === "") return "(empty)";
  if (key === "SUPABASE_SERVICE_ROLE_KEY") return `[REDACTED len=${value.length}]`;
  if (value.length <= 8) return `${value.slice(0, 2)}…${value.slice(-2)}`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function formatEnvLine(key, value) {
  if (/[\s#"'=]/.test(value)) return `${key}="${value.replace(/"/g, '\\"')}"`;
  return `${key}=${value}`;
}

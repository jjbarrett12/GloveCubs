/**
 * Server-only SQL for private schemas (catalogos, catalog_v2, gc_commerce).
 * PostgREST must not expose those schemas.
 * Production uses SUPABASE_DB_URL only. The staging SQL API is unreachable there.
 */

import { Pool } from "pg";
import {
  STAGING_PROJECT_REF,
  directDatabaseUrl,
  privateDbConfigured as accessConfigured,
  resolvePrivateDatabaseAccess,
} from "./private-db-access";

const PRODUCTION_REFS = ["mnmagwsenzvetwngaszv", "kfrizyygvcjbomxdrdal"];

type PgPool = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<PgClient>;
  end: () => Promise<void>;
};

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release: () => void;
};

export type PrivateQuery = (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;

let pool: PgPool | null = null;
let poolUrl: string | null = null;

export function privateDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return directDatabaseUrl(env);
}

const STAGING_SQL_API = `https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/database/query`;

export function privateDbConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return accessConfigured(env);
}

export function assertPrivateDbProcess(scope: typeof globalThis = globalThis): void {
  if (typeof (scope as { window?: unknown }).window !== "undefined") {
    throw new Error("Private database access is server-only and cannot run in the browser.");
  }
}

export function assertPrivateDatabaseUrl(url: string, env: NodeJS.ProcessEnv = process.env): void {
  const access = resolvePrivateDatabaseAccess({ ...env, SUPABASE_DB_URL: url, STAGING_DATABASE_URL: url });
  if (access.kind === "refused") throw new Error(access.reason);
  if (access.kind !== "direct") throw new Error("Private database URL must be a postgres connection string.");
}

function loadPgPool(url: string): PgPool {
  return new Pool({ connectionString: url, max: 4 }) as PgPool;
}

export function getPrivatePool(env: NodeJS.ProcessEnv = process.env): PgPool {
  assertPrivateDbProcess();
  const url = privateDatabaseUrl(env);
  if (!url) throw new Error("SUPABASE_DB_URL or STAGING_DATABASE_URL is required for private schema access.");
  assertPrivateDatabaseUrl(url, env);
  if (!pool || poolUrl !== url) {
    pool = loadPgPool(url);
    poolUrl = url;
  }
  return pool;
}

function literal(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      return `ARRAY[${value.map((item) => literal(item)).join(", ")}]::text[]`;
    }
    return `${literal(JSON.stringify(value))}::jsonb`;
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let tag = "q";
  while (text.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${text}$${tag}$`;
}

export function sqlWithLiterals(text: string, params: unknown[] = []): string {
  let sql = text;
  for (let index = params.length; index >= 1; index -= 1) {
    sql = sql.replaceAll(`$${index}`, `\u0000PARAM${index}\u0000`);
  }
  for (let index = 1; index <= params.length; index += 1) {
    sql = sql.replaceAll(`\u0000PARAM${index}\u0000`, literal(params[index - 1]));
  }
  return sql;
}

async function queryStagingApi(
  sql: string,
  env: NodeJS.ProcessEnv
): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
  const access = resolvePrivateDatabaseAccess(env);
  if (access.kind !== "staging-api") throw new Error("Staging SQL API is only available for an explicitly allowed staging runtime.");
  if (PRODUCTION_REFS.some((ref) => sql.includes(ref))) throw new Error("Refusing SQL that names a production project.");
  const token = String(env.STAGING_SQL_ACCESS_TOKEN || "").trim();
  if (!token.startsWith("sbp")) throw new Error("Staging SQL API credential was not available.");
  const response = await fetch(STAGING_SQL_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Staging SQL API returned a non-JSON response (${response.status}).`);
  }
  if (!response.ok || (body && typeof body === "object" && !Array.isArray(body) && "message" in body)) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : text.slice(0, 300);
    throw new Error(message.slice(0, 500));
  }
  const rows = Array.isArray(body) ? (body as Record<string, unknown>[]) : [];
  return { rows, rowCount: rows.length };
}

let announcedTransport: string | null = null;

function announceTransport(transport: "postgres" | "staging-sql-api"): void {
  if (process.env.NODE_ENV === "test" || announcedTransport === transport) return;
  announcedTransport = transport;
  console.info(`[catalogos] private schema transport: ${transport}`);
}

export const privateSqlTransport = {
  postgres(sql: string, env: NodeJS.ProcessEnv = process.env) {
    announceTransport("postgres");
    return getPrivatePool(env).query(sql);
  },
  stagingApi(sql: string, env: NodeJS.ProcessEnv = process.env) {
    announceTransport("staging-sql-api");
    return queryStagingApi(sql, env);
  },
};

export async function queryPrivate(
  text: string,
  params: unknown[] = [],
  env: NodeJS.ProcessEnv = process.env
): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
  assertPrivateDbProcess();
  const sql = sqlWithLiterals(text, params);
  const access = resolvePrivateDatabaseAccess(env);
  if (access.kind === "direct") return privateSqlTransport.postgres(sql, env);
  if (access.kind === "staging-api") return privateSqlTransport.stagingApi(sql, env);
  if (access.kind === "refused") throw new Error(access.reason);
  throw new Error("Private schema access requires SUPABASE_DB_URL or STAGING_DATABASE_URL.");
}

export async function withPrivateTransaction<T>(fn: (query: PrivateQuery) => Promise<T>): Promise<T> {
  const client = await getPrivatePool().connect();
  try {
    await client.query("BEGIN");
    const query: PrivateQuery = (text, params = []) => client.query(text, params);
    const result = await fn(query);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original error is the one the caller needs.
    }
    throw error;
  } finally {
    client.release();
  }
}

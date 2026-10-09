import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../..");
const PRIVATE_FILES = new Set([
  path.normalize(path.join(SRC, "lib/db/private-sql.ts")),
  path.normalize(path.join(SRC, "lib/db/private-query.ts")),
  path.normalize(path.join(SRC, "lib/db/private-db-access.ts")),
  path.normalize(path.join(SRC, "lib/db/client.ts")),
]);

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function directive(source: string): "client" | "server" | null {
  const start = source.slice(0, 400);
  if (/^\uFEFF?\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(start)) return "client";
  if (/^\uFEFF?\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use server["']/.test(start)) return "server";
  return null;
}

function runtimeSource(source: string): string {
  return source
    .replace(/import\s+type\s+[\s\S]*?\sfrom\s+["'][^"']+["'];?/g, "")
    .replace(/export\s+type\s+[\s\S]*?\sfrom\s+["'][^"']+["'];?/g, "");
}

function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  const text = runtimeSource(source);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) found.push(match[1]!);
  return found;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(fromFile), spec)
      : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return path.normalize(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function reaches(start: string, stopAtServerBoundary: boolean): string[] {
  const hits: string[] = [];
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (PRIVATE_FILES.has(file)) {
      hits.push(file);
      continue;
    }
    let source = "";
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (stopAtServerBoundary && file !== start && directive(source) === "server") continue;
    for (const spec of specifiers(source)) {
      const next = resolveSpec(file, spec);
      if (next) queue.push(next);
    }
  }
  return hits;
}

describe("private database client boundary", () => {
  it("keeps browser components from importing the private database module", () => {
    const offenders: string[] = [];
    for (const file of listFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      if (directive(source) !== "client") continue;
      if (/SUPABASE_DB_URL|STAGING_DATABASE_URL|STAGING_SQL_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/.test(source)) {
        offenders.push(`${path.relative(SRC, file)} names a server database credential`);
      }
      for (const hit of reaches(file, true)) {
        offenders.push(`${path.relative(SRC, file)} reaches ${path.relative(SRC, hit)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps middleware from bundling the private database module", () => {
    const middleware = path.join(SRC, "middleware.ts");
    const hits = reaches(middleware, false).map((file) => path.relative(SRC, file));
    expect(hits).toEqual([]);
  });

  it("does not shell out or publish the database URL to the browser", () => {
    const source = readFileSync(path.join(SRC, "lib/db/private-sql.ts"), "utf8");
    expect(source).toContain('from "pg"');
    expect(source).not.toContain("eval(");
    expect(source).not.toMatch(/child_process|execFile|execSync|supabase\s+/);
    const tree = listFiles(SRC)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(tree).not.toContain("NEXT_PUBLIC_SUPABASE_DB_URL");
    expect(tree).not.toContain("NEXT_PUBLIC_STAGING_DATABASE_URL");
  });
});

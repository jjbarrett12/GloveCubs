import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseEnvFile(filePath) {
  const out = {};
  try {
    for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
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
      out[key] = val;
    }
  } catch {
    /* optional file */
  }
  return out;
}

function mergeEnvFiles(...files) {
  const merged = {};
  for (const file of files) {
    for (const [key, value] of Object.entries(parseEnvFile(file))) {
      if (typeof value === "string" && value.trim()) merged[key] = value.trim();
    }
  }
  return merged;
}

const mergedEnv = mergeEnvFiles(
  path.join(__dirname, "../.env"),
  path.join(__dirname, "../.env.local"),
  path.join(__dirname, ".env"),
  path.join(__dirname, ".env.local"),
);

function applySupabaseEnvFallbacks() {
  const url = mergedEnv.NEXT_PUBLIC_SUPABASE_URL || mergedEnv.SUPABASE_URL || "";
  const anon = mergedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || mergedEnv.SUPABASE_ANON_KEY || "";
  const service = mergedEnv.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && url) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() && anon) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon;
  }
  if (!process.env.SUPABASE_URL?.trim() && url) {
    process.env.SUPABASE_URL = url;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && service) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  }
}

applySupabaseEnvFallbacks();

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const publicSupabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

/** @type {import('next').NextConfig} */

const nextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseAnon,
  },
  reactStrictMode: true,
  /**
   * `storefront/lib/*.js` mirrors repo-root `lib/` for modules required from CJS
   * (e.g. active-company-resolve + supabaseAdmin) so Vercel can bundle them.
   * Pin `node_modules` resolution to this package so `@supabase/supabase-js`
   * resolves from the storefront install.
   */
  webpack: (config, { dev }) => {
    /** Avoid stale/missing chunk refs on Windows when `.next` is deleted while dev is running. */
    if (dev) {
      config.cache = false;
    }
    const storefrontNodeModules = path.resolve(__dirname, "node_modules");
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@supabase/supabase-js": path.join(storefrontNodeModules, "@supabase/supabase-js"),
      "@glove-sku-intelligence": path.resolve(__dirname, "../lib/glove-sku-intelligence/index.ts"),
      "@glove-sku-intelligence/glove-size-normalization": path.resolve(
        __dirname,
        "../lib/glove-sku-intelligence/glove-size-normalization.ts"
      ),
    };
    const existing = Array.isArray(config.resolve.modules)
      ? config.resolve.modules
      : [];
    if (!existing.includes(storefrontNodeModules)) {
      config.resolve.modules = [...existing, storefrontNodeModules, "node_modules"];
    }
    return config;
  },
  /** Internal rewrite: legacy path shares the same multipart intake handler as canonical POST /api/invoice/intake. */
  async rewrites() {
    return [{ source: "/api/ai/invoice/extract", destination: "/api/invoice/intake" }];
  },
  /** Legacy SPA paths Express hands off with HTTP 308 — keep targets valid on Next. */
  async redirects() {
    return [
      /** Canonical workspace entry: procurement app owns HTML under `/workspace/procurement/*`. */
      { source: '/workspace', destination: '/workspace/procurement', permanent: true },
      { source: '/workspace/', destination: '/workspace/procurement', permanent: true },
      { source: '/b2b', destination: '/request-pricing', permanent: true },
      {
        source: '/gloves/:segment/:slug/size/:size',
        destination: '/store/p/:slug',
        permanent: true,
      },
      { source: '/gloves/:segment/:slug', destination: '/store/p/:slug', permanent: true },
      { source: '/gloves/:segment', destination: '/store', permanent: true },
      { source: '/gloves', destination: '/store', permanent: true },
      /** Legacy guest order links → honest lookup shell (not homepage). */
      {
        source: '/portal-order/:path*',
        destination: '/order-status?source=legacy-order-link',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

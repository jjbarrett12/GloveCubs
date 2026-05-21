import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */

const nextConfig = {
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

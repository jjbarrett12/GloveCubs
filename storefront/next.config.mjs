/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
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
      /** Legacy industry template linked here; dedicated auth route not shipped yet. */
      { source: '/login', destination: '/request-pricing', permanent: false },
      /** Legacy guest order links; refine when a dedicated Next route exists. */
      { source: '/portal-order/:path*', destination: '/', permanent: false },
    ];
  },
};

export default nextConfig;

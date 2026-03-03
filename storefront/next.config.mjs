/** @type {import('next').NextConfig} */

// Admin API origin for rewrites (dev: UI on :3004, API on :3001). No hardcoded ports elsewhere.
const adminApiOrigin =
  process.env.GLOVECUBS_ADMIN_API_ORIGIN ||
  process.env.NEXT_PUBLIC_GLOVECUBS_ADMIN_API_ORIGIN ||
  "http://localhost:3001";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/admin/:path*",
        destination: `${adminApiOrigin}/api/admin/:path*`,
      },
    ];
  },
};

export default nextConfig;

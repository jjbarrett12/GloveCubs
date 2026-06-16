import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias["@glove-sku-intelligence"] = path.resolve(__dirname, "../lib/glove-sku-intelligence/index.ts");
    config.resolve.alias["@glove-sku-intelligence/glove-size-normalization"] = path.resolve(
      __dirname,
      "../lib/glove-sku-intelligence/glove-size-normalization.ts"
    );
    return config;
  },
};
export default nextConfig;

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ssrf-safe-fetch": path.resolve(__dirname, "../lib/ssrf-safe-fetch/index.ts"),
      "@invoice-line-parse": path.resolve(__dirname, "../lib/invoice-line-parse/index.ts"),
      "@commerce-packaging": path.resolve(__dirname, "../lib/commerce-packaging"),
      "@commerce-packaging/extract": path.resolve(__dirname, "../lib/commerce-packaging/extract.ts"),
      "@commerce-packaging/labels": path.resolve(__dirname, "../lib/commerce-packaging/labels.ts"),
      "@commerce-packaging/types": path.resolve(__dirname, "../lib/commerce-packaging/types.ts"),
      "@commerce-packaging/staging-bridge": path.resolve(__dirname, "../lib/commerce-packaging/staging-bridge.ts"),
      "@commerce-packaging/readiness": path.resolve(__dirname, "../lib/commerce-packaging/readiness.ts"),
      "@commerce-packaging/metadata-mirror": path.resolve(__dirname, "../lib/commerce-packaging/metadata-mirror.ts"),
      "@glove-sku-intelligence": path.resolve(__dirname, "../lib/glove-sku-intelligence/index.ts"),
      "@glove-sku-intelligence/glove-size-normalization": path.resolve(
        __dirname,
        "../lib/glove-sku-intelligence/glove-size-normalization.ts"
      ),
    },
  },
});

import { defineConfig } from "vitest/config";
import path from "path";

const gloveSkuRoot = path.resolve(__dirname, "../lib/glove-sku-intelligence");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs", "../lib/commerce-packaging/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      { find: "@commerce-packaging", replacement: path.resolve(__dirname, "../lib/commerce-packaging") },
      {
        find: /^@glove-sku-intelligence\/(.+)$/,
        replacement: `${gloveSkuRoot}/$1`,
      },
      {
        find: "@glove-sku-intelligence",
        replacement: path.join(gloveSkuRoot, "index.ts"),
      },
    ],
  },
});

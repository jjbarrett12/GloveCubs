#!/usr/bin/env node
/**
 * Prevent corrupted `.next` builds from concurrent dev + production compile.
 * Run before `next build` (via prebuild) — stops storefront dev ports, then exits 0.
 */
import { killPort } from "./kill-port.mjs";

const STOREFRONT_PORTS = [3005, 3010];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const checkOnly = process.argv.includes("--check-only");

  for (const port of STOREFRONT_PORTS) {
    const pids = killPort(port);
    if (pids.length > 0) {
      console.warn(
        `[guard-next-cache] Stopped process on port ${port} (PID ${pids.join(", ")}) — ` +
          "dev and build must not share `.next`.",
      );
    }
  }

  if (!checkOnly) {
    await sleep(750);
  }

  console.log("[guard-next-cache] Ports clear — safe to compile.");
}

main().catch((err) => {
  console.error("[guard-next-cache] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

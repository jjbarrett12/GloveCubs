#!/usr/bin/env node
/**
 * One-shot recovery: stop dev servers → wipe Next cache → start fresh dev on 3005.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { killPort } from "./kill-port.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runClean() {
  const cleanScript = path.join(__dirname, "clean-next.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cleanScript, "--skip-kill"], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`clean exited ${code}`))));
  });
}

async function main() {
  console.log("[dev-reset] Stopping storefront dev servers on 3005 / 3010…");
  for (const port of [3005, 3010]) {
    const pids = killPort(port);
    if (pids.length) console.log(`[dev-reset] Freed port ${port} (PID ${pids.join(", ")})`);
  }

  await sleep(1000);
  await runClean();

  console.log("[dev-reset] Starting Next dev on http://localhost:3005 …");
  console.log("[dev-reset] Hard-refresh the browser (Ctrl+Shift+R) after Ready.\n");

  const dev = spawn("npm", ["run", "dev"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });

  dev.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error("[dev-reset] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

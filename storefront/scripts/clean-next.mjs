#!/usr/bin/env node
/**
 * Cross-platform cache wipe for Next.js dev stability (Windows + Unix).
 * Stops dev servers first so `.next` is not deleted while Node holds chunk files open.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { killPort } from "./kill-port.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STOREFRONT_PORTS = [3005, 3010];

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy wait — short delay before retrying locked dirs on Windows
  }
}

function rmWithRetry(target, label, attempts = 6) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`[clean:next] removed ${label}`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i === attempts) {
        console.error(`[clean:next] FAILED to remove ${label} after ${attempts} tries: ${msg}`);
        console.error(
          "[clean:next] Stop all `npm run dev` / `next dev` processes, close VS Code terminals on port 3005, then retry.",
        );
        return false;
      }
      console.warn(`[clean:next] retry ${i}/${attempts} for ${label}: ${msg}`);
      sleep(400 * i);
    }
  }
  return false;
}

function stopDevServers() {
  let stopped = false;
  for (const port of STOREFRONT_PORTS) {
    const pids = killPort(port);
    if (pids.length > 0) {
      stopped = true;
      console.log(`[clean:next] stopped dev on port ${port} (PID ${pids.join(", ")})`);
    }
  }
  if (stopped) sleep(900);
}

const skipKill = process.argv.includes("--skip-kill");

if (!skipKill) {
  stopDevServers();
}

let ok = true;
for (const rel of [".next", "node_modules/.cache"]) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) {
    console.log(`[clean:next] skip ${rel} (not present)`);
    continue;
  }
  if (!rmWithRetry(target, rel)) ok = false;
}

if (!ok) process.exit(1);

console.log("[clean:next] done — run `npm run dev` or `npm run dev:reset` from storefront/");

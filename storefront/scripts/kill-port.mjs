#!/usr/bin/env node
/**
 * Free a TCP port by stopping listening processes (Windows + Unix).
 * Used before wiping `.next` so chunk files are not held open.
 */
import { execSync } from "node:child_process";
import { platform } from "node:os";

/**
 * @param {number} port
 * @returns {number[]} PIDs that were signaled
 */
export function killPort(port) {
  const killed = new Set();

  if (platform() === "win32") {
    try {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (!pid || pid === "0") continue;
        killed.add(Number(pid));
      }
    } catch {
      return [];
    }

    for (const pid of killed) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      } catch {
        // Process may have already exited.
      }
    }
    return [...killed];
  }

  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (!Number.isFinite(pid)) continue;
      killed.add(pid);
      try {
        execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      } catch {
        // ignore
      }
    }
  } catch {
    return [];
  }

  return [...killed];
}

function main() {
  const ports = process.argv.slice(2).map((p) => Number(p)).filter((p) => Number.isFinite(p) && p > 0);
  if (ports.length === 0) {
    console.error("Usage: node kill-port.mjs <port> [port...]");
    process.exit(1);
  }

  for (const port of ports) {
    const pids = killPort(port);
    if (pids.length === 0) {
      console.log(`[kill-port] port ${port}: already free`);
    } else {
      console.log(`[kill-port] port ${port}: stopped PID(s) ${pids.join(", ")}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("kill-port.mjs")) {
  main();
}

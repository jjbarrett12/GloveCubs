"use client";

import { useEffect, useRef, useState } from "react";

const IS_DEV = process.env.NODE_ENV === "development";

const CONSOLE_PREFIX = "[GloveCubs UI stability]";
const CHECK_DELAY_MS = 1500;
const RECHECK_MS = 4000;

type CssProbeResult = {
  tailwindUtilityApplied: boolean;
  bodyBackgroundOk: boolean;
  stylesheetLinksOk: boolean;
  failedStylesheetHrefs: string[];
};

type LayoutProbeResult = {
  heroMounted: boolean;
  headerMounted: boolean;
  appRootMounted: boolean;
};

function probeTailwindUtility(): boolean {
  const el = document.createElement("div");
  el.className = "hidden";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  const display = getComputedStyle(el).display;
  el.remove();
  return display === "none";
}

function probeBodyBackground(): boolean {
  const bg = getComputedStyle(document.body).backgroundColor;
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return false;
  return true;
}

function probeStylesheets(): { ok: boolean; failedHrefs: string[] } {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ).filter((l) => l.href.includes("/_next/") || l.href.includes("globals"));

  if (links.length === 0) {
    return { ok: false, failedHrefs: ["(no Next.js stylesheet links found)"] };
  }

  const failed: string[] = [];
  for (const link of links) {
    try {
      const sheet = link.sheet;
      if (!sheet) {
        failed.push(link.href);
        continue;
      }
      void sheet.cssRules;
    } catch {
      failed.push(link.href);
    }
  }

  return { ok: failed.length === 0, failedHrefs: failed };
}

function runCssProbe(): CssProbeResult {
  const sheetProbe = probeStylesheets();
  return {
    tailwindUtilityApplied: probeTailwindUtility(),
    bodyBackgroundOk: probeBodyBackground(),
    stylesheetLinksOk: sheetProbe.ok,
    failedStylesheetHrefs: sheetProbe.failedHrefs,
  };
}

function runLayoutProbe(): LayoutProbeResult {
  return {
    heroMounted: Boolean(document.querySelector('[data-ui-section="hero"]')),
    headerMounted: Boolean(document.querySelector("header")),
    appRootMounted: Boolean(document.querySelector('[data-ui-root="homepage"]')),
  };
}

function cssLooksBroken(probe: CssProbeResult): boolean {
  return (
    !probe.tailwindUtilityApplied ||
    !probe.bodyBackgroundOk ||
    !probe.stylesheetLinksOk
  );
}

function logActionableRecovery(reason: string): void {
  console.error(
    `${CONSOLE_PREFIX} ${reason}\n` +
      "Recovery steps:\n" +
      "  1. Stop the dev server (Ctrl+C)\n" +
      "  2. Run: npm run clean:dev  (or npm run clean:next && npm run dev)\n" +
      "  3. Hard-refresh the browser (Ctrl+Shift+R)\n" +
      "  4. Check Network tab for failed /_next/static/* requests\n" +
      "  5. See storefront/docs/dev-troubleshooting.md",
  );
}

/**
 * Dev-only watchdog: hydration/runtime errors, layout mount checks, missing CSS bundle.
 */
export function DevUiStabilityWatchdog() {
  const [cssWarning, setCssWarning] = useState<string | null>(null);
  const reportedCssRef = useRef(false);
  const reportedLayoutRef = useRef(false);

  useEffect(() => {
    if (!IS_DEV) return;

    const onError = (event: ErrorEvent) => {
      const msg = event.message ?? String(event.error ?? "Unknown error");
      if (/hydrat/i.test(msg) || /did not match/i.test(msg)) {
        console.error(
          `${CONSOLE_PREFIX} Hydration/runtime error detected:`,
          msg,
          "\nSee storefront/docs/dev-troubleshooting.md#hydration-mismatches",
        );
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "");
      if (/hydrat/i.test(msg)) {
        console.error(`${CONSOLE_PREFIX} Unhandled rejection (hydration-related):`, reason);
      }
    };

    const originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
      if (/hydrat/i.test(text) || /Text content does not match/i.test(text)) {
        console.warn(
          `${CONSOLE_PREFIX} Possible hydration mismatch (console.error):`,
          ...args,
        );
      }
      originalConsoleError(...args);
    };

    const evaluateStability = () => {
      const css = runCssProbe();
      const layout = runLayoutProbe();

      if (cssLooksBroken(css) && !reportedCssRef.current) {
        reportedCssRef.current = true;
        const parts: string[] = [];
        if (!css.tailwindUtilityApplied) parts.push("Tailwind utilities not applied");
        if (!css.bodyBackgroundOk) parts.push("body background is transparent/default");
        if (!css.stylesheetLinksOk) {
          parts.push(
            `stylesheet(s) failed: ${css.failedStylesheetHrefs.slice(0, 3).join(", ")}`,
          );
        }
        const summary = parts.join("; ");
        logActionableRecovery(summary);
        setCssWarning(summary);
      }

      if (
        !layout.heroMounted &&
        !layout.headerMounted &&
        !reportedLayoutRef.current &&
        document.readyState === "complete"
      ) {
        reportedLayoutRef.current = true;
        console.warn(
          `${CONSOLE_PREFIX} Critical layout markers missing (hero/header). ` +
            "Page may have failed to hydrate or route is not the homepage.",
        );
      } else if (!layout.heroMounted && layout.headerMounted) {
        console.warn(
          `${CONSOLE_PREFIX} Hero section marker missing; header present — partial render?`,
        );
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const t1 = window.setTimeout(evaluateStability, CHECK_DELAY_MS);
    const t2 = window.setTimeout(evaluateStability, RECHECK_MS);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = originalConsoleError;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (!IS_DEV || !cssWarning) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-ui-dev-warning="missing-css"
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 99999,
        maxWidth: 360,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #f59e0b",
        background: "#1a1208",
        color: "#fde68a",
        fontSize: 12,
        lineHeight: 1.4,
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <strong style={{ display: "block", marginBottom: 4, color: "#fbbf24" }}>
        Dev: styles may not be loaded
      </strong>
      <span>{cssWarning}</span>
      <span style={{ display: "block", marginTop: 6, opacity: 0.9 }}>
        Run <code style={{ color: "#fff" }}>npm run clean:dev</code> then hard-refresh.
      </span>
    </div>
  );
}

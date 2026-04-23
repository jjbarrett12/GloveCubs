/**
 * Sentry client init (run in browser). No-op when DSN not set.
 * Import from a client component (e.g. SentryLoader) so it runs in the browser.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const env = process.env.NODE_ENV;

if (dsn && typeof window !== "undefined") {
  Sentry.init({
    dsn,
    environment: env === "production" ? "production" : "development",
    enabled: env === "production",
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.message?.includes("ResizeObserver") || event.message?.includes("Non-Error")) return null;
      return event;
    },
  });
}

/**
 * Sentry client-side init. No-op when SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is not set.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
const env = process.env.NODE_ENV;

if (dsn && typeof window !== "undefined") {
  Sentry.init({
    dsn,
    environment: env === "production" ? "production" : env === "development" ? "development" : "other",
    enabled: env === "production",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      if (event.message?.includes("ResizeObserver") || event.message?.includes("Non-Error")) return null;
      return event;
    },
  });
}

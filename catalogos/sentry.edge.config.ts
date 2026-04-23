/**
 * Sentry edge runtime init. No-op when SENTRY_DSN is not set.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
const env = process.env.NODE_ENV;

if (dsn) {
  Sentry.init({
    dsn,
    environment: env === "production" ? "production" : "development",
    enabled: true,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.message?.includes("validation") || event.message?.includes("Invalid input")) return null;
      return event;
    },
  });
}

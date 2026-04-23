/**
 * Sentry server-side init. No-op when SENTRY_DSN is not set.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
const env = process.env.NODE_ENV;

if (dsn) {
  Sentry.init({
    dsn,
    environment: env === "production" ? "production" : env === "development" ? "development" : "other",
    enabled: true,
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      const err = hint.originalException;
      if (err && typeof err === "object" && "message" in err) {
        const msg = String((err as { message?: string }).message);
        if (msg.includes("Invalid input") || msg.includes("validation")) return null;
      }
      return event;
    },
  });
}

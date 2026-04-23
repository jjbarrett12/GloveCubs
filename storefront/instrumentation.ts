/**
 * Next.js instrumentation: env validation (fail fast in prod), Sentry when DSN set.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertCriticalEnv } = await import("./src/lib/env");
    try {
      assertCriticalEnv();
    } catch (e) {
      console.error(e);
      throw e;
    }
    if (process.env.SENTRY_DSN) {
      await import("./sentry.server.config");
    }
  }
  if (process.env.SENTRY_DSN && process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

"use client";

import { useEffect } from "react";

export function SentryLoader() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
      import("@/lib/sentry-client-init");
    }
  }, []);
  return null;
}

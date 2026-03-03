"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Find My Glove: redirects to the premium glove-finder experience.
 * The main Find My Glove UI lives at /glove-finder (dark, wizard, results, compare).
 */
export default function FindMyGlovePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/glove-finder");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
      <p className="text-sm text-white/60">Redirecting to Find My Glove…</p>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/home/SiteHeader";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-env";
import { LoginClient } from "./LoginClient";

/**
 * Public login PAGE shell — statically cacheable.
 * Query params (`next`, `issue`, `reset`) hydrate client-side via useSearchParams.
 * Authentication itself remains client → Supabase + dynamic /api/auth/* (not cached).
 */
export const dynamic = "force-static";
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Customer login | GloveCubs",
  description: "Log in to your GloveCubs business account for saved pricing and quotes.",
};

export default function LoginPage() {
  const { configured: supabaseConfigured } = resolveSupabasePublicEnv();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeader />
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center">
        <Suspense fallback={null}>
          <LoginClient supabaseConfigured={supabaseConfigured} />
        </Suspense>
      </main>
    </div>
  );
}

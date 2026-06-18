import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-env";
import { SignupCompleteClient } from "./SignupCompleteClient";

export const metadata: Metadata = {
  title: "Confirm account | GloveCubs",
  robots: { index: false, follow: false },
};

export default function SignupCompletePage() {
  const { configured: supabaseConfigured } = resolveSupabasePublicEnv();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center">
        <SignupCompleteClient supabaseConfigured={supabaseConfigured} />
      </main>
    </div>
  );
}

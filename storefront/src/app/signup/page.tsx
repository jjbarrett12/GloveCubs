import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-env";
import { SignupClient } from "./SignupClient";

export const metadata: Metadata = {
  title: "Create account | GloveCubs",
  description: "Create a GloveCubs business account to browse gloves and submit quote requests.",
};

export default function SignupPage() {
  const { configured: supabaseConfigured } = resolveSupabasePublicEnv();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center">
        <SignupClient supabaseConfigured={supabaseConfigured} />
      </main>
    </div>
  );
}

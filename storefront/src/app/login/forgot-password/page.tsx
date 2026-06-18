import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-env";
import { ForgotPasswordClient } from "./ForgotPasswordClient";

export const metadata: Metadata = {
  title: "Reset password | GloveCubs",
  description: "Request a password reset link for your GloveCubs buyer account.",
};

export default function ForgotPasswordPage() {
  const { configured: supabaseConfigured } = resolveSupabasePublicEnv();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center">
        <ForgotPasswordClient supabaseConfigured={supabaseConfigured} />
      </main>
    </div>
  );
}

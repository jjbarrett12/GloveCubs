import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-env";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = {
  title: "Customer login | GloveCubs",
  description: "Log in to your GloveCubs business account for saved pricing and quotes.",
};

function hasExplicitNextParam(raw: string | string[] | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.trim() !== "";
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { configured: supabaseConfigured } = resolveSupabasePublicEnv();

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center">
        <LoginClient
          nextPath={searchParams.next}
          issue={searchParams.issue}
          supabaseConfigured={supabaseConfigured}
          hasExplicitNext={hasExplicitNextParam(searchParams.next)}
        />
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign in | GloveCubs",
  description: "Sign in to your GloveCubs business account.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main>
        <LoginClient
          nextPath={searchParams.next}
          issue={searchParams.issue}
          supabaseConfigured={supabaseConfigured}
        />
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
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
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );

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

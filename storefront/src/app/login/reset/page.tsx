import type { Metadata } from "next";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-env";
import { ResetPasswordClient } from "./ResetPasswordClient";

export const metadata: Metadata = {
  title: "Set password | GloveCubs",
  description: "Set or update your GloveCubs buyer account password.",
};

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { configured: supabaseConfigured } = resolveSupabasePublicEnv();
  const rawIssue = searchParams.issue;
  const issue =
    typeof rawIssue === "string" ? rawIssue : Array.isArray(rawIssue) ? (rawIssue[0] ?? null) : null;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      <main className="flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center">
        <ResetPasswordClient supabaseConfigured={supabaseConfigured} issue={issue} />
      </main>
    </div>
  );
}

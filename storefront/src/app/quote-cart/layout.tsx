import { PublicExperienceChrome } from "@/components/layout/PublicExperienceChrome";

export default function QuoteCartLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicExperienceChrome className="min-h-screen bg-[hsl(var(--background))] font-poppins">{children}</PublicExperienceChrome>
  );
}

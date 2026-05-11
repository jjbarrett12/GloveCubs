import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";

export default function QuoteCartLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <SiteHeaderLoader />
      {children}
    </div>
  );
}

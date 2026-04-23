import type { Metadata } from "next";
import { SentryLoader } from "@/components/SentryLoader";
import "./globals.css";

export const metadata: Metadata = {
  title: "GloveCubs | B2B Gloves & PPE",
  description: "Industry-specific gloves and PPE for janitorial, hospitality, healthcare, and industrial.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <SentryLoader />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { SentryLoader } from "@/components/SentryLoader";
import "./globals.css";

export const metadata: Metadata = {
  title: "CatalogOS | GloveCubs Catalog Ingestion",
  description: "Internal catalog ingestion and publishing system.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <SentryLoader />
        {children}
      </body>
    </html>
  );
}

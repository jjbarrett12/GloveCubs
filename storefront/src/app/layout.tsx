import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { BotIdClient } from "botid/client";
import "./globals.css";
import { Providers } from "./providers";
import { BOTID_PROTECTED_ROUTES } from "@/lib/security/botid-protected-routes";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GloveCubs | B2B Gloves & PPE",
  description: "Industry-specific gloves and PPE for janitorial, hospitality, healthcare, and industrial.",
};

const botIdProtect = BOTID_PROTECTED_ROUTES.map((r) => ({
  path: r.path,
  method: r.method,
}));

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${poppins.variable}`}>
      <head>
        <BotIdClient protect={botIdProtect} />
      </head>
      <body className="min-h-screen min-w-0 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

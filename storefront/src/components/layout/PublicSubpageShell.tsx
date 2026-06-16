import type { ReactNode } from "react";
import { PublicExperienceChrome } from "@/components/layout/PublicExperienceChrome";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Wider layouts (e.g. industries grid). */
  mainClassName?: string;
};

export async function PublicSubpageShell({ title, subtitle, children, mainClassName }: Props) {
  const mainCn = mainClassName ?? "mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8";

  return (
    <PublicExperienceChrome>
      <main className={mainCn}>
        <h1 className="mb-2 text-3xl font-bold text-white">{title}</h1>
        {subtitle ? <p className="mb-8 text-base text-white/65">{subtitle}</p> : null}
        {children}
      </main>
    </PublicExperienceChrome>
  );
}

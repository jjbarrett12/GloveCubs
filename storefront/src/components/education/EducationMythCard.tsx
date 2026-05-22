import type { GloveScienceMyth } from "@/config/gloveScienceHub";

export function EducationMythCard({ myth, reality }: GloveScienceMyth) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-[#ebebea] bg-white p-6 shadow-[0_8px_30px_rgb(0_0_0/0.04)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">Myth</p>
      <p className="mt-2 text-base font-bold leading-snug text-[#0a0a0a]">{myth}</p>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
        Reality
      </p>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">{reality}</p>
    </article>
  );
}

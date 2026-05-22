import { cn } from "@/lib/utils";

type UpcomingItem = {
  id: string;
  label: string;
};

type EducationCtaStripProps = {
  title: string;
  body: string;
  items: readonly UpcomingItem[];
  className?: string;
};

export function EducationCtaStrip({ title, body, items, className }: EducationCtaStripProps) {
  return (
    <section
      className={cn("border-t border-[#ebebea] bg-[#f4f4f2]", className)}
      aria-label="Upcoming glove science topics"
    >
      <div className="mx-auto max-w-proc px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">{title}</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">{body}</p>
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[#e5e5e2] bg-white/80 px-4 py-3.5 text-sm font-medium text-neutral-700"
            >
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Droplets, FlaskConical, Hand, Layers, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const CATEGORIES: { title: string; line: string; micro: string; Icon: LucideIcon }[] = [
  {
    title: "Nitrile gloves",
    line: "Disposable barrier for exams, prep, and high-change cleaning.",
    micro: "Powder-free · textured grip · case packs",
    Icon: Droplets,
  },
  {
    title: "Latex gloves",
    line: "Traditional elasticity where latex is approved for your program.",
    micro: "Fit-focused · frequent change",
    Icon: Hand,
  },
  {
    title: "Vinyl gloves",
    line: "Economical option for light-duty and frequent glove changes.",
    micro: "Value case buys · food prep",
    Icon: Layers,
  },
  {
    title: "Poly gloves",
    line: "Quick coverage for food handling and light tasks.",
    micro: "Loose fit · high volume",
    Icon: Layers,
  },
  {
    title: "Cut resistant",
    line: "ANSI-rated options for sharp handling and assembly lines.",
    micro: "Match level to task",
    Icon: Shield,
  },
  {
    title: "Chemical resistant",
    line: "Task-matched protection for cleaners and industrial fluids.",
    micro: "Check SDS compatibility",
    Icon: FlaskConical,
  },
];

export function CategoryShowcase() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Shop gloves by material &amp; use case
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-white/55">
          Browse the published catalog and add lines to your quote request cart—list pricing when published; case, pallet, and contract paths through request pricing and review.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {CATEGORIES.map((c) => (
            <Link
              key={c.title}
              href="/store"
              className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-black/30"
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-[hsl(var(--primary))] transition-colors group-hover:border-[hsl(var(--primary))]/30 group-hover:bg-[hsl(var(--primary))]/10">
                <c.Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="text-sm font-bold leading-snug text-white sm:text-base">{c.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/60">{c.line}</p>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-white/35">{c.micro}</p>
              <span className="mt-3 inline-flex items-center text-xs font-semibold text-[hsl(var(--primary))]">
                Shop <ArrowRight className="ml-0.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline" className="border-white/20 text-white hover:bg-white/10">
            <Link href="/store">View full catalog</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

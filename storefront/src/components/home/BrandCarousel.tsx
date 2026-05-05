const BRANDS = ["Ammex", "Ansell", "Kimberly-Clark", "Medline", "Halyard", "Showa", "Liberty", "MCR Safety"];

export function BrandCarousel() {
  const items = [...BRANDS, ...BRANDS];

  return (
    <section className="border-y border-white/10 bg-[hsl(222_47%_5%)] py-12">
      <p className="mx-auto mb-8 max-w-2xl px-4 text-center text-sm text-white/55">
        Examples of glove and PPE lines buyers commonly source through GloveCubs.
      </p>
      <div className="relative mx-auto max-w-7xl">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[hsl(222_47%_5%)] to-transparent sm:w-20"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[hsl(222_47%_5%)] to-transparent sm:w-20"
          aria-hidden
        />
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-5 sm:px-8 [&::-webkit-scrollbar]:hidden">
          {items.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="snap-start shrink-0 rounded-xl border border-white/15 bg-gradient-to-b from-white/[0.09] to-white/[0.02] px-6 py-4 text-base font-semibold tracking-tight text-white/90 shadow-lg shadow-black/20"
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

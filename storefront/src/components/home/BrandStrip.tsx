const BRANDS = ["Ammex", "Ansell", "Kimberly-Clark", "Medline", "Halyard", "Showa"];

export function BrandStrip() {
  return (
    <section className="py-8 border-y border-white/10">
      <p className="text-center text-white/55 text-sm mb-4 max-w-2xl mx-auto px-2">
        Examples of glove and PPE lines buyers commonly source through GloveCubs.
      </p>
      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {BRANDS.map((name) => (
          <span
            key={name}
            className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm text-white/85"
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}

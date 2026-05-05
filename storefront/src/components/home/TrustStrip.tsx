const ITEMS = [
  "Case pricing for business accounts",
  "Supplier-direct sourcing",
  "Reorder the same SKUs fast",
  "Net terms available for qualified buyers",
];

export function TrustStrip() {
  return (
    <section className="border-y border-white/10 py-12">
      <ul className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {ITEMS.map((text) => (
          <li
            key={text}
            className="border-l-2 border-[hsl(var(--primary))]/50 py-1 pl-4 text-sm font-medium leading-snug text-white/85"
          >
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

const ITEMS = [
  "Case pricing for business accounts",
  "Supplier-direct sourcing",
  "Reorder the same SKUs fast",
  "Net terms available for qualified buyers",
];

export function TrustStrip() {
  return (
    <section className="py-8">
      <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {ITEMS.map((text) => (
          <li
            key={text}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/85 text-center sm:text-left"
          >
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from "next/link";
import { PublicSubpageShell } from "@/components/layout/PublicSubpageShell";
import { HOME_BRAND_LIST, getBrandLogoPath } from "@/config/homeBrands";
import { getStoreHrefForBrandDisplayNameSearch } from "@/lib/discovery/intent-routes";

export const metadata = {
  title: "Brands | GloveCubs",
  description: "Authorized distributor brands—shop by manufacturer or request a rep-assisted program.",
};

export default function BrandsPage() {
  return (
    <PublicSubpageShell
      title="Brands"
      subtitle="Full brand microsites are on the roadmap. Today you can shop every authorized line in the catalog by brand, or ask us to standardize SKUs for your operation."
      mainClassName="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <div className="mb-8 rounded-lg border border-[#FF5500]/30 bg-[#FF5500]/10 px-4 py-3 text-sm text-white/85">
        <strong className="text-white">Coming soon:</strong> dedicated brand hubs with spec sheets and program pricing. All
        brands below link to the live store filtered by manufacturer.
      </div>
      <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {HOME_BRAND_LIST.map((name) => {
          const logo = getBrandLogoPath(name);
          const href = getStoreHrefForBrandDisplayNameSearch(name);
          return (
            <li key={name}>
              <Link
                href={href}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:border-[#FF5500]/45 hover:bg-white/[0.07]"
              >
                {logo ? (
                  <img src={logo} alt="" className="h-9 w-9 shrink-0 object-contain" loading="lazy" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/10 text-xs font-bold text-white/80">
                    GC
                  </span>
                )}
                <span className="font-semibold text-white">{name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-sm text-white/55">
        Missing a line card?{" "}
        <Link href="/request-pricing" className="font-medium text-[#FF5500] hover:underline">
          Tell us what you buy today
        </Link>{" "}
        and we will match or cross it to an in-stock program.
      </p>
    </PublicSubpageShell>
  );
}

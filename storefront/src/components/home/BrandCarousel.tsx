import Link from "next/link";
import { HOME_BRAND_LIST, getBrandLogoPath } from "@/config/homeBrands";
import { getStoreHrefForBrandDisplayNameSearch } from "@/lib/discovery/intent-routes";
import { cn } from "@/lib/utils";
import styles from "./brandCarousel.module.css";

function BrandLogoItem({ name, compact }: { name: string; compact?: boolean }) {
  const logo = getBrandLogoPath(name);
  const href = getStoreHrefForBrandDisplayNameSearch(name);

  const linkClass = cn(
    styles.brandLogoLink,
    "inline-flex shrink-0 items-center justify-center",
    compact ? "h-[52px] w-[168px] px-1" : "h-14 w-[172px] px-1"
  );

  const imgClass = cn(
    "block shrink-0 object-contain object-center",
    compact ? "h-12 w-auto max-w-[160px]" : "h-[52px] w-auto max-w-[160px]"
  );

  if (logo) {
    return (
      <Link href={href} className={linkClass} title={name}>
        <img
          src={logo}
          alt={name}
          className={imgClass}
          width={160}
          height={compact ? 48 : 52}
          loading="lazy"
          decoding="async"
        />
      </Link>
    );
  }
  return (
    <Link href={href} className={cn(styles.brandLogoFallbackOnly, linkClass, "text-xs font-semibold text-neutral-500")}>
      {name}
    </Link>
  );
}

export function BrandCarousel({ compact = false }: { compact?: boolean }) {
  const trackNames = [...HOME_BRAND_LIST, ...HOME_BRAND_LIST];

  return (
    <div
      className={cn(
        styles.brandsStrip,
        compact && styles.brandsStripCompact,
        compact ? "mt-0 border-t-0 bg-transparent pt-6 pb-2 sm:pt-8" : "mt-14 border-t border-neutral-300/80 pt-12"
      )}
    >
      <p
        className={cn(
          "mb-5 text-center font-bold uppercase tracking-[0.14em] text-neutral-500",
          compact ? "text-[11px] sm:mb-6" : "mb-6 text-sm"
        )}
      >
        Authorized distributor for
      </p>
      <div className={styles.brandsCarouselWrap}>
        <div className={styles.brandsCarouselOuter}>
          <div className={styles.brandsCarouselTrack}>
            {trackNames.map((name, i) => (
              <BrandLogoItem key={`${name}-${i}`} name={name} compact={compact} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

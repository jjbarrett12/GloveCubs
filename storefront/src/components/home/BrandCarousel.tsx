import { HOME_BRAND_LIST } from "@/config/homeBrands";
import { getStoreHrefForBrandDisplayNameSearch } from "@/lib/discovery/intent-routes";
import { cn } from "@/lib/utils";
import { HomeBrandLogo } from "@/components/home/HomeBrandLogo";
import styles from "./brandCarousel.module.css";

export function BrandCarousel({ compact = false }: { compact?: boolean }) {
  const trackNames = [...HOME_BRAND_LIST, ...HOME_BRAND_LIST];

  return (
    <div
      className={cn(
        styles.brandsStrip,
        compact && styles.brandsStripCompact,
        compact ? "mt-0 border-t-0 bg-transparent pt-6 pb-2 sm:pt-8" : "mt-14 border-t border-neutral-300/80 pt-12",
      )}
    >
      <p
        className={cn(
          "mb-5 text-center font-bold uppercase tracking-[0.14em] text-neutral-600",
          compact ? "text-[11px] sm:mb-6" : "mb-6 text-sm",
        )}
      >
        Authorized distributor for
      </p>
      <div className={styles.brandsCarouselWrap}>
        <div className={styles.brandsCarouselOuter}>
          <div className={styles.brandsCarouselTrack}>
            {trackNames.map((name, i) => (
              <HomeBrandLogo
                key={`${name}-${i}`}
                brand={name}
                href={getStoreHrefForBrandDisplayNameSearch(name)}
                title={name}
                className={cn(
                  styles.brandLogoLink,
                  compact ? "h-[52px] w-[168px] px-1" : "h-14 w-[172px] px-1",
                )}
                imgClassName={compact ? "h-12 w-auto max-w-[160px]" : "h-[52px] w-auto max-w-[160px]"}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

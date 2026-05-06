import Link from "next/link";
import { HOME_BRAND_LIST, getBrandLogoPath } from "@/config/homeBrands";
import { getStoreHrefForBrandDisplayNameSearch } from "@/lib/discovery/intent-routes";
import styles from "./brandCarousel.module.css";

function BrandLogoItem({ name }: { name: string }) {
  const logo = getBrandLogoPath(name);
  const href = getStoreHrefForBrandDisplayNameSearch(name);

  if (logo) {
    return (
      <Link href={href} className={styles.brandLogoLink} title={name}>
        <img src={logo} alt={name} className={styles.brandLogoImg} loading="lazy" />
      </Link>
    );
  }
  return (
    <Link href={href} className={styles.brandLogoFallbackOnly}>
      {name}
    </Link>
  );
}

export function BrandCarousel() {
  const trackNames = [...HOME_BRAND_LIST, ...HOME_BRAND_LIST];

  return (
    <div className={`${styles.brandsStrip} mt-14 border-t border-neutral-300/80 pt-12`}>
      <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.14em] text-neutral-500">
        Authorized distributor for
      </p>
      <div className={styles.brandsCarouselWrap}>
        <div className={styles.brandsCarouselOuter}>
          <div className={styles.brandsCarouselTrack}>
            {trackNames.map((name, i) => (
              <BrandLogoItem key={`${name}-${i}`} name={name} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

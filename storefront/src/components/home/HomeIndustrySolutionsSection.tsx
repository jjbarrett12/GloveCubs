"use client";

import Link from "next/link";
import { industryNavIconForHref } from "@/config/industryNavIcons";
import {
  HOME_HONEYCOMB_BENEFITS,
  HOME_HONEYCOMB_COPY,
  HOME_HONEYCOMB_PROOF_POINTS,
  HOME_HONEYCOMB_ROW_BOTTOM,
  HOME_HONEYCOMB_ROW_MIDDLE,
  HOME_HONEYCOMB_ROW_TOP,
  type HomeHoneycombIndustryTile,
  type HomeHoneycombTile,
} from "@/config/homeIndustryHoneycomb";
import { ProcurementSectionShell } from "@/components/procurement";
import { cn } from "@/lib/utils";
import styles from "./homeIndustrySolutionsSection.module.css";

const HUB_MARK_SRC = "/images/glovecubs-header-mark-transparent.png";
const INDUSTRY_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&h=900&q=82";

function IndustryHexTile({ tile }: { tile: HomeHoneycombIndustryTile }) {
  const Icon = industryNavIconForHref(tile.href);
  const numberLabel = String(tile.number).padStart(2, "0");

  return (
    <Link
      href={tile.href}
      className={cn(styles.hexShell, "group")}
      aria-label={`${tile.title} — industry ${numberLabel}`}
    >
      <span className={styles.hexInner}>
        <span className={styles.hexTileMedia} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tile.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(styles.hexTileImg, tile.imagePosition)}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src !== INDUSTRY_IMAGE_FALLBACK) img.src = INDUSTRY_IMAGE_FALLBACK;
            }}
          />
          <span className={styles.hexTileOverlay} />
        </span>

        <span className={styles.hexTileBody}>
          <span className={styles.hexTileIcon} aria-hidden>
            <Icon className="h-[1rem] w-[1rem]" strokeWidth={2.1} />
          </span>
          <span className={styles.hexTileNumber}>{numberLabel}</span>
          <span className={styles.hexTileName}>{tile.title}</span>
        </span>
      </span>
    </Link>
  );
}

function HubHexTile() {
  return (
    <div
      className={cn(styles.hexShell, styles.hexShellHub)}
      role="img"
      aria-label="Glove Intelligence hub"
    >
      <div className={cn(styles.hexInner, styles.hexInnerHub)}>
        <div className={styles.hexHubInner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HUB_MARK_SRC}
          alt=""
          className={styles.hexHubMark}
          width={46}
          height={46}
          decoding="async"
        />
        <p className={styles.hexHubLabel}>Glove Intelligence</p>
        </div>
      </div>
    </div>
  );
}

function HoneycombTile({ tile }: { tile: HomeHoneycombTile }) {
  if (tile.kind === "hub") return <HubHexTile />;
  return <IndustryHexTile tile={tile} />;
}

export function HomeIndustrySolutionsSection() {
  return (
    <ProcurementSectionShell
      tone="base"
      headingId="industry-intelligence-heading"
      ariaLabel="Industry glove intelligence across operating environments"
      className="relative isolate overflow-hidden !border-t-0 !bg-transparent !py-10 sm:!py-14 lg:!py-16 [&>div]:max-w-[min(100%,82rem)]"
      containerClassName="relative flex min-h-0 flex-col"
    >
      <div className={styles.sectionBackdrop} aria-hidden />

      <div className={styles.sectionInner}>
      <div className={styles.sectionLayout}>
        <div className={styles.editorial}>
          <p className={styles.eyebrow}>{HOME_HONEYCOMB_COPY.eyebrow}</p>
          <h2 id="industry-intelligence-heading" className={styles.headline}>
            {HOME_HONEYCOMB_COPY.headline}
          </h2>
          <p className={styles.supporting}>{HOME_HONEYCOMB_COPY.supporting}</p>

          <ul className={styles.benefits}>
            {HOME_HONEYCOMB_BENEFITS.map(({ title, description, icon: Icon }) => (
              <li key={title} className={styles.benefitRow}>
                <span className={styles.benefitIcon} aria-hidden>
                  <Icon className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <div>
                  <p className={styles.benefitTitle}>{title}</p>
                  <p className={styles.benefitDesc}>{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.honeycombWrap} aria-label="Industries honeycomb grid">
          <div className={styles.honeycomb}>
            <div className={styles.hexRow} role="list">
              {HOME_HONEYCOMB_ROW_TOP.map((tile) => (
                <HoneycombTile key={tile.href} tile={tile} />
              ))}
            </div>
            <div className={cn(styles.hexRow, styles.hexRowMiddle)} role="list">
              {HOME_HONEYCOMB_ROW_MIDDLE.map((tile) => (
                <HoneycombTile
                  key={tile.kind === "hub" ? "hub" : tile.href}
                  tile={tile}
                />
              ))}
            </div>
            <div className={cn(styles.hexRow, styles.hexRowBottom)} role="list">
              {HOME_HONEYCOMB_ROW_BOTTOM.map((tile) => (
                <HoneycombTile key={tile.href} tile={tile} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.proofBlock}>
        <div className={styles.proofDivider} aria-hidden />
        <ul className={styles.proofList}>
          {HOME_HONEYCOMB_PROOF_POINTS.map((point) => (
            <li key={point} className={styles.proofItem}>
              <span className={styles.proofDot} aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </div>
      </div>
    </ProcurementSectionShell>
  );
}

"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import {
  HOME_HONEYCOMB_COPY,
  HOME_HONEYCOMB_ROWS,
  type HomeHoneycombIndustryTile,
  type HomeHoneycombTile,
} from "@/config/homeIndustryHoneycomb";
import hubPawIcon from "@/app/icon.png";
import { HomeSectionIntro } from "@/components/home/authority/HomeAuthorityPrimitives";
import { ProcurementSectionShell } from "@/components/procurement";
import { cn } from "@/lib/utils";
import styles from "./homeIndustrySolutionsSection.module.css";

const INDUSTRY_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&h=900&q=82";

/** Flat-top hex tessellation — odd-r offset grid (Red Blob Games layout). */
const SQRT3 = Math.sqrt(3);
/** Point-to-point width of one hex in grid units. */
const HEX_W = 1;
/** Flat-to-flat height of one hex in grid units. */
const HEX_H = SQRT3 / 2;
/** Circumradius; flat-top height (point-to-point) = 2 × size = HEX_W. */
const HEX_SIZE = HEX_W / 2;

/**
 * First column per row for a centered 5/6/7/6/5 flat-top odd-r honeycomb.
 * Even rows (0, 4) inset by 1; odd rows (1, 3) align to the wider stagger below.
 */
const HONEYCOMB_ROW_START_COLS = [1, 0, 0, 0, 1] as const;

type HoneycombPlacement = {
  key: string;
  tile: HomeHoneycombTile;
  row: number;
  x: number;
  y: number;
};

type HoneycombLayout = {
  placements: HoneycombPlacement[];
  gridW: number;
  gridH: number;
};

function hexTopLeft(col: number, row: number): { x: number; y: number } {
  const cx = HEX_SIZE * SQRT3 * (col + 0.5 * (row & 1));
  const cy = HEX_SIZE * 1.5 * row;
  return { x: cx - HEX_W / 2, y: cy - HEX_H / 2 };
}

function buildHoneycombPlacements(): HoneycombLayout {
  const raw: HoneycombPlacement[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  HOME_HONEYCOMB_ROWS.forEach((row, rowIndex) => {
    const startCol = HONEYCOMB_ROW_START_COLS[rowIndex] ?? 0;

    row.tiles.forEach((tile, index) => {
      const col = startCol + index;
      const { x, y } = hexTopLeft(col, rowIndex);
      const key = tile.kind === "hub" ? "hub" : tile.id;
      raw.push({ key, tile, row: rowIndex, x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + HEX_W);
      maxY = Math.max(maxY, y + HEX_H);
    });
  });

  const gridW = maxX - minX;
  const gridH = maxY - minY;
  const placements = raw.map((p) => ({
    ...p,
    x: p.x - minX,
    y: p.y - minY,
  }));

  return { placements, gridW, gridH };
}

const HONEYCOMB_LAYOUT = buildHoneycombPlacements();

function HoneycombGrid() {
  return (
    <>
      {HONEYCOMB_LAYOUT.placements.map(({ key, tile, row, x, y }) => (
        <div
          key={key}
          className={cn(styles.hexAnchor, tile.kind === "hub" && styles.hexAnchorHub)}
          style={{
            left: `${(x / HONEYCOMB_LAYOUT.gridW) * 100}%`,
            top: `${(y / HONEYCOMB_LAYOUT.gridH) * 100}%`,
            zIndex: tile.kind === "hub" ? 30 : 10 - row,
          }}
        >
          <HoneycombTile tile={tile} />
        </div>
      ))}
    </>
  );
}

function IndustryHexTile({ tile }: { tile: HomeHoneycombIndustryTile }) {
  return (
    <Link href={tile.href} className={styles.hexCard} aria-label={tile.label}>
      <div className={styles.hexFace}>
        <div className={styles.hexMedia} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tile.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(styles.hexImage, tile.imagePosition)}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src !== INDUSTRY_IMAGE_FALLBACK) img.src = INDUSTRY_IMAGE_FALLBACK;
            }}
          />
        </div>
        <div className={styles.hexLabelBand}>
          <span className={styles.hexLabel}>{tile.label}</span>
        </div>
      </div>
    </Link>
  );
}

function HubHexTile() {
  return (
    <div className={cn(styles.hexCard, styles.hexCardHub)} role="img" aria-label="GloveCubs">
      <div className={cn(styles.hexFace, styles.hexFaceHub)}>
        <div className={styles.hexHubGlow} aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hubPawIcon.src}
          alt=""
          className={styles.hexHubMark}
          width={hubPawIcon.width}
          height={hubPawIcon.height}
          decoding="async"
        />
        <span className={styles.hexHubLabel}>GLOVECUBS</span>
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
      headingId="industries-we-serve-heading"
      ariaLabel="Industries we serve — operational hand protection honeycomb"
      className="relative isolate !border-t-0 !bg-transparent !py-10 sm:!py-14 lg:!py-16 [&>div]:max-w-none [&>div]:px-4 sm:[&>div]:px-6 lg:[&>div]:px-10"
      containerClassName="relative flex min-h-0 flex-col"
    >
      <div className={styles.sectionBackdrop} aria-hidden />

      <div className={styles.sectionInner}>
        <HomeSectionIntro
          headingId="industries-we-serve-heading"
          eyebrow={HOME_HONEYCOMB_COPY.eyebrow}
          eyebrowIcon={Building2}
          title={HOME_HONEYCOMB_COPY.headline}
          description={HOME_HONEYCOMB_COPY.supporting}
          tone="dark"
          className="mx-auto mb-8 w-full max-w-3xl text-center sm:mb-10 lg:mb-12 [&_h2]:mx-auto [&_p.flex]:!justify-center [&_p.proc-body]:mx-auto"
        />

        <div className={styles.honeycombWrap} aria-label="Industries honeycomb grid">
          <div className={styles.honeycombAmbient} aria-hidden />
          <div
            className={styles.honeycomb}
            role="list"
            style={
              {
                "--grid-w": HONEYCOMB_LAYOUT.gridW,
                "--grid-h": HONEYCOMB_LAYOUT.gridH,
              } as React.CSSProperties
            }
          >
            <HoneycombGrid />
          </div>
        </div>
      </div>
    </ProcurementSectionShell>
  );
}

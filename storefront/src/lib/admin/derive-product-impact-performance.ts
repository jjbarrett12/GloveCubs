import {
  DISP_DEFAULT,
  REUSE_DEFAULT,
  deriveDisposableProfile,
  deriveReusableProfile,
  mapDisposableToMockupPerf,
  mapReusableToMockupPerf,
  type CutLevel,
  type DispCuff,
  type DispGloveClass,
  type DispMaterial,
  type DispTask,
  type DispTexture,
  type DispThickness,
  type DisposableState,
  type DippedCoating,
  type GripEnv,
  type KnitShell,
  type PerfLevel,
  type ReuseCategory,
  type ReuseCuff,
  type ReuseTask,
  type ReuseTexture,
  type ReusableState,
  SCIENCE_MOCKUP_PERF,
  type ScienceMockupPerfKey,
} from "@/config/gloveScienceLab";
import { detectGloveFamily } from "@/lib/catalog/pdp-education/detect-family";
import { attrHaystack, firstAttr, type NormalizedPdpAttributes } from "@/lib/catalog/pdp-education/normalize-attributes";

export type ProductImpactPerformance = Record<ScienceMockupPerfKey, PerfLevel>;

export const IMPACT_PERFORMANCE_METADATA_KEY = "impact_performance";

function isPerfLevel(v: unknown): v is PerfLevel {
  return v === 0 || v === 1 || v === 2;
}

export function parseImpactPerformanceFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): ProductImpactPerformance | null {
  const raw = metadata?.[IMPACT_PERFORMANCE_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out = {} as ProductImpactPerformance;
  for (const { key } of SCIENCE_MOCKUP_PERF) {
    if (!isPerfLevel(o[key])) return null;
    out[key] = o[key];
  }
  return out;
}

export function editorAttributesToNormalized(
  attributes: Record<string, string | string[]>
): NormalizedPdpAttributes {
  const out: NormalizedPdpAttributes = {};
  for (const [key, raw] of Object.entries(attributes)) {
    if (Array.isArray(raw)) {
      const vals = raw.map(String).filter((v) => v.trim());
      if (vals.length) out[key] = vals;
    } else if (raw?.trim()) {
      out[key] = [raw.trim()];
    }
  }
  return out;
}

function nearestDispThickness(mil: number): DispThickness {
  const buckets: DispThickness[] = [3, 4, 5, 6, 8];
  return buckets.reduce((best, b) => (Math.abs(b - mil) < Math.abs(best - mil) ? b : best));
}

function mapMaterial(raw: string | null): DispMaterial {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("vinyl")) return "vinyl";
  if (m.includes("poly") && !m.includes("polyurethane")) return "poly";
  if (m.includes("blend") || m.includes("synthetic")) return "synthetic-blended";
  return "nitrile";
}

function mapTexture(raw: string | null): DispTexture {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("full") || t.includes("diamond") || t.includes("fully")) return "full";
  if (t.includes("finger") || t.includes("textur")) return "fingertip";
  if (t.includes("smooth")) return "smooth";
  return "fingertip";
}

function mapCuff(raw: string | null): DispCuff {
  const c = (raw ?? "").toLowerCase();
  return c.includes("extended") || c.includes("gauntlet") ? "extended" : "standard";
}

function mapGloveClass(grade: string | null, hay: string): DispGloveClass {
  const g = (grade ?? "").toLowerCase();
  if (g.includes("chemo")) return "chemo-rated";
  if (g.includes("medical") || g.includes("exam")) return "exam-medical";
  if (g.includes("food")) return "food-service";
  if (g.includes("industrial")) return "industrial";
  if (hay.includes("food") || hay.includes("fda_food") || hay.includes("fda_food_contact")) return "food-service";
  if (hay.includes("chemo")) return "chemo-rated";
  return "general-purpose";
}

function mapTask(attrs: NormalizedPdpAttributes, hay: string): DispTask {
  const industries = (attrs.industries ?? []).join(" ").toLowerCase();
  const uses = (attrs.uses ?? []).join(" ").toLowerCase();
  const blob = `${industries} ${uses} ${hay}`;
  if (blob.includes("chem") || blob.includes("solvent") || blob.includes("hazmat")) return "chemical";
  if (blob.includes("clean") || blob.includes("janitor") || blob.includes("sanit")) return "cleaning";
  if (blob.includes("health") || blob.includes("exam") || blob.includes("patient")) return "exam";
  if (blob.includes("food")) return "food-prep";
  return "assembly";
}

function editorAttrsToDisposableState(attrs: NormalizedPdpAttributes): DisposableState {
  const hay = attrHaystack(attrs);
  const thicknessRaw = firstAttr(attrs, "thickness_mil");
  const parsedMil = thicknessRaw ? parseFloat(thicknessRaw.replace(/[^\d.]/g, "")) : NaN;
  const thickness = Number.isFinite(parsedMil) ? nearestDispThickness(parsedMil) : DISP_DEFAULT.thickness;

  return {
    material: mapMaterial(firstAttr(attrs, "material")),
    thickness,
    texture: mapTexture(firstAttr(attrs, "texture")),
    cuff: mapCuff(firstAttr(attrs, "cuff_style")),
    task: mapTask(attrs, hay),
    gloveClass: mapGloveClass(firstAttr(attrs, "grade"), hay),
  };
}

function mapCutLevel(raw: string | null): CutLevel {
  const m = (raw ?? "").toUpperCase().match(/A([1-5])/);
  if (m) return `A${m[1]}` as CutLevel;
  return REUSE_DEFAULT.cutLevel;
}

function mapReuseCategory(attrs: NormalizedPdpAttributes, hay: string): ReuseCategory {
  if (firstAttr(attrs, "cut_level_ansi")) return "knit-cut";
  const coating = firstAttr(attrs, "coating");
  if (coating) return "dipped";
  if (hay.includes("leather")) return "leather";
  if (hay.includes("cotton") || hay.includes("canvas")) return "cotton";
  return REUSE_DEFAULT.category;
}

function mapDippedCoating(raw: string | null): DippedCoating {
  const c = (raw ?? "").toLowerCase();
  if (c.includes("foam")) return "foam-nitrile";
  if (c.includes("latex")) return "latex";
  if (c.includes("pu") || c.includes("polyurethane")) return "pu";
  if (c.includes("pvc")) return "pvc";
  return "nitrile";
}

function mapKnitShell(raw: string | null): KnitShell {
  const l = (raw ?? "").toLowerCase();
  if (l.includes("hppe")) return "hppe";
  if (l.includes("aramid")) return "aramid-blend";
  if (l.includes("polyester")) return "polyester";
  return "nylon";
}

function mapReuseTexture(raw: string | null): ReuseTexture {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("sandy")) return "sandy";
  if (t.includes("micro") || t.includes("foam")) return "microfoam";
  if (t.includes("smooth")) return "smooth-coat";
  return "uncoated";
}

function mapGripEnv(hay: string): GripEnv {
  if (hay.includes("oil") || hay.includes("grease")) return "oil";
  if (hay.includes("wet")) return "wet";
  if (hay.includes("abrasion") || hay.includes("rough")) return "abrasion";
  return "dry";
}

function mapReuseCuff(raw: string | null): ReuseCuff {
  const c = (raw ?? "").toLowerCase();
  if (c.includes("gauntlet")) return "gauntlet";
  if (c.includes("knit")) return "knit-wrist";
  return "safety-cuff";
}

function mapReuseTask(hay: string): ReuseTask {
  if (hay.includes("auto") || hay.includes("mechanic")) return "automotive";
  if (hay.includes("warehouse") || hay.includes("pick")) return "warehouse";
  if (hay.includes("oil") || hay.includes("gas")) return "oil-gas";
  if (hay.includes("agri") || hay.includes("farm")) return "agriculture";
  if (hay.includes("manufact")) return "manufacturing";
  return "construction";
}

function editorAttrsToReusableState(attrs: NormalizedPdpAttributes): ReusableState {
  const hay = attrHaystack(attrs);
  const category = mapReuseCategory(attrs, hay);
  return {
    category,
    dippedCoating: mapDippedCoating(firstAttr(attrs, "coating")),
    knitShell: mapKnitShell(firstAttr(attrs, "liner")),
    cutLevel: mapCutLevel(firstAttr(attrs, "cut_level_ansi")),
    texture: mapReuseTexture(firstAttr(attrs, "texture")),
    gripEnv: mapGripEnv(hay),
    task: mapReuseTask(hay),
    cuff: mapReuseCuff(firstAttr(attrs, "cuff_style")),
  };
}

/** Directional impact bars from published storefront filter attributes (same model as homepage best match). */
export function deriveProductImpactPerformance(input: {
  attributes: Record<string, string | string[]>;
  categorySlug: string | null;
}): ProductImpactPerformance {
  const normalized = editorAttributesToNormalized(input.attributes);
  const family = detectGloveFamily(normalized, { category_slug: input.categorySlug ?? undefined });

  if (family === "reusable") {
    const state = editorAttrsToReusableState(normalized);
    return mapReusableToMockupPerf(deriveReusableProfile(state).performance);
  }

  const state = editorAttrsToDisposableState(normalized);
  if (family === "chemical") {
    state.task = "chemical";
    state.gloveClass = "chemo-rated";
  }
  const profile = deriveDisposableProfile(state);
  return mapDisposableToMockupPerf(profile.performance, state.texture);
}

export function initProductImpactPerformance(input: {
  metadata?: Record<string, unknown> | null;
  attributes: Record<string, string | string[]>;
  categorySlug: string | null;
}): ProductImpactPerformance {
  return (
    parseImpactPerformanceFromMetadata(input.metadata) ??
    deriveProductImpactPerformance({ attributes: input.attributes, categorySlug: input.categorySlug })
  );
}

export function applyImpactPerformanceToMetadata(
  meta: Record<string, unknown>,
  impact: ProductImpactPerformance | null | undefined
): void {
  if (!impact) return;
  meta[IMPACT_PERFORMANCE_METADATA_KEY] = impact;
}

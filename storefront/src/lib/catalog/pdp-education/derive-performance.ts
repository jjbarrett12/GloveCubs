import type { GloveFamily, PerfMetric } from "@/lib/catalog/pdp-education/types";
import {
  clampLevel,
  parseAnsiCutIndex,
  parseThicknessMil,
  perfKeysForFamily,
} from "@/lib/catalog/pdp-education/performance-mappings";
import { attrHaystack, firstAttr, type NormalizedPdpAttributes } from "@/lib/catalog/pdp-education/normalize-attributes";

function materialBase(material: string | null): Record<string, number> {
  const m = (material ?? "").toLowerCase();
  if (m.includes("nitrile")) return { barrier: 2, dexterity: 1, chemical: 2, puncture: 2, comfort: 1, grip: 2 };
  if (m.includes("vinyl")) return { barrier: 1, dexterity: 1, chemical: 0, puncture: 0, comfort: 2, grip: 0, cost: 2 };
  if (m.includes("latex")) return { barrier: 1, dexterity: 2, chemical: 1, puncture: 1, comfort: 2, grip: 1 };
  if (m.includes("neoprene") || m.includes("butyl")) return { barrier: 2, chemical: 2, dexterity: 0, puncture: 1 };
  return { barrier: 1, dexterity: 1, chemical: 1, puncture: 1, comfort: 1, grip: 1 };
}

function textureMod(texture: string | null): Record<string, number> {
  const t = (texture ?? "").toLowerCase();
  if (t.includes("full") || t.includes("diamond") || t.includes("textur")) return { grip: 2, dexterity: -1, puncture: 1 };
  if (t.includes("finger")) return { grip: 1, dexterity: 0 };
  if (t.includes("smooth")) return { dexterity: 1, grip: -1 };
  return {};
}

function thicknessMod(mil: number | null): Record<string, number> {
  if (mil == null) return {};
  if (mil <= 4) return { barrier: -1, dexterity: 1, comfort: 1 };
  if (mil >= 8) return { barrier: 2, dexterity: -2, puncture: 2, comfort: -1 };
  if (mil >= 6) return { barrier: 1, dexterity: -1, puncture: 1 };
  return {};
}

function coatingMod(coating: string | null): Record<string, number> {
  const c = (coating ?? "").toLowerCase();
  if (c.includes("nitrile")) return { grip: 2, abrasion: 1, durability: 1 };
  if (c.includes("latex")) return { grip: 1, dexterity: 1 };
  if (c.includes("pu") || c.includes("polyurethane")) return { dexterity: 2, grip: 0 };
  if (c.includes("pvc")) return { grip: 1, durability: 1 };
  return {};
}

function cutMod(cutRaw: string | null): Record<string, number> {
  const idx = parseAnsiCutIndex(cutRaw);
  if (idx == null) return {};
  return {
    cut: idx >= 4 ? 2 : idx >= 3 ? 1 : 0,
    dexterity: idx >= 4 ? -2 : idx >= 3 ? -1 : 0,
    abrasion: idx >= 3 ? 1 : 0,
  };
}

function levelFromMods(key: string, base: number, mods: Record<string, number>[]): number {
  let v = base;
  for (const mod of mods) v += mod[key] ?? 0;
  return v;
}

export function derivePerformanceMetrics(family: GloveFamily, attrs: NormalizedPdpAttributes): PerfMetric[] {
  const keys = perfKeysForFamily(family);
  const material = firstAttr(attrs, "material");
  const texture = firstAttr(attrs, "texture");
  const coating = firstAttr(attrs, "coating");
  const thickness = parseThicknessMil(firstAttr(attrs, "thickness_mil"));
  const cut = firstAttr(attrs, "cut_level_ansi");
  const hay = attrHaystack(attrs);

  const mods: Record<string, number>[] = [
    materialBase(material),
    textureMod(texture),
    thicknessMod(thickness),
    coatingMod(coating),
    cutMod(cut),
  ];

  if (hay.includes("food") || hay.includes("haccp")) mods.push({ dexterity: 1, chemical: -1 });
  if (hay.includes("oil") || hay.includes("wet")) mods.push({ grip: 1 });
  if ((attrs.protection_tags ?? []).some((t) => t.toLowerCase().includes("chem"))) mods.push({ chemical: 2, barrier: 1 });

  const abrasionRaw = firstAttr(attrs, "abrasion_level");
  if (abrasionRaw) {
    const ab = abrasionRaw.toLowerCase();
    if (ab.includes("high") || ab.includes("4") || ab.includes("3")) mods.push({ abrasion: 2 });
    else if (ab.includes("med")) mods.push({ abrasion: 1 });
  }

  return keys.map(({ key, label }) => ({
    key,
    label,
    level: clampLevel(levelFromMods(key, 1, mods)),
  }));
}

import { makeFieldEvidence } from "./evidence-helpers";
import type { DisposableReusable, FieldEvidence } from "./types";

export type GloveAttributeExtractionInput = {
  title?: string;
  description?: string;
  bullets?: string[];
  specTable?: Record<string, string>;
  jsonLdDescription?: string;
  rawTextSample?: string;
};

export type GloveAttributeExtractionResult = {
  disposableReusable?: FieldEvidence<DisposableReusable>;
  taxonomyMaterial?: FieldEvidence<string>;
  attributes: {
    material?: FieldEvidence<string>;
    color?: FieldEvidence<string>;
    thicknessMil?: FieldEvidence<number>;
    lengthInches?: FieldEvidence<number>;
    powderFree?: FieldEvidence<boolean>;
    latexFree?: FieldEvidence<boolean>;
    foodSafe?: FieldEvidence<boolean>;
    examGrade?: FieldEvidence<boolean>;
    chemoRated?: FieldEvidence<boolean>;
    fentanylRated?: FieldEvidence<boolean>;
    textured?: FieldEvidence<boolean>;
    grip?: FieldEvidence<string>;
    ambidextrous?: FieldEvidence<boolean>;
    beadedCuff?: FieldEvidence<boolean>;
    sterile?: FieldEvidence<boolean>;
    certifications?: FieldEvidence<string[]>;
    standards?: FieldEvidence<string[]>;
    ansiCutLevel?: FieldEvidence<string>;
    en388Rating?: FieldEvidence<string>;
    coating?: FieldEvidence<string>;
    liner?: FieldEvidence<string>;
    cuffType?: FieldEvidence<string>;
  };
};

const MATERIAL_NEGATIVE_PHRASE_RES: RegExp[] = [
  /\blatex[\s-]?free\b/gi,
  /\bnot\s+made\s+with\s+latex\b/gi,
  /\bnon[\s-]?latex\b/gi,
  /\bpowder[\s-]?free\b/gi,
  /\bdehp[\s-]?free\b/gi,
  /\balternative\s+to\s+vinyl\b/gi,
  /\bvinyl\s+alternative\b/gi,
];

const MATERIAL_PATTERNS: Array<{ re: RegExp; value: string }> = [
  { re: /\bhigh[\s-]?density\s+polyethylene\b|\bhdpe\b|\bsynthetic\s+hdpe\s+resin\b/i, value: "polyethylene" },
  { re: /\bpolyethylene\b|\bpoly(?:ethylene|)\s+gloves?\b/i, value: "polyethylene" },
  { re: /\bnitrile\b/i, value: "nitrile" },
  { re: /\bvinyl\b|\bpvc\b/i, value: "vinyl" },
  { re: /\blatex\b|\bnatural\s+rubber\b/i, value: "latex" },
  { re: /\bneoprene\b|\bchloroprene\b/i, value: "neoprene" },
  { re: /\bleather\b/i, value: "leather" },
  { re: /\bcotton\b/i, value: "cotton" },
];

const TITLE_MATERIAL_PATTERNS: Array<{ re: RegExp; value: string }> = [
  { re: /\bpolyethylene\b/i, value: "polyethylene" },
  { re: /\bnitrile\b/i, value: "nitrile" },
  { re: /\bvinyl\b/i, value: "vinyl" },
  { re: /\blatex\b(?!\s*free\b)/i, value: "latex" },
];

const COLOR_PATTERNS: Array<{ re: RegExp; value: string }> = [
  { re: /\bblue\s*violet\b/i, value: "blue violet" },
  { re: /\bblue\b/i, value: "blue" },
  { re: /\bblack\b/i, value: "black" },
  { re: /\bwhite\b/i, value: "white" },
  { re: /\bclear\b/i, value: "clear" },
  { re: /\borange\b/i, value: "orange" },
  { re: /\bgreen\b/i, value: "green" },
];

const CERT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bfda\b/i, label: "FDA" },
  { re: /\bastm\b/i, label: "ASTM" },
  { re: /\ben\s*388\b/i, label: "EN 388" },
  { re: /\bansi\s*\/?\s*isea\b/i, label: "ANSI/ISEA" },
  { re: /\bce\b/i, label: "CE" },
  { re: /\biso\b/i, label: "ISO" },
  { re: /\bcfia\b/i, label: "CFIA" },
  { re: /\bhaccp\b/i, label: "HACCP" },
  { re: /\busda\b/i, label: "USDA" },
  { re: /\bprop\s*65\b/i, label: "Prop 65" },
];

function combinedText(input: GloveAttributeExtractionInput): string {
  return [
    input.title,
    input.description,
    input.jsonLdDescription,
    ...(input.bullets ?? []),
    input.rawTextSample,
    ...Object.entries(input.specTable ?? {}).map(([k, v]) => `${k}: ${v}`),
  ]
    .filter(Boolean)
    .join(" ");
}

function stripMaterialNegativeClaims(text: string): string {
  let out = text;
  for (const re of MATERIAL_NEGATIVE_PHRASE_RES) {
    out = out.replace(re, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function normalizeMaterialToken(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/poly(?:ethylene)?|pe\b|hdpe|high[\s-]?density\s+polyethylene/.test(s)) return "polyethylene";
  if (/nitrile/.test(s)) return "nitrile";
  if (/vinyl|pvc/.test(s)) return "vinyl";
  if (/latex|natural\s+rubber/.test(s)) return "latex";
  if (/neoprene|chloroprene/.test(s)) return "neoprene";
  if (/leather/.test(s)) return "leather";
  if (/cotton/.test(s)) return "cotton";
  return s;
}

function firstMatch(
  text: string,
  patterns: Array<{ re: RegExp; value: string }>
): { value: string; quote: string } | null {
  const cleaned = stripMaterialNegativeClaims(text);
  for (const { re, value } of patterns) {
    const m = cleaned.match(re);
    if (m) return { value, quote: m[0] };
  }
  return null;
}

function materialFromSpecTable(specTable?: Record<string, string>): { value: string; quote: string } | null {
  if (!specTable) return null;
  for (const [key, val] of Object.entries(specTable)) {
    if (!/material/i.test(key)) continue;
    const normalized = normalizeMaterialToken(val);
    if (normalized) return { value: normalized, quote: val.trim() };
  }
  return null;
}

function materialFromTitle(title?: string): { value: string; quote: string } | null {
  if (!title?.trim()) return null;
  return firstMatch(title, TITLE_MATERIAL_PATTERNS);
}

function materialFromDescription(input: GloveAttributeExtractionInput): { value: string; quote: string } | null {
  const chunks = [input.description, input.jsonLdDescription, ...(input.bullets ?? [])].filter(Boolean).join(" ");
  if (!chunks.trim()) return null;
  return firstMatch(chunks, MATERIAL_PATTERNS);
}

function materialFromHdpeFeature(bullets?: string[]): { value: string; quote: string } | null {
  for (const bullet of bullets ?? []) {
    const m = bullet.match(/\b(?:100%\s*)?(?:synthetic\s+)?hdpe\s+resin\b/i);
    if (m) return { value: "polyethylene", quote: m[0] };
  }
  return null;
}

function extractMaterial(input: GloveAttributeExtractionInput): FieldEvidence<string> | undefined {
  const specMatch = materialFromSpecTable(input.specTable);
  if (specMatch) {
    return makeFieldEvidence(specMatch.value, 0.92, "table", { quote: specMatch.quote });
  }

  const titleMatch = materialFromTitle(input.title);
  if (titleMatch) {
    return makeFieldEvidence(titleMatch.value, 0.86, "title", { quote: titleMatch.quote });
  }

  const descMatch = materialFromDescription(input);
  if (descMatch) {
    return makeFieldEvidence(descMatch.value, 0.8, "text", { quote: descMatch.quote });
  }

  const hdpeMatch = materialFromHdpeFeature(input.bullets);
  if (hdpeMatch) {
    return makeFieldEvidence(hdpeMatch.value, 0.78, "text", { quote: hdpeMatch.quote });
  }

  const fallback = firstMatch(combinedText(input), MATERIAL_PATTERNS);
  if (fallback) {
    return makeFieldEvidence(fallback.value, 0.72, "text", { quote: fallback.quote });
  }

  return undefined;
}

function parseThicknessMil(text: string, specTable?: Record<string, string>): FieldEvidence<number> | undefined {
  for (const [key, val] of Object.entries(specTable ?? {})) {
    if (!/(?:thickness|^mil$)/i.test(key)) continue;
    const n = parseFloat(String(val).replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) {
      return makeFieldEvidence(n, 0.9, "table", { quote: String(val) });
    }
  }

  const milMatches = [...text.matchAll(/(?:^|[^\d.])(\d+(?:\.\d+)?|\.\d+)\s*mil\b/gi)];
  if (milMatches.length > 0) {
    const best = milMatches[0]!;
    const raw = best[1]!.startsWith(".") ? `0${best[1]}` : best[1]!;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) {
      return makeFieldEvidence(n, 0.85, "text", { quote: best[0].trim() });
    }
  }

  return undefined;
}

function boolFromText(text: string, re: RegExp, quote?: string): FieldEvidence<boolean> | undefined {
  if (!re.test(text)) return undefined;
  const m = text.match(re);
  return makeFieldEvidence(true, 0.82, "text", { quote: quote ?? m?.[0] });
}

function classifyDisposableReusable(text: string): FieldEvidence<DisposableReusable> | undefined {
  const reusable =
    /\b(reusable|work\s+glove|cut\s+resist|ansi\s*cut|en\s*388|coated\s+glove|impact\s+protect)\b/i.test(text);
  const disposable = /\b(disposable|exam\s+glove|nitrile\s+exam|vinyl\s+exam|single[\s-]?use)\b/i.test(text);
  if (reusable && !disposable) {
    return makeFieldEvidence("reusable", 0.8, "heuristic", { reasons: ["reusable_signals"] });
  }
  if (disposable) {
    return makeFieldEvidence("disposable", 0.82, "heuristic", { reasons: ["disposable_signals"] });
  }
  if (/\bglove/i.test(text)) {
    return makeFieldEvidence("unknown", 0.4, "heuristic", { trust: "weak" });
  }
  return undefined;
}

/** Extract glove-specific attributes and disposable/reusable classification. */
export function extractGloveAttributes(input: GloveAttributeExtractionInput): GloveAttributeExtractionResult {
  const text = combinedText(input);
  const attributes: GloveAttributeExtractionResult["attributes"] = {};

  const material = extractMaterial(input);
  if (material) attributes.material = material;

  const colorMatch = firstMatch(text, COLOR_PATTERNS);
  if (colorMatch) {
    attributes.color = makeFieldEvidence(colorMatch.value, 0.75, "text", { quote: colorMatch.quote });
  }

  const thickness = parseThicknessMil(text, input.specTable);
  if (thickness) attributes.thicknessMil = thickness;

  attributes.powderFree = boolFromText(text, /\bpowder[\s-]?free\b/i);
  attributes.latexFree = boolFromText(text, /\blatex[\s-]?free\b/i);
  attributes.foodSafe =
    boolFromText(text, /\bfood[\s-]?(?:safe|contact|handling)\b/i) ??
    boolFromText(text, /\bfda\s+cfr\s+title\s*21\b.*\bindirect\s+food\s+additive\b/i) ??
    boolFromText(text, /\bindirect\s+food\s+additive\s+regulations\b/i);
  attributes.examGrade = boolFromText(text, /\bexam(?:\s+grade|\s+glove)?\b|\bmedical\s+exam\b/i);
  attributes.chemoRated = boolFromText(text, /\bchemo(?:therapy)?[\s-]?(?:tested|rated)?\b/i);
  attributes.fentanylRated = boolFromText(text, /\bfentanyl[\s-]?(?:tested|rated)?\b/i);
  attributes.textured = boolFromText(text, /\b(textured|fingertip\s+textured|full[\s-]?texture)\b/i);
  attributes.ambidextrous = boolFromText(text, /\bambidextrous\b/i);
  attributes.beadedCuff = boolFromText(text, /\bbeaded\s+cuff\b/i);
  attributes.sterile = boolFromText(text, /\bnon[\s-]?sterile\b/i)
    ? makeFieldEvidence(false, 0.8, "text", { quote: "non-sterile" })
    : boolFromText(text, /\bsterile\b/i);

  const gripM = text.match(/\b(?:grip|finish)[:\s]+([a-z\s-]+)/i);
  if (gripM?.[1]) {
    attributes.grip = makeFieldEvidence(gripM[1].trim(), 0.7, "text", { quote: gripM[0] });
  }

  const coatingM = text.match(/\b(nitrile|latex|polyurethane|pu|pvc)\s+coated\b/i);
  if (coatingM) {
    attributes.coating = makeFieldEvidence(coatingM[0], 0.78, "text", { quote: coatingM[0] });
  }

  const ansiM = text.match(/\bANSI[\s/]*ISEA[\s-]*(?:CUT[\s-]*)?(?:LEVEL[\s-]*)?([A-F0-9]+)\b/i);
  if (ansiM) {
    attributes.ansiCutLevel = makeFieldEvidence(ansiM[1] ?? ansiM[0], 0.85, "text", { quote: ansiM[0] });
  }

  const en388M = text.match(/\bEN\s*388[:\s]*([0-9Xx]{4,5})\b/i);
  if (en388M) {
    attributes.en388Rating = makeFieldEvidence(en388M[1] ?? en388M[0], 0.85, "text", { quote: en388M[0] });
  }

  const certs: string[] = [];
  for (const { re, label } of CERT_PATTERNS) {
    if (re.test(text)) certs.push(label);
  }
  if (certs.length) {
    attributes.certifications = makeFieldEvidence([...new Set(certs)], 0.72, "text", {
      quote: certs.join(", "),
    });
  }

  const disposableReusable = classifyDisposableReusable(text);

  return {
    disposableReusable,
    taxonomyMaterial: attributes.material,
    attributes,
  };
}

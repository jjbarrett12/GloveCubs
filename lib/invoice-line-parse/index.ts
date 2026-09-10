/**
 * Deterministic glove invoice-line parsing (abbreviations + pack / UoM).
 * Conservative: whole-token matches only. Unknown stays null.
 */

export type InvoiceQuantityUom = "EA" | "BX" | "CS";

export type ParsedGloveLine = {
  material: "nitrile" | "vinyl" | "latex" | null;
  color: string | null;
  size: string | null;
  thickness_mil: number | null;
  grade: "exam" | "general_purpose" | null;
  powder: "powder_free" | "powdered" | null;
  gloves_per_box: number | null;
  boxes_per_case: number | null;
  gloves_per_case: number | null;
  quantity_uom: InvoiceQuantityUom | null;
  pack_notation: string | null;
  texture: string | null;
  cuff: string | null;
};

const EMPTY: ParsedGloveLine = {
  material: null,
  color: null,
  size: null,
  thickness_mil: null,
  grade: null,
  powder: null,
  gloves_per_box: null,
  boxes_per_case: null,
  gloves_per_case: null,
  quantity_uom: null,
  pack_notation: null,
  texture: null,
  cuff: null,
};

const MATERIAL_TOKEN: Record<string, ParsedGloveLine["material"]> = {
  nitr: "nitrile",
  nit: "nitrile",
  ntrl: "nitrile",
  nitrile: "nitrile",
  vinyl: "vinyl",
  latex: "latex",
};

const COLOR_TOKEN: Record<string, string> = {
  blk: "black",
  black: "black",
  blu: "blue",
  blue: "blue",
  wht: "white",
  white: "white",
  vio: "violet",
  violet: "violet",
  pur: "purple",
  purple: "purple",
};

const SIZE_TOKEN: Record<string, string> = {
  xs: "xs",
  sm: "s",
  s: "s",
  md: "m",
  med: "m",
  m: "m",
  lg: "l",
  l: "l",
  xl: "xl",
  xlg: "xl",
  xxl: "xxl",
};

function tokenize(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[^\w./]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function parseThousandToken(raw: string): number | null {
  const m = raw.match(/^(\d+(?:\.\d+)?)M$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}

export function parsePackAndUom(text: string): Pick<
  ParsedGloveLine,
  "gloves_per_box" | "boxes_per_case" | "gloves_per_case" | "quantity_uom" | "pack_notation"
> {
  const src = text.toUpperCase();
  const notations: string[] = [];
  let glovesPerBox: number | null = null;
  let boxesPerCase: number | null = null;
  let glovesPerCase: number | null = null;
  let quantityUom: InvoiceQuantityUom | null = null;

  const bxCs = src.match(/(\d+)\s*BX\s*\/\s*CS\b/);
  if (bxCs) {
    boxesPerCase = Number(bxCs[1]);
    notations.push(bxCs[0].replace(/\s+/g, ""));
  }

  const perBx = src.match(/(\d+)\s*(?:EA\s*)?\/\s*BX\b/);
  if (perBx) {
    glovesPerBox = Number(perBx[1]);
    notations.push(perBx[0].replace(/\s+/g, ""));
  }

  const perCsNum = src.match(/\b(\d+)\s*\/\s*CS\b/);
  if (perCsNum) {
    glovesPerCase = Number(perCsNum[1]);
    notations.push(perCsNum[0].replace(/\s+/g, ""));
  }

  const perCsM = src.match(/\b(\d+(?:\.\d+)?)M\s*\/\s*CS\b/);
  if (perCsM) {
    const n = parseThousandToken(`${perCsM[1]}M`);
    if (n != null) {
      glovesPerCase = n;
      notations.push(perCsM[0].replace(/\s+/g, ""));
    }
  }

  if (glovesPerBox != null && boxesPerCase != null && glovesPerCase == null) {
    glovesPerCase = glovesPerBox * boxesPerCase;
  }

  if (boxesPerCase != null || glovesPerCase != null) {
    quantityUom = "CS";
  } else if (glovesPerBox != null) {
    quantityUom = "BX";
  } else if (/\bCS\b|\bCASE\b/.test(src)) {
    quantityUom = "CS";
  } else if (/\bBX\b|\bBOX\b/.test(src)) {
    quantityUom = "BX";
  } else if (/\bEA\b/.test(src)) {
    quantityUom = "EA";
  }

  return {
    gloves_per_box: glovesPerBox,
    boxes_per_case: boxesPerCase,
    gloves_per_case: glovesPerCase,
    quantity_uom: quantityUom,
    pack_notation: notations.length ? notations.join(" ") : null,
  };
}

export function parseGloveInvoiceLine(description: string): ParsedGloveLine {
  const text = (description ?? "").trim();
  if (!text) return { ...EMPTY };
  const tokens = tokenize(text);
  const out: ParsedGloveLine = { ...EMPTY, ...parsePackAndUom(text) };

  for (const tok of tokens) {
    const lower = tok.toLowerCase().replace(/\.+$/, "");
    if (lower === "glv" || lower === "glvs" || lower === "glove" || lower === "gloves") continue;

    if (out.material == null && MATERIAL_TOKEN[lower]) {
      out.material = MATERIAL_TOKEN[lower];
    }
    if (out.color == null && COLOR_TOKEN[lower]) {
      out.color = COLOR_TOKEN[lower];
    }
    if (out.size == null && SIZE_TOKEN[lower]) {
      out.size = SIZE_TOKEN[lower];
    }
    if (out.powder == null && (lower === "pf" || lower === "powderfree" || lower === "powder-free")) {
      out.powder = "powder_free";
    }
    if (out.powder == null && lower === "pwd") {
      out.powder = "powdered";
    }
    if (out.grade == null && lower === "exam") {
      out.grade = "exam";
    }
    if (out.grade == null && (lower === "gp" || lower === "ind")) {
      out.grade = "general_purpose";
    }

    const mil = lower.match(/^(\d+(?:\.\d+)?)mil$/);
    if (mil && out.thickness_mil == null) {
      const n = Number(mil[1]);
      if (Number.isFinite(n) && n > 0 && n <= 20) out.thickness_mil = n;
    }
  }

  const milPhrase = text.match(/\b(\d+(?:\.\d+)?)\s*mil\b/i);
  if (out.thickness_mil == null && milPhrase) {
    const n = Number(milPhrase[1]);
    if (Number.isFinite(n) && n > 0 && n <= 20) out.thickness_mil = n;
  }

  if (/\bfully\s+textured\b/i.test(text)) out.texture = "fully_textured";
  else if (/\bfingertip\b/i.test(text)) out.texture = "fingertip_textured";

  if (/\bextended\s+cuff\b/i.test(text)) out.cuff = "extended_cuff";

  return out;
}

export function extractMaterialTokenFromText(text: string): string {
  return parseGloveInvoiceLine(text).material ?? "";
}

export function extractColorTokenFromText(text: string): string {
  return parseGloveInvoiceLine(text).color ?? "";
}

export function extractSizeTokenFromText(text: string): string {
  return parseGloveInvoiceLine(text).size ?? "";
}

/**
 * Explicit GloveCubs substitution compatibility gates.
 * Compatibility first; price second. Color is never a hard block.
 */

export type GloveSpecSnapshot = {
  material?: string | null;
  grade?: string | null;
  thickness_mil?: number | null;
  powder?: string | null;
  size?: string | null;
  texture?: string | null;
  cuff?: string | null;
  certifications?: string[] | null;
  color?: string | null;
};

export type CompatibilityCheck =
  | { attribute: string; result: "MATCH" | "DIFFERENT" | "MISSING"; blocking: boolean; note?: string };

export type CompatibilityVerdict =
  | "compatible"
  | "incompatible"
  | "review_required";

const EXAM_GRADES = new Set(["exam", "medical_exam_grade", "medical_exam", "exam_grade"]);
const GP_GRADES = new Set(["general_purpose", "industrial_grade", "food_service_grade", "gp"]);

export function normalizeGrade(raw: string | null | undefined): "exam" | "general_purpose" | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  if (EXAM_GRADES.has(s) || s.includes("exam") || s.includes("medical")) return "exam";
  if (GP_GRADES.has(s) || s.includes("industrial") || s.includes("food")) return "general_purpose";
  return null;
}

export function normalizePowder(raw: string | null | undefined): "powder_free" | "powdered" | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "pf" || s.includes("powder_free") || s.includes("powderfree")) return "powder_free";
  if (s.includes("powder")) return "powdered";
  return null;
}

export function normalizeMaterial(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.includes("nitr")) return "nitrile";
  if (s.includes("vinyl")) return "vinyl";
  if (s.includes("latex")) return "latex";
  return s.replace(/\s+/g, "_");
}

function thicknessClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.05;
}

/**
 * HARD: material, exam/GP grade when both known, thickness when both known, powder when both known,
 *       size when invoice size is known (must be listed on GloveCubs available sizes),
 *       certifications present on the invoice (GloveCubs must include each).
 * SOFT: color (caller omits — never blocking), texture, cuff — mismatch requires review, not a hard block.
 */
export function evaluateCompatibility(input: {
  current: GloveSpecSnapshot;
  gloveCubs: GloveSpecSnapshot;
  gloveCubsAvailableSizes?: string[] | null;
}): { verdict: CompatibilityVerdict; checks: CompatibilityCheck[] } {
  const checks: CompatibilityCheck[] = [];
  const cur = input.current;
  const gc = input.gloveCubs;

  const curMat = normalizeMaterial(cur.material);
  const gcMat = normalizeMaterial(gc.material);
  if (!curMat || !gcMat) {
    checks.push({ attribute: "material", result: "MISSING", blocking: false, note: "Material required — insufficient data" });
  } else if (curMat !== gcMat) {
    checks.push({ attribute: "material", result: "DIFFERENT", blocking: true });
  } else {
    checks.push({ attribute: "material", result: "MATCH", blocking: false });
  }

  const curGrade = normalizeGrade(cur.grade);
  const gcGrade = normalizeGrade(gc.grade);
  if (!curGrade || !gcGrade) {
    checks.push({ attribute: "grade", result: "MISSING", blocking: false, note: "Grade unknown — review required" });
  } else if (curGrade !== gcGrade) {
    checks.push({ attribute: "grade", result: "DIFFERENT", blocking: true });
  } else {
    checks.push({ attribute: "grade", result: "MATCH", blocking: false });
  }

  const curMil = cur.thickness_mil != null && Number.isFinite(cur.thickness_mil) ? Number(cur.thickness_mil) : null;
  const gcMil = gc.thickness_mil != null && Number.isFinite(gc.thickness_mil) ? Number(gc.thickness_mil) : null;
  if (curMil == null || gcMil == null) {
    checks.push({ attribute: "thickness", result: "MISSING", blocking: false, note: "Thickness unknown — review required" });
  } else if (!thicknessClose(curMil, gcMil)) {
    checks.push({ attribute: "thickness", result: "DIFFERENT", blocking: true, note: "Mil thickness is not interchangeable" });
  } else {
    checks.push({ attribute: "thickness", result: "MATCH", blocking: false });
  }

  const curPf = normalizePowder(cur.powder);
  const gcPf = normalizePowder(gc.powder);
  if (!curPf || !gcPf) {
    checks.push({ attribute: "powder", result: "MISSING", blocking: false });
  } else if (curPf !== gcPf) {
    checks.push({ attribute: "powder", result: "DIFFERENT", blocking: true });
  } else {
    checks.push({ attribute: "powder", result: "MATCH", blocking: false });
  }

  const curSize = cur.size != null && String(cur.size).trim() ? String(cur.size).trim().toLowerCase() : null;
  if (curSize) {
    const available = (input.gloveCubsAvailableSizes ?? [])
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean);
    const gcSize = gc.size != null ? String(gc.size).trim().toLowerCase() : null;
    const sizeOk =
      (gcSize != null && gcSize === curSize) ||
      (available.length > 0 && available.includes(curSize));
    if (!sizeOk) {
      checks.push({
        attribute: "size",
        result: available.length || gcSize ? "DIFFERENT" : "MISSING",
        blocking: true,
        note: "Invoice size must exist on the GloveCubs product",
      });
    } else {
      checks.push({ attribute: "size", result: "MATCH", blocking: false });
    }
  } else {
    checks.push({ attribute: "size", result: "MISSING", blocking: false, note: "Invoice size unknown — review required" });
  }

  const curTex = cur.texture?.trim() ? String(cur.texture).toLowerCase() : null;
  const gcTex = gc.texture?.trim() ? String(gc.texture).toLowerCase() : null;
  if (curTex && gcTex && curTex !== gcTex) {
    checks.push({ attribute: "texture", result: "DIFFERENT", blocking: false, note: "Soft mismatch — review" });
  } else if (curTex && gcTex) {
    checks.push({ attribute: "texture", result: "MATCH", blocking: false });
  }

  const curCuff = cur.cuff?.trim() ? String(cur.cuff).toLowerCase() : null;
  const gcCuff = gc.cuff?.trim() ? String(gc.cuff).toLowerCase() : null;
  if (curCuff && gcCuff && curCuff !== gcCuff) {
    checks.push({ attribute: "cuff", result: "DIFFERENT", blocking: false, note: "Soft mismatch — review" });
  } else if (curCuff && gcCuff) {
    checks.push({ attribute: "cuff", result: "MATCH", blocking: false });
  }

  const needed = (cur.certifications ?? []).map((c) => String(c).trim().toLowerCase()).filter(Boolean);
  const have = new Set((gc.certifications ?? []).map((c) => String(c).trim().toLowerCase()));
  if (needed.length > 0) {
    const missing = needed.filter((c) => !have.has(c));
    if (missing.length) {
      checks.push({
        attribute: "certifications",
        result: "DIFFERENT",
        blocking: true,
        note: `Missing: ${missing.join(", ")}`,
      });
    } else {
      checks.push({ attribute: "certifications", result: "MATCH", blocking: false });
    }
  }

  if (cur.color && gc.color && String(cur.color).toLowerCase() !== String(gc.color).toLowerCase()) {
    checks.push({
      attribute: "color",
      result: "DIFFERENT",
      blocking: false,
      note: "Color is preference — non-blocking",
    });
  } else if (cur.color && gc.color) {
    checks.push({ attribute: "color", result: "MATCH", blocking: false });
  }

  if (checks.some((c) => c.blocking && c.result !== "MATCH")) {
    return { verdict: "incompatible", checks };
  }
  if (checks.some((c) => c.result === "MISSING" && (c.attribute === "material" || c.attribute === "grade" || c.attribute === "thickness" || c.attribute === "powder" || c.attribute === "size"))) {
    return { verdict: "review_required", checks };
  }
  if (checks.some((c) => !c.blocking && c.result === "DIFFERENT" && c.attribute !== "color")) {
    return { verdict: "review_required", checks };
  }
  return { verdict: "compatible", checks };
}

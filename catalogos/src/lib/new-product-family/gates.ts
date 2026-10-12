import {
  CERTIFICATION_VALUES,
  COLOR_VALUES,
  CUFF_STYLE_VALUES,
  GRADE_VALUES,
  MATERIAL_VALUES,
  POWDER_VALUES,
  STERILITY_VALUES,
  TEXTURE_VALUES,
  THICKNESS_MIL_VALUES,
} from "@/lib/catalogos/attribute-dictionary-types";
import { evaluateFamilyCost } from "./cost";
import { isImplementedProductTypeKey } from "@/lib/product-types";
import type { NewProductFamilyDraft, StepGate, WizardStepId } from "./types";
import { WIZARD_STEPS } from "./types";
import { evaluateFamilyPackaging } from "./packaging";
import {
  deriveFamilyGloveCubsSkus,
  duplicateManufacturerSkus,
  effectiveSupplierSku,
  familySkuCollisionIssues,
  manufacturerSkuStatus,
  type SkuCollisionInput,
} from "./sku-assist";

const MATERIAL_SET = new Set<string>(MATERIAL_VALUES);
const GRADE_SET = new Set<string>(GRADE_VALUES);
const COLOR_SET = new Set<string>(COLOR_VALUES);
const POWDER_SET = new Set<string>(POWDER_VALUES);
const THICKNESS_SET = new Set<string>(THICKNESS_MIL_VALUES);
const TEXTURE_SET = new Set<string>(TEXTURE_VALUES);
const STERILITY_SET = new Set<string>(STERILITY_VALUES);
const CERT_SET = new Set<string>(CERTIFICATION_VALUES);
const CUFF_SET = new Set<string>(CUFF_STYLE_VALUES);

export function evaluateIdentityStep(draft: NewProductFamilyDraft): StepGate {
  if (!isImplementedProductTypeKey(draft.productType)) {
    return { complete: false, canAdvance: false, blockReason: "Select a product type to continue." };
  }
  if (!draft.brand.trim()) {
    return { complete: false, canAdvance: false, blockReason: "Select a brand to continue." };
  }
  if (!MATERIAL_SET.has(draft.material)) {
    return { complete: false, canAdvance: false, blockReason: "Select a material to continue." };
  }
  if (!GRADE_SET.has(draft.grade)) {
    return { complete: false, canAdvance: false, blockReason: "Select a grade to continue." };
  }
  if (!COLOR_SET.has(draft.color)) {
    return { complete: false, canAdvance: false, blockReason: "Select a color to continue." };
  }
  if (!draft.title.trim()) {
    return { complete: false, canAdvance: false, blockReason: "Enter a display title to continue." };
  }
  return { complete: true, canAdvance: true, blockReason: null };
}

export function evaluateSpecificationsStep(draft: NewProductFamilyDraft): StepGate {
  if (!POWDER_SET.has(draft.powder)) {
    return { complete: false, canAdvance: false, blockReason: "Select powder status to continue." };
  }
  if (!THICKNESS_SET.has(draft.thicknessMil)) {
    return { complete: false, canAdvance: false, blockReason: "Select thickness to continue." };
  }
  if (draft.cuffStyle && !CUFF_SET.has(draft.cuffStyle)) {
    return {
      complete: false,
      canAdvance: false,
      blockReason: "Select a supported cuff style or leave it blank.",
    };
  }
  if (draft.texture && !TEXTURE_SET.has(draft.texture)) {
    return {
      complete: false,
      canAdvance: false,
      blockReason: "Select a supported texture or leave it blank.",
    };
  }
  if (draft.sterility && !STERILITY_SET.has(draft.sterility)) {
    return {
      complete: false,
      canAdvance: false,
      blockReason: "Select a supported sterility value or leave it blank.",
    };
  }
  if (draft.certifications.some((c) => !CERT_SET.has(c))) {
    return {
      complete: false,
      canAdvance: false,
      blockReason: "Remove unsupported certification values to continue.",
    };
  }
  return { complete: true, canAdvance: true, blockReason: null };
}

const SIZE_DISPLAY: Record<string, string> = {
  xs: "XS",
  s: "Small",
  m: "Medium",
  l: "Large",
  xl: "XL",
  xxl: "XXL",
  xxxl: "XXXL",
};

export function evaluateSizeFamilyStep(
  draft: NewProductFamilyDraft,
  collisions: SkuCollisionInput
): StepGate {
  if (draft.sizes.length === 0) {
    return { complete: false, canAdvance: false, blockReason: "Select at least one size to continue." };
  }
  for (const size of draft.sizes) {
    const row = draft.variants[size];
    const status = row ? manufacturerSkuStatus(row) : "incomplete";
    if (!row || status !== "confirmed") {
      const label = SIZE_DISPLAY[size] ?? size.toUpperCase();
      return {
        complete: false,
        canAdvance: false,
        blockReason: `Confirm the manufacturer SKU for ${label}.`,
      };
    }
    const supplier = effectiveSupplierSku(draft, size);
    if (!supplier) {
      return {
        complete: false,
        canAdvance: false,
        blockReason: `Enter supplier SKU for ${SIZE_DISPLAY[size] ?? size.toUpperCase()}.`,
      };
    }
  }
  const dupes = duplicateManufacturerSkus(draft);
  if (dupes.length > 0) {
    return {
      complete: false,
      canAdvance: false,
      blockReason: `Manufacturer SKU ${dupes[0]} is used on more than one size.`,
    };
  }
  const derived = deriveFamilyGloveCubsSkus(draft);
  if (!derived.parentSku) {
    return {
      complete: false,
      canAdvance: false,
      blockReason: "GloveCubs SKU could not be generated from the confirmed manufacturer SKUs.",
    };
  }
  for (const size of draft.sizes) {
    const glv = derived.bySize[size];
    if (!glv) {
      return {
        complete: false,
        canAdvance: false,
        blockReason: `GloveCubs SKU could not be generated for ${SIZE_DISPLAY[size] ?? size.toUpperCase()}.`,
      };
    }
    const mfr = draft.variants[size]?.manufacturerSku.trim().toUpperCase() ?? "";
    if (mfr && glv === mfr) {
      return {
        complete: false,
        canAdvance: false,
        blockReason: "Manufacturer SKU must not be used as the GloveCubs SKU.",
      };
    }
  }
  const issues = familySkuCollisionIssues(draft, collisions);
  const blocker = issues[0];
  if (blocker) {
    return { complete: false, canAdvance: false, blockReason: blocker.label };
  }
  return { complete: true, canAdvance: true, blockReason: null };
}

export function evaluatePackagingStep(draft: NewProductFamilyDraft): StepGate {
  const pack = evaluateFamilyPackaging(draft);
  if (!pack.complete) {
    return { complete: false, canAdvance: false, blockReason: pack.blockReason };
  }
  return { complete: true, canAdvance: true, blockReason: null };
}

export function evaluateSupplierCostStep(draft: NewProductFamilyDraft): StepGate {
  const cost = evaluateFamilyCost(draft);
  if (!cost.complete) {
    return { complete: false, canAdvance: false, blockReason: cost.blockReason };
  }
  return { complete: true, canAdvance: true, blockReason: null };
}

export function evaluatePricingStep(draft: NewProductFamilyDraft): StepGate {
  const cost = evaluateSupplierCostStep(draft);
  if (!cost.complete) return cost;
  return { complete: true, canAdvance: true, blockReason: null };
}

export function evaluateReviewStep(draft: NewProductFamilyDraft): StepGate {
  const pricing = evaluatePricingStep(draft);
  if (!pricing.complete) return pricing;
  const image = draft.imageUrl.trim();
  if (!image) {
    return { complete: false, canAdvance: false, blockReason: "Add a real product image URL before review." };
  }
  if (!/^https:\/\//i.test(image) || /placeholder/i.test(image)) {
    return {
      complete: false,
      canAdvance: false,
      blockReason: "Image URL must be an https link to a real product image.",
    };
  }
  return { complete: true, canAdvance: true, blockReason: null };
}

export function evaluatePhaseLockedStep(step: WizardStepId): StepGate {
  const meta = WIZARD_STEPS.find((s) => s.id === step);
  return {
    complete: false,
    canAdvance: false,
    blockReason: `${meta?.label ?? "This step"} will be available in a later phase.`,
  };
}

export function evaluateWizardStep(
  draft: NewProductFamilyDraft,
  step: WizardStepId,
  collisions: SkuCollisionInput
): StepGate {
  switch (step) {
    case 1:
      return evaluateIdentityStep(draft);
    case 2:
      return evaluateSpecificationsStep(draft);
    case 3:
      return evaluateSizeFamilyStep(draft, collisions);
    case 4:
      return evaluatePackagingStep(draft);
    case 5:
      return evaluateSupplierCostStep(draft);
    case 6:
      return evaluatePricingStep(draft);
    case 7:
      return evaluateReviewStep(draft);
    default:
      return evaluatePhaseLockedStep(step);
  }
}

export function completedPhase1StepCount(
  draft: NewProductFamilyDraft,
  collisions: SkuCollisionInput
): number {
  let n = 0;
  if (evaluateIdentityStep(draft).complete) n += 1;
  if (evaluateSpecificationsStep(draft).complete) n += 1;
  if (evaluateSizeFamilyStep(draft, collisions).complete) n += 1;
  if (evaluatePackagingStep(draft).complete) n += 1;
  if (evaluateSupplierCostStep(draft).complete) n += 1;
  if (evaluatePricingStep(draft).complete) n += 1;
  if (evaluateReviewStep(draft).complete) n += 1;
  return n;
}

export function canVisitStep(
  draft: NewProductFamilyDraft,
  target: WizardStepId,
  collisions: SkuCollisionInput
): boolean {
  if (target < 1 || target > 7) return false;
  for (let s = 1; s < target; s++) {
    if (!evaluateWizardStep(draft, s as WizardStepId, collisions).complete) return false;
  }
  return true;
}

export function nextBlockReason(
  draft: NewProductFamilyDraft,
  current: WizardStepId,
  collisions: SkuCollisionInput
): string | null {
  return evaluateWizardStep(draft, current, collisions).blockReason;
}

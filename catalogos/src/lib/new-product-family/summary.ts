import { derivedUnitsPerCase, packagingForSize } from "./packaging";
import { colorLabel, gradeLabel, materialLabel, powderLabel, thicknessLabel } from "./title";
import type { NewProductFamilyDraft } from "./types";

export function familySummaryLines(draft: NewProductFamilyDraft): string[] {
  const lines: string[] = [];
  if (draft.brand.trim()) lines.push(draft.brand.trim());
  if (draft.title.trim()) lines.push(draft.title.trim());
  else {
    const composed = [colorLabel(draft.color), materialLabel(draft.material), gradeLabel(draft.grade)]
      .filter(Boolean)
      .join(" ");
    if (composed) lines.push(composed);
  }
  if (draft.thicknessMil) lines.push(thicknessLabel(draft.thicknessMil));
  if (draft.powder) lines.push(powderLabel(draft.powder));
  if (draft.sizes.length > 0) {
    lines.push(draft.sizes.map((s) => s.toUpperCase()).join(" · "));
  }
  if (draft.samePackagingForAllSizes) {
    const units = derivedUnitsPerCase(draft.packaging);
    if (units != null) lines.push(`${units.toLocaleString("en-US")} gloves / case`);
  } else if (draft.sizes.length > 0) {
    const first = derivedUnitsPerCase(packagingForSize(draft, draft.sizes[0]!));
    if (first != null) lines.push("Packaging varies by size");
  }
  return lines;
}

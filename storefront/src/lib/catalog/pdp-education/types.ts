import type { StoreProductDetail } from "@/lib/catalog/store-product-detail";

/** Directional performance bucket — not lab scores. */
export type PerfLevel = 0 | 1 | 2;

export type GloveFamily = "disposable" | "reusable" | "chemical" | "general";

export type EducationTabId =
  | "overview"
  | "performance"
  | "certifications"
  | "material-science"
  | "cut-resistance"
  | "chemical-resistance"
  | "dexterity-comfort"
  | "grip"
  | "food-safety"
  | "use-environments"
  | "standards"
  | "storage";

export type EducationTab = {
  id: EducationTabId;
  label: string;
};

export type PerfMetric = {
  key: string;
  label: string;
  level: PerfLevel;
};

export type CertificationCard = {
  label: string;
  value: string;
  explanation: string | null;
};

export type SpecHighlight = {
  label: string;
  value: string;
  attribute_key: string;
};

export type PdpEducationModel = {
  family: GloveFamily;
  classification: string;
  educationalSummary: string;
  whatThisMeans: string;
  bestFor: string[];
  watchOut: string[];
  performance: PerfMetric[];
  tabs: EducationTab[];
  certifications: CertificationCard[];
  specHighlights: SpecHighlight[];
  uses: string[];
  industries: string[];
  protectionTags: string[];
  hasFoodContext: boolean;
  hasChemicalContext: boolean;
  hasCutContext: boolean;
  primaryDownload: { label: string; url: string } | null;
};

export type BuildEducationInput = Pick<
  StoreProductDetail,
  "name" | "description" | "metadata" | "specRows" | "commercialRows" | "certificationRows" | "downloads"
>;

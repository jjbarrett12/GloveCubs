export type CompareWizardRow = {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  boxesPerCase: number | null;
  sizes: string | null;
  /** Raw variant size codes for filter matching. */
  sizeCodes: string[];
  material: string | null;
  color: string | null;
  thicknessMil: string | null;
  grade: string | null;
  certifications: string | null;
  casePrice: number | null;
  palletPrice: number | null;
  bestFor: string | null;
  /** Display industry labels for filter matching. */
  industries: string[];
  badges: string[];
  pdpHref: string;
};

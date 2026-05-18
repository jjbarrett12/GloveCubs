import { TrustBand } from "@/components/procurement";

const PROOF_LINE =
  "GloveCubs supplies disposable and work gloves to operators, facilities, and procurement teams—catalog-backed SKUs, case context on listings, and humans on quotes.";

/** Single-line operational proof immediately below the hero. */
export function HomeOperationalProofSection() {
  return <TrustBand variant="line" items={[PROOF_LINE]} />;
}

export const PDP_EDUCATION_DISCLAIMER =
  "Educational guidance only. Confirm final glove selection against published SKU specifications, SDS requirements, certifications, and your organization's safety policies.";

export function PdpEducationDisclaimer({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-center text-[11px] leading-relaxed text-white/38"}>
      {PDP_EDUCATION_DISCLAIMER}
    </p>
  );
}

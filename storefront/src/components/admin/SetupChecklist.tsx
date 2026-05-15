import Image from "next/image";

const STEPS = [
  { label: "Business information", phase: "now" as const },
  { label: "Pricing tier", phase: "now" as const },
  { label: "Delivery locations", phase: "after" as const },
  { label: "Preferred products", phase: "after" as const },
  { label: "Team access", phase: "after" as const },
  { label: "Billing & payment", phase: "after" as const },
];

export function SetupChecklist() {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
          <Image
            src="/images/glovecubs-header-logo.png"
            alt="GloveCubs"
            width={747}
            height={99}
            className="h-3.5 w-auto"
            unoptimized
          />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#e5582d]">New customer setup</p>
          <p className="text-sm font-semibold text-slate-900">Checklist</p>
        </div>
      </div>
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex gap-2.5 text-sm">
            <span
              className={
                s.phase === "now"
                  ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fff7f2] text-[11px] font-bold text-[#e5582d] ring-1 ring-[#f06232]/25"
                  : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500"
              }
              aria-hidden
            >
              {i + 1}
            </span>
            <span className={s.phase === "now" ? "font-medium text-slate-900" : "text-slate-600"}>{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
        Only <span className="font-medium text-slate-700">business information</span> and{" "}
        <span className="font-medium text-slate-700">pricing tier</span> are saved on this step. After the customer
        account exists, continue in the workspace to add delivery locations, preferred products, and the rest.
      </p>
    </div>
  );
}

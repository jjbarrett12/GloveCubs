import Image from "next/image";
import { adminCardSurface, adminEyebrow } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

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
    <div className={cn(adminCardSurface, "p-5")}>
      <div className="mb-4 flex items-center gap-3 border-b border-admin-border-subtle pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-admin-border bg-admin-surface-muted shadow-sm">
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
          <p className={adminEyebrow}>New customer setup</p>
          <p className="text-sm font-semibold text-admin-primary">Checklist</p>
        </div>
      </div>
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex gap-2.5 text-sm">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                s.phase === "now"
                  ? "bg-admin-accent-soft text-admin-accent ring-1 ring-admin-accent/25"
                  : "bg-admin-surface-muted text-[11px] font-semibold text-admin-muted",
              )}
              aria-hidden
            >
              {i + 1}
            </span>
            <span className={s.phase === "now" ? "font-medium text-admin-primary" : "text-admin-secondary"}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-admin-border-subtle pt-4 text-xs leading-relaxed text-admin-muted">
        Only <span className="font-medium text-admin-secondary">business information</span> and{" "}
        <span className="font-medium text-admin-secondary">pricing tier</span> are saved on this step. After the customer
        account exists, continue in the workspace to add delivery locations, preferred products, and the rest.
      </p>
    </div>
  );
}

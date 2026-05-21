"use client";

import * as React from "react";
import { Check, AlertTriangle } from "lucide-react";
import type { PdpEducationModel, EducationTabId } from "@/lib/catalog/pdp-education";
import type { PdpLabeledValue } from "@/lib/catalog/store-product-detail";
import { PdpPerfBar } from "@/components/store/pdp/education/PdpPerfBar";
import { PdpEducationDisclaimer } from "@/components/store/pdp/education/PdpEducationDisclaimer";
import { cn } from "@/lib/utils";

type Props = {
  model: PdpEducationModel;
  specRows: PdpLabeledValue[];
};

export function PdpEducationSection({ model, specRows }: Props) {
  const [activeTab, setActiveTab] = React.useState<EducationTabId>(model.tabs[0]?.id ?? "overview");

  React.useEffect(() => {
    if (!model.tabs.some((t) => t.id === activeTab)) {
      setActiveTab(model.tabs[0]?.id ?? "overview");
    }
  }, [activeTab, model.tabs]);

  if (model.tabs.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-[0_16px_48px_rgb(0_0_0/0.28)]">
      <div className="border-b border-white/10 px-4 py-3 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-orange)]">
          Procurement intelligence
        </p>
        <p className="mt-1 text-sm text-white/55">Attribute-driven education from published SKU data</p>
      </div>

      <div
        className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 sm:px-4 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Product education"
      >
        {model.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition",
              activeTab === tab.id
                ? "bg-[var(--color-accent-orange)] text-[#0a0a0a]"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white/85"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 sm:p-6" role="tabpanel">
        <TabPanel id={activeTab} model={model} specRows={specRows} />
      </div>

      <div className="border-t border-white/10 px-4 py-3 sm:px-6">
        <PdpEducationDisclaimer />
      </div>
    </section>
  );
}

function TabPanel({
  id,
  model,
  specRows,
}: {
  id: EducationTabId;
  model: PdpEducationModel;
  specRows: PdpLabeledValue[];
}) {
  switch (id) {
    case "overview":
      return <OverviewPanel model={model} />;
    case "performance":
      return <PerformancePanel model={model} />;
    case "certifications":
      return <CertificationsPanel model={model} />;
    case "material-science":
      return <SpecGridPanel title="Material & construction" rows={model.specHighlights} />;
    case "cut-resistance":
      return <CutPanel model={model} specRows={specRows} />;
    case "chemical-resistance":
      return <ChemicalPanel model={model} specRows={specRows} />;
    case "dexterity-comfort":
      return (
        <PerformancePanel
          model={{
            ...model,
            performance: model.performance.filter((p) => p.key === "dexterity" || p.key === "comfort"),
          }}
        />
      );
    case "grip":
      return <GripPanel model={model} specRows={specRows} />;
    case "food-safety":
      return <FoodPanel model={model} specRows={specRows} />;
    case "use-environments":
      return <UseEnvironmentsPanel model={model} />;
    case "standards":
      return <StandardsPanel model={model} specRows={specRows} />;
    case "storage":
      return <StoragePanel specRows={specRows} />;
    default:
      return null;
  }
}

function OverviewPanel({ model }: { model: PdpEducationModel }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/72">{model.educationalSummary}</p>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--color-accent-orange)]">What this means</p>
          <p className="text-sm leading-relaxed text-white/75">{model.whatThisMeans}</p>
        </div>
      </div>
      <div className="space-y-4">
        {model.bestFor.length > 0 ? (
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-400/90">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Best for
            </p>
            <ul className="list-none space-y-1.5 p-0 text-sm text-white/80">
              {model.bestFor.map((item) => (
                <li key={item} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {model.watchOut.length > 0 ? (
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-400/90">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Watch out for
            </p>
            <ul className="list-none space-y-1.5 p-0 text-sm text-white/75">
              {model.watchOut.map((item) => (
                <li key={item} className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PerformancePanel({ model }: { model: PdpEducationModel }) {
  if (model.performance.length === 0) return <EmptyTab message="No performance attributes published for directional mapping." />;
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-xs text-white/45">Directional tradeoffs from published material, thickness, coating, and ratings—not lab-certified scores.</p>
      {model.performance.map((m) => (
        <PdpPerfBar key={m.key} label={m.label} level={m.level} />
      ))}
    </div>
  );
}

function CertificationsPanel({ model }: { model: PdpEducationModel }) {
  return (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
      {model.certifications.map((c) => (
        <li key={`${c.label}-${c.value}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">{c.label}</p>
          <p className="mt-1 text-base font-extrabold text-white">{c.value}</p>
          {c.explanation ? <p className="mt-2 text-xs leading-relaxed text-white/55">{c.explanation}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function SpecGridPanel({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return <EmptyTab />;
  return (
    <div>
      <p className="mb-3 text-xs text-white/45">{title}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <dt className="text-[10px] text-white/45">{r.label}</dt>
            <dd className="text-sm font-semibold text-white/88">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CutPanel({ model, specRows }: { model: PdpEducationModel; specRows: PdpLabeledValue[] }) {
  const cut = specRows.find((r) => r.attribute_key === "cut_level_ansi");
  return (
    <div className="max-w-2xl space-y-4">
      {cut ? (
        <div className="rounded-xl border border-[var(--color-accent-orange)]/30 bg-[var(--color-accent-orange)]/[0.08] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-accent-orange)]">Published cut level</p>
          <p className="mt-1 text-2xl font-black text-white">{cut.value}</p>
        </div>
      ) : null}
      <p className="text-sm leading-relaxed text-white/65">
        ANSI/ISEA cut levels describe resistance to sharp materials in standardized test classes. Match the published level
        to your cut hazard assessment—this page does not replace a formal risk analysis.
      </p>
      <PerformancePanel model={{ ...model, performance: model.performance.filter((p) => p.key === "cut" || p.key === "abrasion") }} />
    </div>
  );
}

function ChemicalPanel({ model, specRows }: { model: PdpEducationModel; specRows: PdpLabeledValue[] }) {
  const tags = model.protectionTags.length > 0 ? model.protectionTags : specRows.filter((r) => r.attribute_key === "protection_tags").map((r) => r.value);
  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm leading-relaxed text-white/65">
        Chemical compatibility must be verified per solvent class on the SDS and published SKU documentation. This
        interface does not display breakthrough times unless they appear in structured product attributes.
      </p>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t} className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/80">
              {t}
            </li>
          ))}
        </ul>
      ) : null}
      <PerformancePanel model={{ ...model, performance: model.performance.filter((p) => p.key === "chemical" || p.key === "barrier") }} />
    </div>
  );
}

function GripPanel({ model, specRows }: { model: PdpEducationModel; specRows: PdpLabeledValue[] }) {
  const texture = specRows.find((r) => r.attribute_key === "texture");
  const coating = specRows.find((r) => r.attribute_key === "coating");
  return (
    <div className="space-y-4">
      <SpecGridPanel title="Grip-related attributes" rows={[texture, coating].filter(Boolean).map((r) => ({ label: r!.label, value: r!.value }))} />
      <p className="text-sm text-white/60">Textured and coated palms generally improve wet/oil handling; smooth surfaces favor dexterity in dry tasks.</p>
      <PerformancePanel model={{ ...model, performance: model.performance.filter((p) => p.key === "grip") }} />
    </div>
  );
}

function FoodPanel({ model, specRows }: { model: PdpEducationModel; specRows: PdpLabeledValue[] }) {
  const grade = specRows.find((r) => r.attribute_key === "grade");
  const powder = specRows.find((r) => r.attribute_key === "powder");
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/65">Food programs require published food-contact claims on the exact SKU—confirm HACCP alignment with your QA team.</p>
      <SpecGridPanel title="Food-related attributes" rows={[grade, powder].filter(Boolean).map((r) => ({ label: r!.label, value: r!.value }))} />
      {model.certifications.filter((c) => /food|fda/i.test(`${c.label} ${c.value}`)).length > 0 ? (
        <CertificationsPanel model={{ ...model, certifications: model.certifications.filter((c) => /food|fda/i.test(`${c.label} ${c.value}`)) }} />
      ) : null}
    </div>
  );
}

function UseEnvironmentsPanel({ model }: { model: PdpEducationModel }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {model.uses.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/45">Uses</p>
          <ul className="list-none space-y-1.5 p-0">
            {model.uses.map((u) => (
              <li key={u} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80">
                {u}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {model.industries.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/45">Industries</p>
          <ul className="list-none space-y-1.5 p-0">
            {model.industries.map((i) => (
              <li key={i} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80">
                {i}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StandardsPanel({ model, specRows }: { model: PdpEducationModel; specRows: PdpLabeledValue[] }) {
  const standardKeys = new Set(["grade", "sterility", "abrasion_level", "puncture_level", "flame_resistant", "arc_rating"]);
  const rows = specRows.filter((r) => standardKeys.has(r.attribute_key)).map((r) => ({ label: r.label, value: r.value }));
  return (
    <div className="space-y-6">
      {rows.length > 0 ? <SpecGridPanel title="Published standard attributes" rows={rows} /> : null}
      {model.certifications.length > 0 ? <CertificationsPanel model={model} /> : <EmptyTab message="No additional standards published on this SKU." />}
    </div>
  );
}

function StoragePanel({ specRows }: { specRows: PdpLabeledValue[] }) {
  const keys = new Set(["sterility", "packaging", "box_qty"]);
  const rows = specRows.filter((r) => keys.has(r.attribute_key)).map((r) => ({ label: r.label, value: r.value }));
  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-white/60">Store per manufacturer guidance on the spec sheet or SDS. Shelf life is not inferred unless published on the listing.</p>
      <SpecGridPanel title="Packaging & handling" rows={rows} />
    </div>
  );
}

function EmptyTab({ message = "No structured data published for this topic on this SKU." }: { message?: string }) {
  return <p className="text-sm text-white/45">{message}</p>;
}

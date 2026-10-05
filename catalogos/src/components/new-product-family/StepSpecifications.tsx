"use client";

import {
  CUFF_STYLE_VALUES,
  STERILITY_VALUES,
  TEXTURE_VALUES,
  THICKNESS_MIL_VALUES,
} from "@/lib/catalogos/attribute-dictionary-types";
import { Input } from "@/components/ui/input";
import {
  FOOD_CERT_TOGGLES,
  MEDICAL_AQL_VALUES,
  MEDICAL_CERT_TOGGLES,
  PRIMARY_TEXTURES,
  PRIMARY_THICKNESS_MILS,
} from "@/lib/new-product-family/types";
import { suggestFamilyTitle } from "@/lib/new-product-family/title";
import type { NewProductFamilyDraft } from "@/lib/new-product-family/types";
import { ChipButton, ChipGroup } from "./ChipGroup";
import { useState } from "react";

const TEXTURE_LABEL: Record<string, string> = {
  smooth: "Smooth",
  fingertip_textured: "Fingertip textured",
  fully_textured: "Fully textured",
  micro_textured: "Micro-textured",
  diamond_texture: "Diamond",
  fish_scale: "Fish scale",
  sandy_grip: "Sandy grip",
  foam_grip: "Foam grip",
  crinkle_grip: "Crinkle grip",
  raised_diamond: "Raised diamond",
  embossed: "Embossed",
  grip_dots: "Grip dots",
};

const AQL_LABEL: Record<string, string> = {
  aql_1_5: "AQL 1.5",
  aql_2_5: "AQL 2.5",
  aql_4_0: "AQL 4.0",
};

const CERT_LABEL: Record<string, string> = {
  astm_d6319: "ASTM D6319",
  fda_510k: "FDA 510(k)",
  fda_food_contact: "FDA food contact",
  food_safe: "Food safe",
};

const STERILITY_LABEL: Record<string, string> = {
  non_sterile: "Non-sterile",
  sterile: "Sterile",
};

const CUFF_LABEL: Record<string, string> = {
  beaded_cuff: "Beaded",
  non_beaded: "Non-beaded",
  extended_cuff: "Extended",
};

export function StepSpecifications({
  draft,
  onChange,
  disabled,
}: {
  draft: NewProductFamilyDraft;
  onChange: (patch: Partial<NewProductFamilyDraft>) => void;
  disabled?: boolean;
}) {
  const [moreThickness, setMoreThickness] = useState(
    Boolean(draft.thicknessMil && !(PRIMARY_THICKNESS_MILS as readonly string[]).includes(draft.thicknessMil))
  );
  const [moreTexture, setMoreTexture] = useState(
    Boolean(draft.texture && !(PRIMARY_TEXTURES as readonly string[]).includes(draft.texture))
  );
  const medical = draft.grade === "medical_exam_grade" || draft.grade === "surgical_grade";
  const food = draft.grade === "food_service_grade";

  function patchStructured(next: Partial<NewProductFamilyDraft>) {
    const merged = { ...draft, ...next };
    if (merged.titleTouched) {
      onChange(next);
      return;
    }
    onChange({
      ...next,
      title: suggestFamilyTitle({
        brand: merged.brand,
        color: merged.color,
        material: merged.material,
        grade: merged.grade,
        powder: merged.powder,
        thicknessMil: merged.thicknessMil,
      }),
    });
  }

  function toggleCert(slug: string) {
    const has = draft.certifications.includes(slug);
    const certifications = has
      ? draft.certifications.filter((c) => c !== slug)
      : [...draft.certifications, slug];
    onChange({ certifications });
  }

  const thicknessOptions = moreThickness ? THICKNESS_MIL_VALUES : PRIMARY_THICKNESS_MILS;
  const textureOptions = moreTexture ? TEXTURE_VALUES : PRIMARY_TEXTURES;

  return (
    <div className="space-y-4">
      <ChipGroup label="Powder">
        <ChipButton
          selected={draft.powder === "powder_free"}
          disabled={disabled}
          onClick={() => patchStructured({ powder: "powder_free" })}
        >
          Powder-free
        </ChipButton>
        <ChipButton
          selected={draft.powder === "powdered"}
          disabled={disabled}
          onClick={() => patchStructured({ powder: "powdered" })}
        >
          Powdered
        </ChipButton>
      </ChipGroup>
      <div className="space-y-1.5">
        <ChipGroup label="Thickness">
          {thicknessOptions.map((mil) => (
            <ChipButton
              key={mil}
              selected={draft.thicknessMil === mil}
              disabled={disabled}
              onClick={() => patchStructured({ thicknessMil: mil })}
            >
              {mil} mil
            </ChipButton>
          ))}
          <ChipButton selected={moreThickness} disabled={disabled} onClick={() => setMoreThickness((v) => !v)}>
            {moreThickness ? "Fewer" : "More"}
          </ChipButton>
        </ChipGroup>
      </div>
      <div className="space-y-1.5">
        <ChipGroup label="Texture (optional)">
          {textureOptions.map((slug) => (
            <ChipButton
              key={slug}
              selected={draft.texture === slug}
              disabled={disabled}
              onClick={() => onChange({ texture: draft.texture === slug ? "" : slug })}
            >
              {TEXTURE_LABEL[slug] ?? slug}
            </ChipButton>
          ))}
          <ChipButton selected={moreTexture} disabled={disabled} onClick={() => setMoreTexture((v) => !v)}>
            {moreTexture ? "Fewer" : "More"}
          </ChipButton>
        </ChipGroup>
      </div>
      {medical ? (
        <div className="space-y-3 rounded-md border border-border/70 p-3">
          <p className="text-xs font-medium">Medical attributes (optional — only check claims you can support)</p>
          <ChipGroup label="AQL">
            {MEDICAL_AQL_VALUES.map((slug) => (
              <ChipButton
                key={slug}
                selected={draft.aql === slug}
                disabled={disabled}
                onClick={() => onChange({ aql: draft.aql === slug ? "" : slug })}
              >
                {AQL_LABEL[slug]}
              </ChipButton>
            ))}
          </ChipGroup>
          <ChipGroup label="Sterility">
            {STERILITY_VALUES.map((slug) => (
              <ChipButton
                key={slug}
                selected={draft.sterility === slug}
                disabled={disabled}
                onClick={() => onChange({ sterility: draft.sterility === slug ? "" : slug })}
              >
                {STERILITY_LABEL[slug]}
              </ChipButton>
            ))}
          </ChipGroup>
          <ChipGroup label="Certifications">
            {MEDICAL_CERT_TOGGLES.map((slug) => (
              <ChipButton
                key={slug}
                selected={draft.certifications.includes(slug)}
                disabled={disabled}
                onClick={() => toggleCert(slug)}
              >
                {CERT_LABEL[slug]}
              </ChipButton>
            ))}
          </ChipGroup>
        </div>
      ) : null}
      <ChipGroup label="Cuff (optional)">
        {CUFF_STYLE_VALUES.map((slug) => (
          <ChipButton
            key={slug}
            selected={draft.cuffStyle === slug}
            disabled={disabled}
            onClick={() => onChange({ cuffStyle: draft.cuffStyle === slug ? "" : slug })}
          >
            {CUFF_LABEL[slug] ?? slug}
          </ChipButton>
        ))}
      </ChipGroup>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Tensile (optional)</span>
          <Input
            className="h-8 text-sm"
            disabled={disabled}
            value={draft.tensile}
            onChange={(e) => onChange({ tensile: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Elongation (optional)</span>
          <Input
            className="h-8 text-sm"
            disabled={disabled}
            value={draft.elongation}
            onChange={(e) => onChange({ elongation: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Puncture (optional)</span>
          <Input
            className="h-8 text-sm"
            disabled={disabled}
            value={draft.punctureNote}
            onChange={(e) => onChange({ punctureNote: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Chemical resistance (optional)</span>
          <Input
            className="h-8 text-sm"
            disabled={disabled}
            value={draft.chemicalResistance}
            onChange={(e) => onChange({ chemicalResistance: e.target.value })}
          />
        </label>
      </div>
      {food ? (
        <div className="space-y-3 rounded-md border border-border/70 p-3">
          <p className="text-xs font-medium">Food-contact attributes (optional — only check claims you can support)</p>
          <ChipGroup label="Food contact">
            {FOOD_CERT_TOGGLES.map((slug) => (
              <ChipButton
                key={slug}
                selected={draft.certifications.includes(slug)}
                disabled={disabled}
                onClick={() => toggleCert(slug)}
              >
                {CERT_LABEL[slug]}
              </ChipButton>
            ))}
          </ChipGroup>
        </div>
      ) : null}
    </div>
  );
}

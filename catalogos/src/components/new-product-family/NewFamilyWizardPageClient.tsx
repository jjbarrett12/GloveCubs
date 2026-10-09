"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WizardShell } from "./WizardShell";
import { StepIdentity } from "./StepIdentity";
import { StepSpecifications } from "./StepSpecifications";
import { StepSizeFamily } from "./StepSizeFamily";
import { StepPackaging } from "./StepPackaging";
import { StepSupplierCost } from "./StepSupplierCost";
import { StepPricing } from "./StepPricing";
import { StepReview } from "./StepReview";
import { createEmptyFamilyDraft } from "@/lib/new-product-family/draft";
import {
  canVisitStep,
  completedPhase1StepCount,
  evaluateWizardStep,
  nextBlockReason,
} from "@/lib/new-product-family/gates";
import type { NewProductFamilyDraft, WizardStepId } from "@/lib/new-product-family/types";
import {
  loadNewProductFamilyDraft,
  saveNewProductFamilyDraft,
  listExistingGloveCubsSkus,
  promoteNewProductFamilyDraft,
} from "@/app/actions/new-product-family";

function formatSavedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function NewFamilyInner({
  brands,
  suppliers,
}: {
  brands: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const batchId = sp.get("batch");
  const [draft, setDraft] = useState<NewProductFamilyDraft>(createEmptyFamilyDraft);
  const [step, setStep] = useState<WizardStepId>(1);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [promoteMessage, setPromoteMessage] = useState<string | null>(null);
  const [parentSkus, setParentSkus] = useState<string[]>([]);
  const [variantSkus, setVariantSkus] = useState<string[]>([]);
  const persistTimer = useRef<number | null>(null);
  const promoteLock = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const batchRef = useRef(batchId);
  batchRef.current = batchId;

  const collisions = useMemo(
    () => ({
      existingParentSkus: new Set(parentSkus),
      existingVariantSkus: new Set(variantSkus),
    }),
    [parentSkus, variantSkus]
  );

  const gate = evaluateWizardStep(draft, step, collisions);
  const completedCount = completedPhase1StepCount(draft, collisions);
  const nextReason = nextBlockReason(draft, step, collisions);
  const nextDisabled = step >= 7 || !gate.canAdvance;

  useEffect(() => {
    let cancelled = false;
    listExistingGloveCubsSkus(batchId)
      .then((r) => {
        if (cancelled) return;
        if (!r.success) {
          setParentSkus([]);
          setVariantSkus([]);
          return;
        }
        setParentSkus(r.parentSkus);
        setVariantSkus(r.variantSkus);
      })
      .catch(() => {
        if (!cancelled) {
          setParentSkus([]);
          setVariantSkus([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    setBusy(true);
    loadNewProductFamilyDraft(batchId).then((r) => {
      if (cancelled) return;
      setBusy(false);
      if (!r.success) {
        setLoadErr(r.error);
        return;
      }
      setDraft(r.draft);
      setLoadErr(null);
    });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const persist = useCallback(
    async (nextDraft: NewProductFamilyDraft) => {
      const r = await saveNewProductFamilyDraft({ draft: nextDraft, batchId: batchRef.current });
      if (!r.success) return r;
      setSavedAt(new Date().toISOString());
      if (r.batchId !== batchRef.current) {
        router.replace(`/dashboard/products/new-family?batch=${encodeURIComponent(r.batchId)}`);
      }
      return r;
    },
    [router]
  );

  function queueAutosave(next: NewProductFamilyDraft) {
    if (!batchRef.current) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void persist(next);
    }, 1600);
  }

  function patchDraft(patch: Partial<NewProductFamilyDraft>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      queueAutosave(next);
      return next;
    });
  }

  function replaceDraft(next: NewProductFamilyDraft) {
    setDraft(next);
    queueAutosave(next);
  }

  async function handleSave() {
    setBusy(true);
    const r = await persist(draftRef.current);
    setBusy(false);
    if (!r.success) setLoadErr(r.error);
  }

  async function handleNext() {
    if (nextDisabled) return;
    const nextStep = (step + 1) as WizardStepId;
    if (!canVisitStep(draft, nextStep, collisions)) return;
    setBusy(true);
    const r = await persist(draftRef.current);
    setBusy(false);
    if (!r.success) {
      setLoadErr(r.error);
      return;
    }
    setStep(nextStep);
  }

  function handleBack() {
    if (step <= 1) return;
    setStep((step - 1) as WizardStepId);
  }

  async function handlePromote() {
    if (promoteLock.current) return;
    if (!evaluateWizardStep(draftRef.current, 7, collisions).complete) {
      setLoadErr(evaluateWizardStep(draftRef.current, 7, collisions).blockReason);
      return;
    }
    promoteLock.current = true;
    setBusy(true);
    setPromoteMessage(null);
    try {
      const saved = await persist(draftRef.current);
      if (!saved.success) {
        setLoadErr(saved.error);
        return;
      }
      const promoted = await promoteNewProductFamilyDraft(saved.batchId);
      if (!promoted.success) {
        setLoadErr(promoted.error);
        return;
      }
      setLoadErr(null);
      setPromoteMessage(
        promoted.alreadyExisted
          ? `This family is already in review. Master ${promoted.masterProductId}.`
          : `Sent to review. Master ${promoted.masterProductId}. Publish from the review queue.`
      );
    } finally {
      promoteLock.current = false;
      setBusy(false);
    }
  }

  function handleSelectStep(target: WizardStepId) {
    if (target > step && !canVisitStep(draft, target, collisions)) {
      const reason =
        evaluateWizardStep(draft, step, collisions).blockReason ??
        nextBlockReason(draft, step, collisions) ??
        "Complete the current step before continuing.";
      setLoadErr(reason);
      return;
    }
    setLoadErr(null);
    setStep(target);
  }

  return (
    <WizardShell
      draft={draft}
      currentStep={step}
      completedCount={completedCount}
      completeSteps={[1, 2, 3, 4].filter((id) => evaluateWizardStep(draft, id as WizardStepId, collisions).complete)}
      savedAt={formatSavedAt(savedAt)}
      nextDisabled={nextDisabled}
      nextReason={nextReason}
      busy={busy}
      onBack={handleBack}
      onNext={() => void handleNext()}
      onSave={() => void handleSave()}
      onSelectStep={handleSelectStep}
    >
      {loadErr ? <p className="mb-3 text-xs text-red-600">{loadErr}</p> : null}
      {step === 1 ? (
        <StepIdentity draft={draft} brands={brands} disabled={busy} onChange={patchDraft} />
      ) : null}
      {step === 2 ? <StepSpecifications draft={draft} disabled={busy} onChange={patchDraft} /> : null}
      {step === 3 ? <StepSizeFamily draft={draft} collisions={collisions} disabled={busy} onChange={replaceDraft} /> : null}
      {step === 4 ? <StepPackaging draft={draft} disabled={busy} onChange={replaceDraft} /> : null}
      {step === 5 ? (
        <StepSupplierCost draft={draft} suppliers={suppliers} disabled={busy} onChange={patchDraft} />
      ) : null}
      {step === 6 ? <StepPricing draft={draft} /> : null}
      {step === 7 ? (
        <StepReview
          draft={draft}
          disabled={busy}
          canPromote={gate.complete}
          promoteMessage={promoteMessage}
          onChange={patchDraft}
          onPromote={() => void handlePromote()}
        />
      ) : null}
    </WizardShell>
  );
}

export function NewFamilyWizardPageClient({
  brands,
  suppliers,
}: {
  brands: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading wizard…</p>}>
      <NewFamilyInner brands={brands} suppliers={suppliers} />
    </Suspense>
  );
}

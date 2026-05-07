"use client";

import * as React from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  Loader2,
  Camera,
  X,
  ShieldCheck,
  MessageCircle,
  Tag,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { InvoiceIntakeContract } from "@/lib/invoice/intake-types";
import { buildRequestPricingHref } from "@/lib/discovery/request-pricing-url";
import {
  aggregateReviewStatusLabel,
  aggregateReviewSummary,
  errorMessageFromIntakeFailure,
  extractionFailureHint,
  extractionStateCustomerLabel,
  intakeStatusHeadline,
  nextStepHonestyBlurb,
} from "@/lib/invoice/intake-display-messages";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.pdf";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function fileValidationMessage(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return "That file is over 10 MB. Try a smaller PDF or a photo cropped to the invoice page.";
  }
  const type = (file.type || "").toLowerCase();
  if (type && !ALLOWED_MIME.has(type)) {
    return "Unsupported file type. Use PDF, JPEG, PNG, or WebP.";
  }
  if (!type) {
    const lower = file.name.toLowerCase();
    const okExt = lower.endsWith(".pdf") || /\.(jpe?g|png|webp)$/.test(lower);
    if (!okExt) return "Unsupported file type. Use PDF, JPEG, PNG, or WebP.";
  }
  return null;
}

function formatLineAmount(line: NonNullable<InvoiceIntakeContract["lines"]>[number]): string {
  if (line.total != null && Number.isFinite(line.total)) return line.total.toFixed(2);
  if (line.unit_price != null && Number.isFinite(line.unit_price)) {
    const q = line.quantity ?? 0;
    return (line.unit_price * q).toFixed(2);
  }
  return "—";
}

export default function InvoiceSavingsPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const [uiPhase, setUiPhase] = React.useState<"form" | "submitting" | "result">("form");
  const [contract, setContract] = React.useState<InvoiceIntakeContract | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const dropRef = React.useRef<HTMLDivElement>(null);

  async function handleSubmit() {
    if (!file) return;
    setSubmitError(null);
    setUiPhase("submitting");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/invoice/intake", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setSubmitError(errorMessageFromIntakeFailure(res.status, data));
        setUiPhase("form");
        return;
      }
      setContract(data as unknown as InvoiceIntakeContract);
      setUiPhase("result");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Network error—check your connection and try again.");
      setUiPhase("form");
    }
  }

  function resetForm() {
    setFile(null);
    setContract(null);
    setSubmitError(null);
    setUiPhase("form");
    setCameraOpen(false);
  }

  function onFileChosen(f: File | null) {
    setSubmitError(null);
    if (!f) {
      setFile(null);
      setCameraOpen(false);
      return;
    }
    const invalid = fileValidationMessage(f);
    if (invalid) {
      setSubmitError(invalid);
      setFile(null);
      setCameraOpen(false);
      return;
    }
    setFile(f);
    setCameraOpen(false);
  }

  React.useEffect(() => {
    if (!cameraOpen) return;
    setCameraError(null);
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        streamRef.current = s;
        if (video) {
          video.srcObject = s;
          video.play().catch(() => {});
        }
      })
      .catch((e) => {
        setCameraError(e instanceof Error ? e.message : "Camera access denied");
      });
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [cameraOpen]);

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const f = new File([blob], "invoice-photo.jpg", { type: "image/jpeg" });
        onFileChosen(f);
        setCameraOpen(false);
      },
      "image/jpeg",
      0.92
    );
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    if (e.currentTarget === dropRef.current) setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    onFileChosen(f);
  }

  const quoteHref =
    contract != null
      ? buildRequestPricingHref({
          procurement_opportunity_id: contract.procurement_opportunity_id,
          client_trace: contract.intake_id,
          source: "invoice_intake",
        })
      : "/request-pricing";

  const workspaceHref =
    contract != null ? `/workspace/procurement/opportunities/${contract.procurement_opportunity_id}` : "/workspace/procurement";

  const aggregateReviewNote =
    uiPhase === "result" && contract ? aggregateReviewSummary(contract.aggregate_review_status) : null;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold text-white hover:text-white/90">
            GloveCubs
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-4 text-sm">
            <Link href="/" className="text-white/70 hover:text-white">
              Home
            </Link>
            <Link href="/contact" className="text-white/70 hover:text-white">
              Contact
            </Link>
            <Link href="/glove-finder" className="text-white/50 hover:text-white/80">
              Glove finder
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-3 text-2xl font-semibold text-white">Upload your invoice</h1>
        <ol className="mb-6 max-w-2xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-white/80">
          <li>We extract what you buy.</li>
          <li>We match it against governed glove options.</li>
          <li>You request a quote or review with a specialist as the next step.</li>
        </ol>
        <ul className="mb-8 space-y-2 rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-sm leading-relaxed text-white/70">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5500]" aria-hidden />
            <span>We compare on a normalized unit basis.</span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5500]" aria-hidden />
            <span>We only show approved alternates when they meet sourcing rules.</span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5500]" aria-hidden />
            <span>A person can review the results with you.</span>
          </li>
        </ul>

        {uiPhase === "form" && (
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <h2 className="flex items-center gap-2 text-lg font-medium text-white">
                <Upload className="h-5 w-5 shrink-0" aria-hidden />
                Invoice file
              </h2>
              <p className="text-sm text-white/60">
                Supported formats: PDF, JPEG, PNG, or WebP. Maximum file size 10 MB. A clear photo or text-based PDF
                produces the most reliable line items.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div
                ref={dropRef}
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  isDragging ? "border-[#FF5500] bg-[#FF5500]/10" : "border-white/20 bg-black/20"
                }`}
              >
                <p className="mb-3 text-sm font-medium text-white">Drag and drop your invoice here</p>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                  <FileText className="h-4 w-4" aria-hidden />
                  Choose file
                  <input
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    aria-label="Choose invoice file (PDF, JPEG, PNG, or WebP, up to 10 MB)"
                    onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="outline" className="shrink-0" onClick={() => setCameraOpen((o) => !o)}>
                  <Camera className="mr-2 h-4 w-4" aria-hidden />
                  {cameraOpen ? "Close camera" : "Take photo (mobile)"}
                </Button>
              </div>

              {file && (
                <p className="text-sm text-white/70">
                  Selected: <span className="font-medium text-white">{file.name}</span>
                  <span className="text-white/50"> · {(file.size / 1024).toFixed(1)} KB</span>
                </p>
              )}

              {cameraOpen && (
                <div className="space-y-3 rounded-lg border border-white/10 bg-black/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Camera</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCameraOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {cameraError ? (
                    <p className="text-sm text-red-400" role="alert">
                      {cameraError}
                    </p>
                  ) : (
                    <>
                      <video ref={videoRef} playsInline muted className="max-h-64 w-full rounded bg-black object-cover" />
                      <Button type="button" onClick={handleCapture} className="w-full">
                        Capture photo
                      </Button>
                    </>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm leading-relaxed text-white/65">
                <div className="mb-1 flex items-center gap-2 font-medium text-white/90">
                  <ShieldCheck className="h-4 w-4 text-[#FF5500]" aria-hidden />
                  Privacy
                </div>
                We use your file to extract glove line items and run our internal matching workflow. If you prefer not to
                upload here, email your rep or use the contact page and we will handle it manually.
              </div>

              {submitError && (
                <p className="text-sm text-red-400" role="alert">
                  {submitError}
                </p>
              )}

              <Button
                disabled={!file}
                onClick={handleSubmit}
                className="w-full min-h-12 bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                Upload invoice
              </Button>
            </CardContent>
          </Card>
        )}

        {uiPhase === "submitting" && (
          <div className="flex flex-col gap-2 py-10 text-white/85" role="status" aria-live="polite">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 shrink-0 animate-spin" aria-hidden />
              <span className="font-medium">Upload received — extracting line items…</span>
            </div>
            <p className="max-w-lg pl-9 text-sm text-white/60">
              We read the file, extract what you buy, then run matching for review. This can take up to a minute; keep
              this page open.
            </p>
          </div>
        )}

        {uiPhase === "result" && contract && (
          <div className="space-y-6" role="region" aria-label="Invoice intake result">
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <h2 className="text-lg font-medium text-white">{intakeStatusHeadline(contract.intake_status)}</h2>
                <p className="text-sm text-white/65">
                  Intake reference{" "}
                  <span className="font-mono text-xs text-white/80 sm:text-sm">{contract.intake_id}</span>
                  {contract.idempotent_replay ? (
                    <span className="ml-2 text-white/45">· same file as an earlier upload (existing intake)</span>
                  ) : null}
                </p>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-white/80">
                {(contract.intake_status === "extracted_failed" || contract.extraction.state === "failed") && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100/95">
                    {extractionFailureHint(contract)}
                  </p>
                )}

                {contract.intake_status === "intake_failed" && (
                  <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-100/95" role="alert">
                    {contract.extraction.error?.trim() ||
                      "The upload could not be finished on our side. Try again with a smaller PDF or a clearer photo, or email the file to us and include the intake reference above."}
                  </p>
                )}

                {contract.phase2_error?.trim() && (
                  <p className="rounded-lg border border-amber-500/35 bg-amber-500/5 px-3 py-2 text-amber-50/95">
                    Matching step note: {contract.phase2_error}. Your lines may still be usable—request a quote and we
                    will reconcile on our side.
                  </p>
                )}

                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-xs sm:text-sm">
                  <p className="mb-2 font-medium text-white/90">Status (from your upload)</p>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-white/45">Extraction</dt>
                      <dd className="text-white/90">{extractionStateCustomerLabel(contract.extraction.state)}</dd>
                    </div>
                    <div>
                      <dt className="text-white/45">Review / matching</dt>
                      <dd className="text-white/90">{aggregateReviewStatusLabel(contract.aggregate_review_status)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <p>
                    <span className="text-white/50">File</span>{" "}
                    <span className="font-medium text-white">{contract.document.filename}</span>
                  </p>
                  {contract.vendor_name ? (
                    <p>
                      <span className="text-white/50">Vendor</span>{" "}
                      <span className="font-medium text-white">{contract.vendor_name}</span>
                    </p>
                  ) : null}
                  {contract.invoice_number ? (
                    <p>
                      <span className="text-white/50">Invoice #</span>{" "}
                      <span className="font-medium text-white">{contract.invoice_number}</span>
                    </p>
                  ) : null}
                  {contract.total_amount != null && Number.isFinite(contract.total_amount) ? (
                    <p>
                      <span className="text-white/50">Invoice total</span>{" "}
                      <span className="font-medium text-white">${contract.total_amount.toFixed(2)}</span>
                    </p>
                  ) : null}
                  <p>
                    <span className="text-white/50">Line items in this response</span>{" "}
                    <span className="font-medium text-white">{contract.lines?.length ?? 0}</span>
                  </p>
                  <p>
                    <span className="text-white/50">Lines saved for review</span>{" "}
                    <span className="font-medium text-white">
                      {contract.persisted_line_count != null ? contract.persisted_line_count : "—"}
                    </span>
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/15 px-3 py-3 text-white/75">
                  <p className="mb-1 font-medium text-white/90">Review / matching</p>
                  <p className="text-sm leading-relaxed">
                    Extracted lines are checked against governed catalog options. Persisted line count is what we stored
                    for the procurement record tied to this intake.
                  </p>
                </div>

                {aggregateReviewNote ? <p className="leading-relaxed text-white/75">{aggregateReviewNote}</p> : null}

                <p className="leading-relaxed text-white/70">{nextStepHonestyBlurb(contract)}</p>
              </CardContent>
            </Card>

            {contract.lines && contract.lines.length > 0 && contract.intake_status === "extracted_ok" && (
              <Card className="border-white/10 bg-white/5">
                <CardHeader>
                  <h2 className="flex items-center gap-2 text-lg font-medium text-white">
                    <FileText className="h-5 w-5 shrink-0" aria-hidden />
                    Extracted line items ({contract.lines.length})
                  </h2>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {contract.lines.map((line, i) => (
                      <li
                        key={i}
                        className="flex flex-col gap-1 rounded-md border border-white/10 px-3 py-2 text-white/80 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0 flex-1">{line.description}</span>
                        <span className="shrink-0 text-white/60">
                          qty {line.quantity} · ${formatLineAmount(line)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Link href={quoteHref}>
                  <Tag className="mr-2 h-4 w-4" aria-hidden />
                  Request quote with this invoice
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/contact">
                  <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
                  Talk to a glove specialist
                </Link>
              </Button>
              {contract.identity.authenticated ? (
                <Button variant="secondary" asChild>
                  <Link href={workspaceHref}>
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                    Open in workspace
                  </Link>
                </Button>
              ) : (
                <p className="w-full text-sm text-white/55 sm:pl-1">
                  Signed-in customers can track this opportunity in the procurement workspace after account access is enabled.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={resetForm}>
                New upload
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/">Home</Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

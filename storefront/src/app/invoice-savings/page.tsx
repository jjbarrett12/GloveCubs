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
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { InvoiceIntakeContract } from "@/lib/invoice/intake-types";
import { SITE_SALES_EMAIL } from "@/config/siteContact";
import { persistInvoiceIntakeRfqHandoff } from "@/lib/discovery/invoice-intake-rfq-handoff";
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

/** First N extracted lines shown in the reveal preview. */
const LINE_PREVIEW_CAP = 5;

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

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

/** Per-line review label from aggregate status only (no per-line governance). */
function linePreviewRowStatusLabel(aggregate: string | null | undefined): string {
  if (aggregate == null || aggregate === "") return "Review pending";
  switch (aggregate) {
    case "cleared":
      return "Initial review complete";
    case "pending_review":
    case "assessment_pending":
    case "review_required":
      return "Review pending";
    case "ambiguous":
      return "Needs clarification";
    case "no_match":
      return "No catalog match yet";
    default:
      return "Review pending";
  }
}

function buildSpecialistInvoiceMailtoHref(c: InvoiceIntakeContract): string {
  const lines = [
    "Invoice specialist follow-up",
    `source=invoice_intake`,
    `intake_id=${c.intake_id}`,
    `procurement_opportunity_id=${c.procurement_opportunity_id}`,
  ];
  if (c.vendor_name?.trim()) lines.push(`vendor=${c.vendor_name.trim()}`);
  if (c.invoice_number?.trim()) lines.push(`invoice#=${c.invoice_number.trim()}`);
  lines.push("", "Please reply to discuss next steps and governed review.");
  const subject = encodeURIComponent("Invoice follow-up");
  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${SITE_SALES_EMAIL}?subject=${subject}&body=${body}`;
}

type InvoiceIntakeRevealProps = {
  contract: InvoiceIntakeContract;
  quoteHref: string;
  workspaceHref: string;
  specialistMailtoHref: string;
  onReset: () => void;
};

function InvoiceIntakeReveal({
  contract,
  quoteHref,
  workspaceHref,
  specialistMailtoHref,
  onReset,
}: InvoiceIntakeRevealProps) {
  const lines = contract.lines ?? [];
  const lineCount = lines.length;
  const previewLines = contract.intake_status === "extracted_ok" ? lines.slice(0, LINE_PREVIEW_CAP) : [];
  const extraLineCount =
    contract.intake_status === "extracted_ok" && lineCount > LINE_PREVIEW_CAP ? lineCount - LINE_PREVIEW_CAP : 0;
  const rowStatus = linePreviewRowStatusLabel(contract.aggregate_review_status);
  const extractionOk = contract.intake_status === "extracted_ok" && contract.extraction.state === "ok";
  const aggregateReviewNote = aggregateReviewSummary(contract.aggregate_review_status);

  const revealLead =
    contract.intake_status === "intake_failed"
      ? "We could not finish this upload. You can retry with a clearer file, or reach our team with the references below."
      : extractionOk && lineCount > 0
        ? "We extracted your invoice line items. Here is the next trusted step."
        : extractionOk && lineCount === 0
          ? "Your invoice was received, but we did not capture line-item text in this pass. Our team can still work from your file using the references below."
          : "We received your file; line-item extraction did not complete on this pass. Try a clearer PDF or photo, or move forward with a specialist using the references below.";

  const showQuoteCta = contract.intake_status !== "intake_failed";

  return (
    <div className="space-y-6" role="region" aria-label="Invoice intake result">
      <Card className="border-white/10 bg-white/5">
        <CardHeader className="space-y-2">
          <h2 className="text-xl font-semibold text-white">{intakeStatusHeadline(contract.intake_status)}</h2>
          <p className="text-sm leading-relaxed text-white/75">{revealLead}</p>
          <p className="text-sm text-white/55">
            Intake reference{" "}
            <span className="font-mono text-xs text-white/80 sm:text-sm">{contract.intake_id}</span>
            {contract.idempotent_replay ? (
              <span className="ml-2 text-white/45">· same file as an earlier upload (existing intake)</span>
            ) : null}
          </p>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-white/80">
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
              Matching step note: {contract.phase2_error}. Your lines may still be usable—request a quote and we will
              reconcile on our side.
            </p>
          )}

          <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-white/45">Invoice / vendor summary</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-white/45">File</dt>
                <dd className="font-medium text-white">{contract.document.filename}</dd>
              </div>
              {contract.vendor_name ? (
                <div>
                  <dt className="text-white/45">Vendor</dt>
                  <dd className="font-medium text-white">{contract.vendor_name}</dd>
                </div>
              ) : null}
              {contract.invoice_number ? (
                <div>
                  <dt className="text-white/45">Invoice #</dt>
                  <dd className="font-medium text-white">{contract.invoice_number}</dd>
                </div>
              ) : null}
              {contract.total_amount != null && Number.isFinite(contract.total_amount) ? (
                <div>
                  <dt className="text-white/45">Invoice total</dt>
                  <dd className="font-medium text-white">${contract.total_amount.toFixed(2)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-white/45">Extracted lines (this response)</dt>
                <dd className="font-medium text-white">{lineCount}</dd>
              </div>
              <div>
                <dt className="text-white/45">Lines saved for review</dt>
                <dd className="font-medium text-white">
                  {contract.persisted_line_count != null ? contract.persisted_line_count : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-white/45">Extraction &amp; review status</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-white/45">Extraction</dt>
                <dd className="text-white/90">{extractionStateCustomerLabel(contract.extraction.state)}</dd>
              </div>
              <div>
                <dt className="text-white/45">Review / matching</dt>
                <dd className="text-white/90">{aggregateReviewStatusLabel(contract.aggregate_review_status)}</dd>
              </div>
            </dl>
            {aggregateReviewNote ? <p className="mt-3 border-t border-white/10 pt-3 leading-relaxed text-white/70">{aggregateReviewNote}</p> : null}
            <p className="mt-3 border-t border-white/10 pt-3 leading-relaxed text-white/65">{nextStepHonestyBlurb(contract)}</p>
          </div>
        </CardContent>
      </Card>

      {previewLines.length > 0 ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <h3 className="flex items-center gap-2 text-lg font-medium text-white">
              <FileText className="h-5 w-5 shrink-0" aria-hidden />
              Extracted line preview
            </h3>
            <p className="text-sm text-white/55">
              {extraLineCount > 0
                ? `Showing first ${previewLines.length} of ${lineCount} extracted lines. Amounts reflect what we read from your file.`
                : `Showing ${lineCount} extracted line${lineCount === 1 ? "" : "s"}. Amounts reflect what we read from your file.`}
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 font-medium">SKU / code</th>
                  <th className="py-2 pr-3 font-medium">Qty</th>
                  <th className="py-2 pr-3 font-medium">Unit price</th>
                  <th className="py-2 pr-3 font-medium">Line total</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {previewLines.map((line, i) => (
                  <tr key={i} className="border-b border-white/[0.06] align-top text-white/85 last:border-0">
                    <td className="max-w-[14rem] py-2.5 pr-3 text-white/90">{line.description}</td>
                    <td className="py-2.5 pr-3 text-white/60">{line.sku_or_code?.trim() || "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-white/80">{line.quantity}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-white/80">
                      {line.unit_price != null && Number.isFinite(line.unit_price) ? `$${formatMoney(line.unit_price)}` : "—"}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-white/80">
                      {line.total != null && Number.isFinite(line.total) ? `$${formatMoney(line.total)}` : "—"}
                    </td>
                    <td className="py-2.5 text-xs text-white/55">{rowStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {extraLineCount > 0 ? (
              <p className="mt-3 text-sm text-white/55" role="status">
                +{extraLineCount} more line{extraLineCount === 1 ? "" : "s"} extracted
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : extractionOk ? (
        <Card className="border-white/10 bg-white/5">
          <CardContent className="pt-6 text-sm leading-relaxed text-white/75">
            <p className="font-medium text-white/90">No line items in this response</p>
            <p className="mt-2">
              Extraction completed, but we did not get usable rows back. A specialist can review the source file and
              continue from your intake reference.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <h3 className="text-lg font-medium text-white">What happens next</h3>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-white/75">
          <ul className="list-disc space-y-2 pl-5">
            <li>We treat your upload as operational input: extracted lines are reviewed and matched for review against governed options.</li>
            <li>We compare candidates on a normalized unit basis so case packs and units stay apples-to-apples.</li>
            <li>Approved alternates appear only where sourcing rules allow—after review, not as instant swaps.</li>
            <li>A specialist can walk through unclear lines with you at any time.</li>
          </ul>
        </CardContent>
      </Card>

      <ul className="space-y-2 rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-sm leading-relaxed text-white/70">
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f06232]" aria-hidden />
          <span>Normalized unit comparison across pack sizes.</span>
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f06232]" aria-hidden />
          <span>Approved alternates only under sourcing rules.</span>
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f06232]" aria-hidden />
          <span>Human review available when you want a second set of eyes.</span>
        </li>
      </ul>

      <div className="space-y-4">
        {showQuoteCta ? (
          <div className="rounded-xl border border-primary/35 bg-primary/[0.12] p-4 sm:p-5">
            <p className="mb-3 text-sm font-medium text-white/90">Next trusted step</p>
            <p className="mb-4 max-w-xl text-sm leading-relaxed text-white/70">
              Request a quote based on your current invoice—your intake and opportunity references attach automatically.
              Add sites, volumes, and billing in the form; extracted line items are summarized for our team.
            </p>
            <Button
              asChild
              size="lg"
              className="w-full bg-primary text-base text-primary-foreground hover:bg-primary/90 sm:w-auto sm:min-w-[20rem]"
            >
              <Link
                href={quoteHref}
                onClick={() => {
                  persistInvoiceIntakeRfqHandoff({
                    intake_id: contract.intake_id,
                    procurement_opportunity_id: contract.procurement_opportunity_id,
                    vendor_name: contract.vendor_name ?? null,
                    invoice_number: contract.invoice_number ?? null,
                    extracted_line_count: lineCount,
                    persisted_line_count: contract.persisted_line_count ?? null,
                    upload_filename: contract.document.filename ?? null,
                  });
                }}
              >
                <Tag className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                Request a quote based on your current invoice
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <a href={specialistMailtoHref}>
              <Mail className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              Talk to a glove specialist about this invoice
            </a>
          </Button>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/contact">
              <MessageCircle className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              Other contact options
            </Link>
          </Button>
          {contract.identity.authenticated ? (
            <Button variant="secondary" asChild className="w-full sm:w-auto">
              <Link href={workspaceHref}>
                <ExternalLink className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                Open in workspace
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {!contract.identity.authenticated ? (
        <p className="text-sm text-white/55">Sign in to track this invoice and future quote activity.</p>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onReset}>
          New upload
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
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

  const specialistMailtoHref = contract != null ? buildSpecialistInvoiceMailtoHref(contract) : "";

  return (
    <div>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-3 text-2xl font-semibold text-white">Upload your invoice</h1>
        <ol className="mb-6 max-w-2xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-white/80">
          <li>We extract what you buy.</li>
          <li>We match it against governed glove options.</li>
          <li>You request a quote or review with a specialist as the next step.</li>
        </ol>
        <ul className="mb-8 space-y-2 rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-sm leading-relaxed text-white/70">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f06232]" aria-hidden />
            <span>We compare on a normalized unit basis.</span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f06232]" aria-hidden />
            <span>We only show approved alternates when they meet sourcing rules.</span>
          </li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f06232]" aria-hidden />
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
                  isDragging ? "border-[#f06232] bg-[#f06232]/10" : "border-white/20 bg-black/20"
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
                  <ShieldCheck className="h-4 w-4 text-[#f06232]" aria-hidden />
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
          <InvoiceIntakeReveal
            contract={contract}
            quoteHref={quoteHref}
            workspaceHref={workspaceHref}
            specialistMailtoHref={specialistMailtoHref}
            onReset={resetForm}
          />
        )}
      </main>
    </div>
  );
}

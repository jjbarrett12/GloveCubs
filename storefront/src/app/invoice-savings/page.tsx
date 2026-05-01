"use client";

import * as React from "react";
import Link from "next/link";
import { Upload, FileText, Loader2, DollarSign, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type ExtractedLine = {
  description: string;
  quantity: number;
  unit_price: number | null;
  total: number | null;
  sku_or_code?: string | null;
};

type Swap = {
  line_index: number;
  current_description: string;
  recommended_sku: string;
  recommended_name: string;
  brand?: string | null;
  estimated_savings: number | null;
  reason: string;
  confidence: number;
};

export default function InvoiceSavingsPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [step, setStep] = React.useState<"upload" | "extracting" | "results" | "recommend">("upload");
  const [extracted, setExtracted] = React.useState<{
    vendor_name?: string | null;
    invoice_number?: string | null;
    total_amount?: number | null;
    lines: ExtractedLine[];
  } | null>(null);
  const [savings, setSavings] = React.useState<{
    total_current_estimate: number;
    total_recommended_estimate: number;
    estimated_savings: number;
    swaps: Swap[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleExtract() {
    if (!file) return;
    setError(null);
    setStep("extracting");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ai/invoice/extract", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Extract failed");
        setStep("upload");
        return;
      }
      setExtracted({
        vendor_name: data.vendor_name,
        invoice_number: data.invoice_number,
        total_amount: data.total_amount,
        lines: data.lines ?? [],
      });
      setStep("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setStep("upload");
    }
  }

  async function handleRecommend() {
    if (!extracted?.lines?.length) return;
    setError(null);
    setStep("recommend");
    try {
      const res = await fetch("/api/ai/invoice/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: extracted.lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Recommend failed");
        setStep("results");
        return;
      }
      setSavings(data);
      setStep("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setStep("results");
    } finally {
      setStep("results");
    }
  }

  const showRecommend = step === "results" && extracted?.lines?.length && !savings;

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
        setFile(f);
        setCameraOpen(false);
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold text-white hover:text-white/90">
            GloveCubs
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/glove-finder" className="text-sm text-white/70 hover:text-white">
              Glove Finder
            </Link>
            <Link href="/" className="text-sm text-white/70 hover:text-white">
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-white mb-2">Invoice savings</h1>
        <p className="text-white/70 text-sm mb-8">
          Upload an invoice (image or PDF). We extract line items and suggest catalog swaps with estimated savings.
        </p>

        {step === "upload" && (
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload invoice
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="block w-full min-w-0 text-sm text-white/80 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-white/10 file:text-white"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setCameraOpen(false);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Take photo
                </Button>
              </div>
              {file && (
                <p className="text-sm text-white/60">
                  Selected: {file.name}
                  {file.type.startsWith("image/") && ` (${(file.size / 1024).toFixed(1)} KB)`}
                </p>
              )}
              {cameraOpen && (
                <div className="rounded-lg border border-white/10 bg-black/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Camera</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCameraOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {cameraError ? (
                    <p className="text-sm text-red-400" role="alert">{cameraError}</p>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="w-full max-h-64 object-cover rounded bg-black"
                      />
                      <Button type="button" onClick={handleCapture} className="w-full">
                        Capture photo
                      </Button>
                    </>
                  )}
                </div>
              )}
              {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
              <Button
                disabled={!file}
                onClick={handleExtract}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Extract line items
              </Button>
            </CardContent>
          </Card>
        )}

        {(step === "extracting" || step === "recommend") && (
          <div className="flex items-center gap-3 text-white/80 py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>{step === "extracting" ? "Extracting line items…" : "Finding savings…"}</span>
          </div>
        )}

        {step === "results" && extracted && (
          <div className="space-y-6">
            {extracted.vendor_name && (
              <p className="text-white/70">Vendor: {extracted.vendor_name}</p>
            )}
            {extracted.total_amount != null && (
              <p className="text-white/70">Total: ${extracted.total_amount.toFixed(2)}</p>
            )}
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Extracted lines ({extracted.lines.length})
                </h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {extracted.lines.map((line, i) => (
                    <li key={i} className="flex justify-between text-white/80">
                      <span>{line.description}</span>
                      <span>qty {line.quantity} · ${(line.total ?? line.unit_price ?? 0).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {savings && (
              <Card className="border-white/10 bg-white/5">
                <CardHeader>
                  <h2 className="text-lg font-medium text-white flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Savings report
                  </h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-white/60 text-xs">Current</p>
                      <p className="text-white font-medium">${savings.total_current_estimate.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-white/60 text-xs">Recommended</p>
                      <p className="text-white font-medium">${savings.total_recommended_estimate.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-white/60 text-xs">Est. savings</p>
                      <p className="text-green-400 font-medium">${savings.estimated_savings.toFixed(2)}</p>
                    </div>
                  </div>
                  {savings.swaps.length > 0 && (
                    <ul className="space-y-3 text-sm">
                      {savings.swaps.map((s, i) => (
                        <li key={i} className="border border-white/10 rounded p-3 text-white/80">
                          <p className="font-medium text-white">{s.current_description} → {s.recommended_name}</p>
                          <p className="text-xs mt-1">{s.reason}</p>
                          {s.estimated_savings != null && (
                            <p className="text-green-400 text-xs mt-1">Save ${s.estimated_savings.toFixed(2)} (confidence {(s.confidence * 100).toFixed(0)}%)</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
            <div className="flex gap-3">
              {showRecommend && (
                <Button onClick={handleRecommend} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Get savings recommendations
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/invoice-savings">New upload</Link>
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

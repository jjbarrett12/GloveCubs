"use client";

import { classifyPublishErrorMessage, publishFailureStageTitle } from "@/lib/publish/publish-result-stage";

export interface PublishResultBannerProps {
  message: string | null;
  variant: "success" | "error" | "neutral";
  /** Raw server or debug detail (smaller text). */
  secondaryText?: string | null;
}

export function PublishResultBanner({ message, variant, secondaryText }: PublishResultBannerProps) {
  if (!message) return null;
  const cls =
    variant === "success"
      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
      : variant === "error"
        ? "text-destructive border-destructive/30 bg-destructive/5"
        : "text-muted-foreground border-border bg-muted/20";
  return (
    <div className={`rounded-md border p-3 text-sm space-y-1 ${cls}`}>
      <p>{message}</p>
      {secondaryText?.trim() ? <p className="text-xs opacity-80 font-mono break-words">{secondaryText.trim()}</p> : null}
    </div>
  );
}

/** Format a publish error for operators (failure stage + raw message). */
export function formatPublishFailureMessage(err: string): string {
  const stage = classifyPublishErrorMessage(err);
  return `Publish failed at step: ${publishFailureStageTitle(stage)}. ${err}`.trim();
}

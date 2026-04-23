"use client";

import { classifyPublishErrorMessage, publishFailureStageTitle } from "@/lib/publish/publish-result-stage";
import { publishFailureOperatorNextStep } from "./publish-failure-ui";

export interface PublishFailureBannerProps {
  rawMessage: string;
}

export function PublishFailureBanner({ rawMessage }: PublishFailureBannerProps) {
  const stage = classifyPublishErrorMessage(rawMessage);
  const stageTitle = publishFailureStageTitle(stage);
  const nextStep = publishFailureOperatorNextStep(stage);

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3 text-sm max-w-xl">
      <p className="font-semibold text-destructive">Publish did not complete</p>
      <div className="space-y-1">
        <p className="text-foreground">
          <span className="text-muted-foreground font-medium">Failure stage: </span>
          {stageTitle}
        </p>
        <p className="text-foreground/90 leading-snug">{nextStep}</p>
      </div>
      <p className="text-xs font-mono text-muted-foreground break-words border-t border-border/60 pt-2">{rawMessage.trim()}</p>
      <p className="text-xs text-muted-foreground">
        When you are ready, use the <span className="font-medium text-foreground">Retry publish</span> button below — it runs the same
        server action as Publish / sync to live.
      </p>
    </div>
  );
}

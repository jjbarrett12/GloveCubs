"use client";

import { useState } from "react";
import { getOnboardingFileUrlAction } from "@/app/actions/onboarding";

export function FileDownloadLink({
  requestId,
  fileId,
  filename,
}: {
  requestId: string;
  fileId: string;
  filename: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await getOnboardingFileUrlAction(requestId, fileId);
    setLoading(false);
    if (result.success && result.url) window.open(result.url, "_blank");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-xs text-primary hover:underline shrink-0"
    >
      {loading ? "…" : "Download"}
    </button>
  );
}

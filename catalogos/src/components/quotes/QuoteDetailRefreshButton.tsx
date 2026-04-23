"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

export function QuoteDetailRefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    // Reset spinning state after a short delay so user sees feedback
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      title="Refresh"
      onClick={handleRefresh}
      disabled={refreshing}
      aria-label="Refresh quote status"
    >
      <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
    </Button>
  );
}

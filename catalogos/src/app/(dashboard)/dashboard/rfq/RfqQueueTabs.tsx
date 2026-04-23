"use client";

import Link from "next/link";
import type { RfqQueueFilter } from "@/lib/quotes/types";

const TABS: { value: RfqQueueFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unassigned", label: "Unassigned" },
  { value: "mine", label: "Mine" },
  { value: "overdue", label: "Overdue" },
  { value: "urgent", label: "Urgent" },
  { value: "awaiting_response", label: "Awaiting response" },
];

export function RfqQueueTabs({ currentFilter }: { currentFilter: RfqQueueFilter }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={tab.value === "all" ? "/dashboard/rfq" : `/dashboard/rfq?queue=${tab.value}`}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
            currentFilter === tab.value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

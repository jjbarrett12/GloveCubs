"use client";

import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { QuoteStatus, QuoteStatusHistoryRow } from "@/lib/quotes/types";
import { QuoteStatusBadge, getStatusConfig } from "./QuoteStatusBadge";

interface QuoteTimelineProps {
  currentStatus: QuoteStatus;
  history?: QuoteStatusHistoryRow[];
  submittedAt?: string | null;
  quotedAt?: string | null;
  wonAt?: string | null;
  lostAt?: string | null;
  expiredAt?: string | null;
  expiresAt?: string | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor(diffMs / (1000 * 60));
  
  if (diffDays > 30) {
    return formatDate(dateStr);
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  } else if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  }
  return "Just now";
}

export function QuoteTimeline({
  currentStatus,
  history = [],
  submittedAt,
  quotedAt,
  wonAt,
  lostAt,
  expiredAt,
  expiresAt,
}: QuoteTimelineProps) {
  // Build timeline events from history or infer from timestamps
  const events: Array<{
    status: QuoteStatus;
    timestamp: string | null;
    isCurrent: boolean;
    isPast: boolean;
  }> = [];
  
  // If we have history, use it
  if (history.length > 0) {
    const sortedHistory = [...history].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    for (const entry of sortedHistory) {
      events.push({
        status: entry.to_status,
        timestamp: entry.created_at,
        isCurrent: entry.to_status === currentStatus,
        isPast: true,
      });
    }
  } else {
    // Infer from timestamps
    if (submittedAt) {
      events.push({
        status: "new",
        timestamp: submittedAt,
        isCurrent: currentStatus === "new",
        isPast: true,
      });
    }
    
    if (quotedAt) {
      events.push({
        status: "quoted",
        timestamp: quotedAt,
        isCurrent: currentStatus === "quoted",
        isPast: true,
      });
    }
    
    if (wonAt) {
      events.push({
        status: "won",
        timestamp: wonAt,
        isCurrent: currentStatus === "won",
        isPast: true,
      });
    }
    
    if (lostAt) {
      events.push({
        status: "lost",
        timestamp: lostAt,
        isCurrent: currentStatus === "lost",
        isPast: true,
      });
    }
    
    if (expiredAt) {
      events.push({
        status: "expired",
        timestamp: expiredAt,
        isCurrent: currentStatus === "expired",
        isPast: true,
      });
    }
  }
  
  // If no events, just show current status
  if (events.length === 0) {
    events.push({
      status: currentStatus,
      timestamp: submittedAt || null,
      isCurrent: true,
      isPast: true,
    });
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Status Timeline</h3>
      
      <div className="relative">
        {events.map((event, index) => {
          const config = getStatusConfig(event.status);
          const Icon = config.icon;
          const isLast = index === events.length - 1;
          
          return (
            <div key={`${event.status}-${index}`} className="flex gap-4 pb-4 last:pb-0">
              {/* Timeline line and dot */}
              <div className="relative flex flex-col items-center">
                <div 
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    ${event.isCurrent 
                      ? "bg-primary text-primary-foreground" 
                      : event.isPast 
                        ? "bg-muted text-muted-foreground"
                        : "bg-muted/50 text-muted-foreground/50"
                    }
                  `}
                >
                  {event.isCurrent ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : event.isPast ? (
                    <Circle className="w-3 h-3 fill-current" />
                  ) : (
                    <Circle className="w-3 h-3" />
                  )}
                </div>
                {!isLast && (
                  <div 
                    className={`
                      w-0.5 flex-1 min-h-[24px]
                      ${event.isPast ? "bg-muted-foreground/30" : "bg-muted"}
                    `}
                  />
                )}
              </div>
              
              {/* Content */}
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-2">
                  <QuoteStatusBadge status={event.status} size="sm" showIcon={false} />
                  {event.isCurrent && (
                    <span className="text-xs text-muted-foreground">(current)</span>
                  )}
                </div>
                {event.timestamp && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatRelativeTime(event.timestamp)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Expiration notice */}
      {expiresAt && !["won", "lost", "expired", "closed"].includes(currentStatus) && (
        <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 p-3 rounded-md">
          <Clock className="w-4 h-4" />
          <span>
            Quote expires {formatRelativeTime(expiresAt)}
            {new Date(expiresAt) < new Date() && " (overdue)"}
          </span>
        </div>
      )}
    </div>
  );
}

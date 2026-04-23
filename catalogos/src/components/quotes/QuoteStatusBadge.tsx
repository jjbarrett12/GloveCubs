"use client";

import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Eye, 
  MessageSquare, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Archive
} from "lucide-react";
import type { QuoteStatus } from "@/lib/quotes/types";

interface QuoteStatusBadgeProps {
  status: QuoteStatus;
  size?: "sm" | "default" | "lg";
  showIcon?: boolean;
}

const STATUS_CONFIG: Record<QuoteStatus, { 
  label: string; 
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = {
  new: {
    label: "Submitted",
    variant: "default",
    className: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
    icon: Clock,
    description: "Your quote request has been received and is awaiting review.",
  },
  reviewing: {
    label: "Under Review",
    variant: "secondary",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
    icon: Eye,
    description: "Our team is reviewing your request and preparing a quote.",
  },
  contacted: {
    label: "In Discussion",
    variant: "secondary",
    className: "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100",
    icon: MessageSquare,
    description: "We've reached out to discuss your requirements.",
  },
  quoted: {
    label: "Quote Sent",
    variant: "default",
    className: "bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-100",
    icon: FileText,
    description: "A quote has been prepared and sent to you.",
  },
  won: {
    label: "Accepted",
    variant: "default",
    className: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
    icon: CheckCircle2,
    description: "Quote accepted! Your order is being processed.",
  },
  lost: {
    label: "Declined",
    variant: "destructive",
    className: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
    icon: XCircle,
    description: "This quote was not accepted.",
  },
  expired: {
    label: "Expired",
    variant: "outline",
    className: "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100",
    icon: AlertTriangle,
    description: "This quote has expired. Please submit a new request if still interested.",
  },
  closed: {
    label: "Closed",
    variant: "outline",
    className: "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100",
    icon: Archive,
    description: "This quote request has been closed.",
  },
};

export function QuoteStatusBadge({ status, size = "default", showIcon = true }: QuoteStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    default: "text-sm px-2.5 py-0.5",
    lg: "text-base px-3 py-1",
  };
  
  const iconSizes = {
    sm: "w-3 h-3",
    default: "w-4 h-4",
    lg: "w-5 h-5",
  };
  
  return (
    <Badge 
      variant={config.variant}
      className={`${config.className} ${sizeClasses[size]} font-medium border inline-flex items-center gap-1.5`}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </Badge>
  );
}

export function getStatusDescription(status: QuoteStatus): string {
  return STATUS_CONFIG[status]?.description || "Status unknown";
}

export function getStatusConfig(status: QuoteStatus) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.new;
}

/**
 * Internal API for processing quote notifications.
 * 
 * POST /api/internal/notifications
 * - Processes pending notifications
 * - Can be called by cron job or scheduled task
 * 
 * POST /api/internal/notifications?action=check-expiring
 * - Checks for expiring quotes and queues reminders
 */

import { NextRequest, NextResponse } from "next/server";
import { processNotifications, checkExpiringQuotes } from "@/lib/quotes/notificationWorker";

// Simple API key auth for internal endpoints
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "dev-internal-key";

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key") || 
                 request.headers.get("authorization")?.replace("Bearer ", "");
  
  // In development, allow without key
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  
  return apiKey === INTERNAL_API_KEY;
}

export async function POST(request: NextRequest) {
  // Validate API key
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
  
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  
  try {
    if (action === "check-expiring") {
      // Check for expiring quotes and queue reminders
      const queued = await checkExpiringQuotes(3); // 3 days before expiry
      
      return NextResponse.json({
        success: true,
        action: "check-expiring",
        queued,
      });
    }
    
    // Default: process pending notifications
    const limit = parseInt(searchParams.get("limit") || "50");
    const result = await processNotifications(limit);
    
    return NextResponse.json({
      success: true,
      action: "process",
      ...result,
    });
    
  } catch (error) {
    console.error("[Notifications API] Error:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to process notifications",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Health check
  if (!validateApiKey(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
  
  return NextResponse.json({
    status: "ok",
    service: "quote-notifications",
    endpoints: [
      "POST /api/internal/notifications - Process pending notifications",
      "POST /api/internal/notifications?action=check-expiring - Queue expiration reminders",
    ],
  });
}

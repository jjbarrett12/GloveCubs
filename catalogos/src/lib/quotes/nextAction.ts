/**
 * Buyer-facing next recommended action for a quote based on status.
 * Used on quote detail page.
 */

import type { QuoteStatus } from "./types";

export interface NextActionResult {
  message: string;
  action?: { label: string; href: string };
}

/**
 * Returns the next recommended action message and optional CTA for a quote.
 */
export function getNextAction(
  status: QuoteStatus,
  expiresAt: string | null
): NextActionResult {
  switch (status) {
    case "new":
      return {
        message:
          "Your request is in our queue. We typically respond within 1-2 business days.",
      };
    case "reviewing":
      return {
        message:
          "Our team is preparing your quote. You'll receive an email when it's ready.",
      };
    case "contacted":
      return {
        message:
          "We've reached out regarding your request. Please check your email or phone for our message.",
      };
    case "quoted":
      if (expiresAt && new Date(expiresAt) < new Date()) {
        return {
          message:
            "This quote has expired. Please submit a new request if you're still interested.",
          action: { label: "Request New Quote", href: "/quote" },
        };
      }
      return {
        message:
          "A quote has been sent to your email. Review and accept it to proceed with your order.",
      };
    case "won":
      return {
        message:
          "Great news! Your order is being processed. We'll notify you when it ships.",
      };
    case "lost":
      return {
        message:
          "We're sorry this quote didn't work out. Feel free to request a new quote anytime.",
        action: { label: "Request New Quote", href: "/quote" },
      };
    case "expired":
      return {
        message:
          "This quote has expired. Submit a new request to get updated pricing.",
        action: { label: "Request New Quote", href: "/quote" },
      };
    case "closed":
      return {
        message: "This quote request has been closed.",
        action: { label: "Start New Request", href: "/quote" },
      };
    default:
      return {
        message: "Please contact us if you have questions about your quote.",
      };
  }
}

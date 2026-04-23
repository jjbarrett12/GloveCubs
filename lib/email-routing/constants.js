/**
 * Email routing intents and action types.
 */

const INTENTS = Object.freeze({
  CUSTOMER_PRODUCT_QUESTION: 'CUSTOMER_PRODUCT_QUESTION',
  SUPPLIER_ONBOARDING: 'SUPPLIER_ONBOARDING',
  SUPPLIER_CATALOG_SUBMISSION: 'SUPPLIER_CATALOG_SUBMISSION',
  RFQ_RESPONSE: 'RFQ_RESPONSE',
  GENERAL_SUPPORT: 'GENERAL_SUPPORT',
  SPAM: 'SPAM',
});

const ACTION_TYPES = Object.freeze({
  DRAFT_RESPONSE: 'DRAFT_RESPONSE',
  SEND_ONBOARDING: 'SEND_ONBOARDING',
  CATALOG_SUBMISSION: 'CATALOG_SUBMISSION',
  ATTACH_TO_RFQ: 'ATTACH_TO_RFQ',
  CREATE_SUPPORT_TICKET: 'CREATE_SUPPORT_TICKET',
  MARK_SPAM: 'MARK_SPAM',
  NONE: 'NONE',
});

const STATUS = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SENT: 'sent',
  FAILED: 'failed',
});

/** Map intent to action type(s). Default one action per intent. */
function getActionTypeForIntent(intent) {
  const map = {
    [INTENTS.CUSTOMER_PRODUCT_QUESTION]: ACTION_TYPES.DRAFT_RESPONSE,
    [INTENTS.SUPPLIER_ONBOARDING]: ACTION_TYPES.SEND_ONBOARDING,
    [INTENTS.SUPPLIER_CATALOG_SUBMISSION]: ACTION_TYPES.CATALOG_SUBMISSION,
    [INTENTS.RFQ_RESPONSE]: ACTION_TYPES.ATTACH_TO_RFQ,
    [INTENTS.GENERAL_SUPPORT]: ACTION_TYPES.CREATE_SUPPORT_TICKET,
    [INTENTS.SPAM]: ACTION_TYPES.MARK_SPAM,
  };
  return map[intent] || ACTION_TYPES.NONE;
}

/** Intents that require human review before sending (draft/outbound). */
function requiresReview(intent) {
  return [
    INTENTS.CUSTOMER_PRODUCT_QUESTION,
    INTENTS.SUPPLIER_ONBOARDING,
    INTENTS.GENERAL_SUPPORT,
  ].includes(intent);
}

module.exports = {
  INTENTS,
  ACTION_TYPES,
  STATUS,
  getActionTypeForIntent,
  requiresReview,
};

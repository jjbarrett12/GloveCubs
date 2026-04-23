/**
 * Run the appropriate handler for the classified intent and return action payload for audit.
 */

const { INTENTS, getActionTypeForIntent, requiresReview } = require('../constants');
const customerProduct = require('./customer-product');
const supplierOnboarding = require('./supplier-onboarding');
const catalogSubmission = require('./catalog-submission');
const rfqResponse = require('./rfq-response');
const generalSupport = require('./general-support');
const spam = require('./spam');

/**
 * @param {string} intent
 * @param {object} email - normalized email (from, subject, bodyPlain, snippet, hasAttachments, id, etc.)
 * @param {object} classification - { intent, confidence }
 * @param {{ getAttachment?: (messageId, attachmentId) => Promise<string>, messageId?: string }} context
 * @returns { Promise<{ actionType: string, status: string, draftSubject?: string, draftBody?: string, externalId?: string, payload: object }> }
 */
async function runHandler(intent, email, classification, context = {}) {
  const actionType = getActionTypeForIntent(intent);
  const needsReview = requiresReview(intent);
  const status = needsReview ? 'pending_review' : 'pending_review';

  let result;
  switch (intent) {
    case INTENTS.CUSTOMER_PRODUCT_QUESTION:
      result = await customerProduct.handle(email, classification);
      break;
    case INTENTS.SUPPLIER_ONBOARDING:
      result = await supplierOnboarding.handle(email);
      break;
    case INTENTS.SUPPLIER_CATALOG_SUBMISSION:
      result = await catalogSubmission.handle(email, context);
      break;
    case INTENTS.RFQ_RESPONSE:
      result = await rfqResponse.handle(email);
      break;
    case INTENTS.GENERAL_SUPPORT:
      result = await generalSupport.handle(email);
      break;
    case INTENTS.SPAM:
      result = await spam.handle();
      break;
    default:
      result = { draftSubject: null, draftBody: null, payload: { intent } };
  }

  return {
    actionType,
    status,
    draftSubject: result.draftSubject ?? null,
    draftBody: result.draftBody ?? null,
    externalId: result.externalId ?? null,
    payload: result.payload || {},
  };
}

module.exports = { runHandler };

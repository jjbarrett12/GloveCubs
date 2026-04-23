/**
 * AI Email Routing for GloveCubs.
 * - Gmail inbox monitoring
 * - OpenAI intent classification
 * - Intent-based handlers (draft reply, onboarding, catalog, RFQ, support, spam)
 * - Audit in Supabase
 * - Review queue for human approval before send
 */

const gmail = require('./gmail-client');
const classifier = require('./classifier');
const { runHandler } = require('./handlers');
const audit = require('./audit');
const reviewQueue = require('./review-queue');

module.exports = {
  constants: require('./constants'),
  gmail: { isConfigured: gmail.isConfigured, listMessages: gmail.listMessages, getMessage: gmail.getMessage, getAttachment: gmail.getAttachment },
  classifier: { classifyEmail: classifier.classifyEmail },
  handlers: { runHandler },
  audit,
  reviewQueue,
};

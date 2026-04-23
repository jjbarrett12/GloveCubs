/**
 * Email routing worker: poll Gmail, classify, run handler, store result.
 * Run with: node lib/email-routing/worker.js [--once] [--max=10]
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const gmail = require('./gmail-client');
const classifier = require('./classifier');
const { runHandler } = require('./handlers');
const audit = require('./audit');

async function processOneMessage(messageId) {
  const email = await gmail.getMessage(messageId);
  const classification = await classifier.classifyEmail({
    from: email.from,
    subject: email.subject,
    snippet: email.snippet,
    bodyPlain: email.bodyPlain,
  });

  const context = {
    messageId: email.id,
    getAttachment: (msgId, attId) => gmail.getAttachment(msgId, attId),
  };
  const actionResult = await runHandler(classification.intent, email, classification, context);

  await audit.storeProcessingResult(email, classification, actionResult);
  return { messageId: email.id, intent: classification.intent, actionType: actionResult.actionType };
}

async function run(options = {}) {
  const once = options.once !== false;
  const max = Math.min(parseInt(options.max, 10) || 10, 50);

  if (!gmail.isConfigured()) {
    console.error('[email-routing] Gmail not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.');
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('[email-routing] OPENAI_API_KEY not set.');
    return;
  }
  const { getSupabase } = require('../supabase');
  if (!getSupabase()) {
    console.error('[email-routing] Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    return;
  }

  const list = await gmail.listMessages({ maxResults: max, q: 'in:inbox is:unread' });
  if (list.length === 0) {
    console.log('[email-routing] No new messages.');
    return;
  }

  const toProcess = [];
  for (const msg of list) {
    const done = await audit.isAlreadyProcessed(msg.id);
    if (!done) toProcess.push(msg);
  }
  if (toProcess.length === 0) {
    console.log('[email-routing] All messages already processed.');
    return;
  }

  console.log(`[email-routing] Processing ${toProcess.length} new message(s).`);
  for (const msg of toProcess) {
    try {
      const result = await processOneMessage(msg.id);
      console.log('[email-routing] Processed', result.messageId, result.intent, result.actionType);
    } catch (err) {
      console.error('[email-routing] Error processing', msg.id, err.message);
    }
  }
}

const args = process.argv.slice(2);
const opts = { once: true, max: 10 };
args.forEach((a) => {
  if (a === '--once') opts.once = true;
  if (a.startsWith('--max=')) opts.max = a.slice(6);
});

run(opts).then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

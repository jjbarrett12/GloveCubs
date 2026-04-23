/**
 * Store email processing results in Supabase for audit.
 */

const { getSupabase } = require('../supabase');

function getDb() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured for email routing');
  return supabase;
}

/**
 * Return true if this Gmail message was already processed (exists in email_routing_messages).
 */
async function isAlreadyProcessed(gmailMessageId) {
  const supabase = getDb();
  const { data } = await supabase
    .from('email_routing_messages')
    .select('id')
    .eq('gmail_message_id', gmailMessageId)
    .maybeSingle();
  return !!data;
}

/**
 * Insert or get existing message by gmail_message_id. Returns { id }.
 */
async function upsertMessage(row) {
  const supabase = getDb();
  const { data: existing } = await supabase
    .from('email_routing_messages')
    .select('id')
    .eq('gmail_message_id', row.gmail_message_id)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data: inserted, error } = await supabase
    .from('email_routing_messages')
    .insert({
      gmail_message_id: row.gmail_message_id,
      gmail_thread_id: row.gmail_thread_id || null,
      from_email: row.from_email,
      to_email: row.to_email || null,
      subject: row.subject || null,
      snippet: row.snippet || null,
      body_plain: row.body_plain || null,
      body_html: row.body_html || null,
      received_at: row.received_at,
      has_attachments: row.has_attachments || false,
      attachment_count: row.attachment_count || 0,
    })
    .select('id')
    .single();
  if (error) throw new Error(`email_routing_messages insert: ${error.message}`);
  return { id: inserted.id };
}

/**
 * Insert classification. Returns { id }.
 */
async function insertClassification(messageId, classification) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('email_routing_classifications')
    .insert({
      message_id: messageId,
      intent: classification.intent,
      confidence: classification.confidence,
      raw_ai_response: classification.rawResponse || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`email_routing_classifications insert: ${error.message}`);
  return { id: data.id };
}

/**
 * Insert action. Returns { id }.
 */
async function insertAction(messageId, classificationId, action) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('email_routing_actions')
    .insert({
      message_id: messageId,
      classification_id: classificationId,
      action_type: action.actionType,
      status: action.status,
      draft_subject: action.draftSubject || null,
      draft_body: action.draftBody || null,
      external_id: action.externalId || null,
      payload: action.payload || {},
    })
    .select('id')
    .single();
  if (error) throw new Error(`email_routing_actions insert: ${error.message}`);
  return { id: data.id };
}

/**
 * Full audit: store message, classification, and action. Returns { messageId, classificationId, actionId }.
 */
async function storeProcessingResult(gmailMessage, classification, actionResult) {
  const msgRow = {
    gmail_message_id: gmailMessage.id,
    gmail_thread_id: gmailMessage.threadId,
    from_email: gmailMessage.from,
    to_email: gmailMessage.to,
    subject: gmailMessage.subject,
    snippet: gmailMessage.snippet,
    body_plain: gmailMessage.bodyPlain || null,
    body_html: gmailMessage.bodyHtml || null,
    received_at: gmailMessage.receivedAt,
    has_attachments: gmailMessage.hasAttachments || false,
    attachment_count: gmailMessage.attachmentCount || 0,
  };
  const { id: messageId } = await upsertMessage(msgRow);
  const { id: classificationId } = await insertClassification(messageId, classification);
  const { id: actionId } = await insertAction(messageId, classificationId, actionResult);
  return { messageId, classificationId, actionId };
}

module.exports = {
  isAlreadyProcessed,
  upsertMessage,
  insertClassification,
  insertAction,
  storeProcessingResult,
};

/**
 * Review queue: list pending actions, approve, reject, and send (draft reply via Gmail or SMTP).
 */

const { getSupabase } = require('../supabase');
const { dispatchEmail } = require('../email-dispatch');
const { STATUS } = require('./constants');

function getDb() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  return supabase;
}

/**
 * List actions pending review. Optional filters: status, limit.
 */
async function listPending(options = {}) {
  const supabase = getDb();
  let query = supabase
    .from('email_routing_actions')
    .select(`
      id,
      message_id,
      classification_id,
      action_type,
      status,
      draft_subject,
      draft_body,
      external_id,
      payload,
      created_at,
      email_routing_messages ( id, from_email, to_email, subject, snippet, received_at )
    `)
    .eq('status', options.status || STATUS.PENDING_REVIEW)
    .order('created_at', { ascending: false });
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get a single action by id with message and classification.
 */
async function getActionById(actionId) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('email_routing_actions')
    .select(`
      *,
      email_routing_messages (*),
      email_routing_classifications (*)
    `)
    .eq('id', actionId)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Approve action (status -> approved). Does not send; use sendApproved to send.
 */
async function approve(actionId, reviewedBy) {
  const supabase = getDb();
  const { error } = await supabase
    .from('email_routing_actions')
    .update({
      status: STATUS.APPROVED,
      reviewed_by: reviewedBy || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', actionId);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Reject action (status -> rejected).
 */
async function reject(actionId, reviewedBy) {
  const supabase = getDb();
  const { error } = await supabase
    .from('email_routing_actions')
    .update({
      status: STATUS.REJECTED,
      reviewed_by: reviewedBy || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', actionId);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Send an approved action: send draft_body to the original sender (from message). Updates status to sent or failed.
 */
async function sendApproved(actionId) {
  const action = await getActionById(actionId);
  if (!action) throw new Error('Action not found');
  if (action.status !== STATUS.APPROVED) {
    throw new Error(`Action not approved (status: ${action.status})`);
  }
  const message = action.email_routing_messages;
  const to = message?.from_email;
  if (!to || !action.draft_body) {
    const supabase = getDb();
    await supabase
      .from('email_routing_actions')
      .update({
        status: STATUS.FAILED,
        error_message: 'Missing recipient or draft body',
        updated_at: new Date().toISOString(),
      })
      .eq('id', actionId);
    return { sent: false, error: 'Missing recipient or draft body' };
  }

  const result = await dispatchEmail({
    to,
    subject: action.draft_subject || 'Re: Your message',
    text: action.draft_body,
    emailType: 'email_routing_reply',
    metadata: { email_routing_action_id: actionId },
  });

  const supabase = getDb();
  if (result.sent) {
    await supabase
      .from('email_routing_actions')
      .update({
        status: STATUS.SENT,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', actionId);
    return { sent: true };
  }
  await supabase
    .from('email_routing_actions')
    .update({
      status: STATUS.FAILED,
      error_message: result.error || 'Send failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', actionId);
  return { sent: false, error: result.error };
}

module.exports = {
  listPending,
  getActionById,
  approve,
  reject,
  sendApproved,
};

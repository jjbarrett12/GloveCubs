/**
 * RFQ_RESPONSE: attach to RFQ record (store reference; link to RFQ id when identifiable).
 */

/**
 * @param {{ from: string, subject: string, bodyPlain: string, id: string }} email
 * @returns { Promise<{ externalId?: string, payload: object }> }
 */
async function handle(email) {
  const payload = { messageId: email.id, from: email.from, subject: email.subject };
  return {
    draftSubject: null,
    draftBody: null,
    payload,
  };
}

module.exports = { handle };

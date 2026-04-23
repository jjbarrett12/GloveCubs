/**
 * GENERAL_SUPPORT: create support ticket (store as ticket record; optional integration with ticket system).
 */

/**
 * @param {{ from: string, subject: string, bodyPlain: string, snippet: string }} email
 * @returns { Promise<{ draftSubject: string, draftBody: string, externalId: string, payload: object }> }
 */
async function handle(email) {
  const ticketId = `TKT-${Date.now()}`;
  return {
    draftSubject: `Re: ${email.subject}`,
    draftBody: `Thank you for contacting GloveCubs support. We have created ticket ${ticketId} and will respond as soon as possible.`,
    externalId: ticketId,
    payload: { ticketId, from: email.from, subject: email.subject, snippet: email.snippet },
  };
}

module.exports = { handle };

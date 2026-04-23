/**
 * SUPPLIER_CATALOG_SUBMISSION: detect attachment and send to CatalogOS ingestion (or record for manual ingestion).
 */

/**
 * @param {{ from: string, subject: string, bodyPlain: string, hasAttachments: boolean, attachmentCount: number, id: string }} email
 * @param {{ getAttachment: (messageId, attachmentId) => Promise<string> }} context - getAttachment returns base64url
 * @returns { Promise<{ draftSubject?: string, draftBody?: string, externalId?: string, payload: object }> }
 */
async function handle(email, context = {}) {
  const payload = { hasAttachments: email.hasAttachments, attachmentCount: email.attachmentCount || 0, submitted: false };
  if (!email.hasAttachments || !context.getAttachment || !context.messageId) {
    return {
      draftSubject: `Re: ${email.subject}`,
      draftBody: 'Thank you for your catalog submission. We did not detect an attachment. Please reply with your catalog file (CSV or Excel) attached.',
      payload,
    };
  }

  const ingestUrl = process.env.CATALOGOS_INGEST_URL || process.env.CATALOG_INGEST_URL;
  if (!ingestUrl) {
    return {
      draftSubject: `Re: ${email.subject}`,
      draftBody: 'Thank you for your catalog submission. Our team will process it shortly.',
      payload: { ...payload, reason: 'CATALOGOS_INGEST_URL not configured' },
    };
  }

  // If we have attachment IDs we could fetch and POST to ingest. CatalogOS may expect multipart/form-data or URL.
  // For audit we record that we would send to ingest; actual file upload can be done by a separate job that reads from action payload.
  const externalId = `catalog-${Date.now()}-${email.id}`;
  payload.externalId = externalId;
  payload.ingestUrl = ingestUrl;
  payload.messageId = context.messageId;

  return {
    draftSubject: `Re: ${email.subject}`,
    draftBody: 'We have received your catalog submission and will process it shortly. You will receive a follow-up once it has been reviewed.',
    externalId,
    payload,
  };
}

module.exports = { handle };

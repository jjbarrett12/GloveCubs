/**
 * Gmail API client for monitoring inbox. Uses OAuth2 refresh token (env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).
 */

const { google } = require('googleapis');

function getAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth not configured: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN');
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function isConfigured() {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

/**
 * List message IDs from inbox. Options: { maxResults, q (query), after (Date or ISO string) }.
 * @returns { Promise<{ id: string, threadId: string }[]> }
 */
async function listMessages(options = {}) {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const maxResults = Math.min(options.maxResults || 20, 100);
  let q = options.q || 'in:inbox';
  if (options.after) {
    const after = options.after instanceof Date ? options.after : new Date(options.after);
    q += ` after:${Math.floor(after.getTime() / 1000)}`;
  }
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: q.trim(),
    pageToken: options.pageToken,
  });
  const list = res.data.messages || [];
  return list.map((m) => ({ id: m.id, threadId: m.threadId }));
}

/**
 * Get full message with body and attachments metadata.
 * @returns { Promise<{ id, threadId, from, to, subject, snippet, bodyPlain, bodyHtml, receivedAt, hasAttachments, attachmentIds: string[] }> }
 */
async function getMessage(messageId) {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  const msg = res.data;
  const headers = (msg.payload?.headers || []).reduce((acc, h) => {
    acc[h.name?.toLowerCase()] = h.value;
    return acc;
  }, {});
  let bodyPlain = '';
  let bodyHtml = '';
  const attachmentIds = [];

  function walkParts(part) {
    if (!part) return;
    const filename = part.filename;
    if (part.body?.attachmentId) {
      attachmentIds.push(part.body.attachmentId);
      return;
    }
    if (part.mimeType === 'text/plain' && part.body?.data) {
      bodyPlain = Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      bodyHtml = Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    (part.parts || []).forEach(walkParts);
  }
  if (msg.payload?.body?.data) {
    bodyPlain = Buffer.from(msg.payload.body.data, 'base64url').toString('utf8');
  }
  walkParts(msg.payload);

  const dateHeader = headers.date;
  let receivedAt = new Date();
  if (dateHeader) {
    const d = new Date(dateHeader);
    if (!Number.isNaN(d.getTime())) receivedAt = d;
  }

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: headers.from || '',
    to: headers.to || '',
    subject: headers.subject || '',
    snippet: msg.snippet || '',
    bodyPlain,
    bodyHtml,
    receivedAt: receivedAt.toISOString(),
    hasAttachments: attachmentIds.length > 0,
    attachmentCount: attachmentIds.length,
    attachmentIds,
  };
}

/**
 * Get attachment body (base64). Use getMessage first to get attachmentId.
 */
async function getAttachment(messageId, attachmentId) {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  return res.data.data; // base64url
}

module.exports = {
  isConfigured,
  listMessages,
  getMessage,
  getAttachment,
};

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const drain = fs.readFileSync(path.join(root, 'lib/legacy-public-write-drain.js'), 'utf8');

function handlerSlice(startMarker, endMarker) {
  const start = server.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = server.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing end marker after ${startMarker}`);
  return server.slice(start, end);
}

describe('legacy Express public write drain', () => {
  it('helper returns 410 with LEGACY_PUBLIC_WRITE_DRAINED', () => {
    assert.match(drain, /LEGACY_PUBLIC_WRITE_DRAINED/);
    assert.match(drain, /status\(410\)/);
  });

  const drained = [
    {
      start: "app.post('/api/auth/register'",
      end: "app.post('/api/auth/login'",
      forbidden: [/createUser/, /plain_password/],
    },
    {
      start: "app.post('/api/contact'",
      end: '// ============ PASSWORD RESET',
      forbidden: [/createContactMessage/, /dispatchEmail/],
    },
    {
      start: "app.post('/api/ai/glove-finder'",
      end: "app.post('/api/ai/invoice/extract'",
      forbidden: [/aiGenerate/, /logConversation/],
    },
    {
      start: "app.post('/api/ai/invoice/extract'",
      end: "app.post('/api/ai/invoice/recommend'",
      forbidden: [/aiExtractInvoice/, /logInvoiceUpload/],
    },
    {
      start: "app.post('/api/ai/invoice/recommend'",
      end: "app.post('/api/products'",
      forbidden: [/aiRecommendFromInvoice/, /logRecommendations/],
    },
    {
      start: "app.post('/api/rfqs'",
      end: "app.get('/api/rfqs/mine'",
      forbidden: [/createRfq/, /dispatchEmailInBackground/, /rfqConfirmation/],
    },
    {
      start: "app.post('/api/public/lead-capture'",
      end: '// ============ ADMIN ROUTES',
      forbidden: [/capturePublicLead/],
    },
  ];

  for (const row of drained) {
    it(`${row.start} returns 410 and skips side effects`, () => {
      const slice = handlerSlice(row.start, row.end);
      assert.match(slice, /sendLegacyPublicWriteGone/);
      for (const re of row.forbidden) {
        assert.doesNotMatch(slice, re);
      }
    });
  }

  it('does not drain Stripe webhook or internal cron', () => {
    const stripe = handlerSlice(
      "app.post('/api/webhooks/stripe'",
      '// ============ AUTH ROUTES'
    );
    assert.match(stripe, /constructEvent/);
    assert.doesNotMatch(stripe, /sendLegacyPublicWriteGone/);

    const cron = handlerSlice(
      "app.post('/api/internal/import/run'",
      "app.post('/api/email-routing/review"
    );
    assert.match(cron, /requireInternalCron/);
    assert.doesNotMatch(cron, /sendLegacyPublicWriteGone/);
  });
});

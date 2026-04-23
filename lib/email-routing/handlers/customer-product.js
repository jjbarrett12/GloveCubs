/**
 * CUSTOMER_PRODUCT_QUESTION: query catalog (or product list) and draft a response using OpenAI.
 */

async function queryCatalogSummary() {
  const base = process.env.APP_URL || process.env.GLOVECUBS_APP_URL || 'http://localhost:3004';
  try {
    const res = await fetch(`${base}/api/products?limit=50`);
    if (!res.ok) return '';
    const data = await res.json();
    const products = Array.isArray(data) ? data : (data.products || data.items || []);
    return products.slice(0, 20).map((p) => `${p.name || p.title || ''} ${(p.brand || '')} ${(p.sku || '')}`).filter(Boolean).join('\n');
  } catch (e) {
    return '';
  }
}

/**
 * @param {{ from: string, subject: string, bodyPlain: string, snippet: string }} email
 * @param {{ intent: string, confidence: number }} classification
 * @returns { Promise<{ draftSubject: string, draftBody: string, payload: object }> }
 */
async function handle(email, classification) {
  const catalogSummary = await queryCatalogSummary();
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return {
      draftSubject: `Re: ${email.subject}`,
      draftBody: 'Thank you for your inquiry. Our team will respond with product information shortly.',
      payload: { catalogQueried: false, reason: 'OPENAI_API_KEY not set' },
    };
  }

  const prompt = `You are a helpful GloveCubs sales rep. A customer sent this email. Draft a brief, professional reply (plain text, 2-4 short paragraphs max). If the email asks about specific products, use this catalog summary to inform your reply (product names/brands). Do not make up SKUs or prices; suggest they visit the site or contact us for specifics. Sign off as GloveCubs team.

Customer email:
From: ${email.from}
Subject: ${email.subject}
${email.bodyPlain ? email.bodyPlain.slice(0, 2000) : email.snippet}

Catalog summary (for reference):
${catalogSummary || 'No catalog data available.'}

Reply in plain text only, no JSON.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return {
      draftSubject: `Re: ${email.subject}`,
      draftBody: 'Thank you for your inquiry. We will get back to you shortly.',
      payload: { error: err, catalogQueried: !!catalogSummary },
    };
  }

  const data = await res.json();
  const draftBody = (data.choices?.[0]?.message?.content || '').trim() || 'Thank you for your inquiry. Our team will respond shortly.';

  return {
    draftSubject: (email.subject && !email.subject.toLowerCase().startsWith('re:')) ? `Re: ${email.subject}` : email.subject || 'Re: Your inquiry',
    draftBody,
    payload: { catalogQueried: !!catalogSummary },
  };
}

module.exports = { handle };

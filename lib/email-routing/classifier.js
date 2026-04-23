/**
 * Classify email intent using OpenAI. Returns intent + confidence.
 */

const { INTENTS } = require('./constants');

const INTENT_LIST = Object.values(INTENTS);

function getOpenAIKey() {
  const key = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
}

/**
 * @param {{ from: string, subject: string, snippet: string, bodyPlain: string }} email
 * @returns { Promise<{ intent: string, confidence: number, rawResponse?: object }> }
 */
async function classifyEmail(email) {
  const apiKey = getOpenAIKey();
  const model = process.env.OPENAI_EMAIL_CLASSIFIER_MODEL || 'gpt-4o-mini';
  const text = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    `Snippet: ${email.snippet}`,
    email.bodyPlain ? `Body (first 3000 chars): ${email.bodyPlain.slice(0, 3000)}` : '',
  ].join('\n');

  const systemPrompt = `You are an email classifier for GloveCubs, a B2B supplier of gloves and PPE. Classify the email into exactly one intent.

Intents:
- CUSTOMER_PRODUCT_QUESTION: Customer asking about products, availability, specs, or recommendations.
- SUPPLIER_ONBOARDING: Supplier or vendor wants to become a supplier / onboarding inquiry.
- SUPPLIER_CATALOG_SUBMISSION: Supplier submitting a product catalog, price list, or feed (often has attachment).
- RFQ_RESPONSE: Response to a request for quote (RFQ) we sent.
- GENERAL_SUPPORT: General customer support, order status, account, shipping, returns, or other non-product questions.
- SPAM: Spam, marketing we did not request, or clearly irrelevant.

Respond with a JSON object only: { "intent": "<one of the intents above>", "confidence": <0-1 number> }`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 100,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`OpenAI returned invalid JSON: ${content}`);
  }

  const intent = parsed.intent && INTENT_LIST.includes(parsed.intent) ? parsed.intent : INTENTS.GENERAL_SUPPORT;
  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

  return {
    intent,
    confidence,
    rawResponse: parsed,
  };
}

module.exports = { classifyEmail };

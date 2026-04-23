/**
 * SUPPLIER_ONBOARDING: draft/send vendor onboarding instructions.
 */

const DEFAULT_ONBOARDING_BODY = `Thank you for your interest in becoming a GloveCubs supplier.

To get started, please:
1. Complete our vendor application form: [Link to your form or portal]
2. Send your current product catalog or price list (CSV or Excel preferred)
3. Provide your primary contact for orders and lead times

We typically review new supplier submissions within 2-3 business days. You will receive a follow-up email with next steps.

Best regards,
GloveCubs Supplier Team`;

/**
 * @param {{ from: string, subject: string }} email
 * @returns { Promise<{ draftSubject: string, draftBody: string, payload: object }> }
 */
async function handle(email) {
  const onboardingUrl = process.env.SUPPLIER_ONBOARDING_URL || '';
  let body = process.env.SUPPLIER_ONBOARDING_TEMPLATE || DEFAULT_ONBOARDING_BODY;
  if (onboardingUrl) {
    body = body.replace(/\[Link to your form or portal\]/g, onboardingUrl);
  }
  return {
    draftSubject: 'GloveCubs – Supplier onboarding next steps',
    draftBody: body,
    payload: { template: 'supplier_onboarding' },
  };
}

module.exports = { handle };

const path = require('path');
const envPath = path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });
console.log('[boot] cwd:', process.cwd());
console.log('[boot] env file path:', envPath);

// Supabase is required: single source of truth. Crash if missing.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or environment).');
}
console.log('[boot] supabase url set: true');
console.log('[boot] service role set: true');

// JWT_SECRET: require in production; reject unsafe default
const JWT_SECRET_RAW = process.env.JWT_SECRET || '';
const JWT_SECRET_DEFAULT = 'glovecubs-secret-key-2024';
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!JWT_SECRET_RAW.trim() || JWT_SECRET_RAW === JWT_SECRET_DEFAULT)) {
  throw new Error('JWT_SECRET must be set to a strong random value in production. Do not use the default.');
}

const express = require('express');
const cors = require('cors');
const os = require('os');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const fishbowl = require('./fishbowl');
const rateLimit = require('express-rate-limit');
const { isConfigured: emailConfigured, getConfigStatus: getEmailConfigStatus, verifyConnection: verifyEmailConnection } = require('./lib/email');
const emailTemplates = require('./lib/email-templates');
const productStore = require('./lib/product-store');
const { getEffectiveMargin, computeSellPrice } = require('./lib/pricing');
const commercePricing = require('./lib/commerce-pricing');
const checkoutCompute = require('./lib/checkout-compute');
const { assertNoClientSuppliedTotals } = require('./lib/checkout-client-body-guard');
const orderReorder = require('./lib/order-reorder');
const { importCsvToSupabase } = require('./lib/import-csv-supabase');
const supabaseLib = require('./lib/supabase');
const { parseProductUrl } = require('./lib/parse-product-url');
const { aiNormalizeProduct, normalizeFromExtracted, isConfigured: aiNormalizeConfigured } = require('./lib/ai-normalize-product');
const { validateImageUrls, validateImageUrlsWithVerification } = require('./lib/validate-image-urls');
const { getSupabase, isConfigured: supabaseConfigured } = require('./lib/supabase');
const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('./lib/supabaseAdmin');
const productsService = require('./services/productsService');
const usersService = require('./services/usersService');
const companiesService = require('./services/companiesService');
const pricingTiersService = require('./services/pricingTiersService');
const pricingTierEvaluationService = require('./services/pricingTierEvaluationService');
const netTermsService = require('./services/netTermsService');
const supplierCostImportService = require('./services/supplierCostImportService');
const growthPipelineService = require('./services/growthPipelineService');
const shippingMarginAnalyticsService = require('./services/shippingMarginAnalyticsService');
const {
    canPlaceInvoiceOrder,
    evaluateNet30Credit,
    formatInvoiceTermsLabel,
} = require('./lib/invoice-terms-guard');
const {
    buildOrderEconomicsOrderFields,
    buildLineCostSnapshotFields,
} = require('./lib/orderEconomicsSnapshot');
const ownerCockpitService = require('./services/ownerCockpitService');
const adminOperationsDashboardService = require('./services/adminOperationsDashboardService');
const adminChannelAnalyticsService = require('./services/adminChannelAnalyticsService');
const { sanitizeMarketingAttribution } = require('./lib/marketing-attribution');
const arInvoiceService = require('./services/arInvoiceService');
const arAgingService = require('./services/arAgingService');
const shippingPolicyService = require('./services/shippingPolicyService');
const dataService = require('./services/dataService');
const {
    ensureCommerceLinesHaveCanonical,
    normalizeCanonicalUuidInput,
    resolveLineCatalogProductId,
    resolveCartLineListingProductId,
} = require('./lib/resolve-canonical-product-id');
const { buildPurchaseOrderLinesFromOrder } = require('./lib/poLineBuilder');
const { runPoMappingHealthReport } = require('./lib/poMappingHealth');
const inventory = require('./lib/inventory');
const {
    validateAdminOrderStatusTransition,
    ABANDON_STATUSES,
    orderRequiresOnlinePaymentConfirmation,
} = require('./lib/adminOrderGuards');
const addressValidation = require('./lib/address-validation');
const taxLib = require('./lib/tax');
const orderInvoiceTotals = require('./lib/order-invoice-totals');
const commerceShipping = require('./lib/commerce-shipping');
const { logParseEvent } = require('./lib/parse-log');
const { aiGenerate, aiExtractInvoice, aiRecommendFromInvoice, isConfigured: aiConfigured } = require('./lib/ai/provider');
const { validateGloveFinderRequest, validateGloveFinderResponse, validateInvoiceExtractResponse, validateInvoiceRecommendResponse } = require('./lib/ai/schemas');
const { hashIp, logConversation, logInvoiceUpload, logInvoiceLines, logRecommendations } = require('./lib/ai/ai-log');
const { enqueueBulkUrls, runWorker, approveDraft } = require('./lib/bulk-import');
const Stripe = require('stripe');
const paymentLog = require('./lib/payment-logger');
const { dispatchEmail, dispatchEmailInBackground } = require('./lib/email-dispatch');
const webhookIdempotency = require('./lib/webhook-idempotency');
const { sortByRelevance } = require('./lib/search-relevance');
const cartLineContract = require('./lib/contracts/cart-line');
const {
    sanitizeProductForPublicApi,
    sanitizeProductsArrayForPublicApi,
} = require('./lib/public-product-api');
const { mapPostgrestOrDatabaseError } = require('./lib/postgrestSchema');

const app = express();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const PORT = parseInt(process.env.PORT, 10) || 3004;
const JWT_SECRET = (process.env.JWT_SECRET || '').trim() || JWT_SECRET_DEFAULT;

function sendCatalogApiError(res, err, logLabel) {
    const pg =
        err && typeof err === 'object'
            ? {
                  message: err.message,
                  code: err.code,
                  details: err.details,
                  hint: err.hint,
              }
            : { message: String(err) };
    console.error(logLabel, pg);
    if (err && err.stack) console.error(logLabel + ' stack', err.stack);
    const mapped = mapPostgrestOrDatabaseError(err);
    res.status(mapped.status).json(mapped.body);
}

/** Product listing must not 500 if public.inventory is missing or PostgREST rejects it. */
async function getInventoryForCatalogRoutes() {
    try {
        return await dataService.getInventory();
    } catch (err) {
        console.error('[catalog/inventory] getInventory failed; continuing without stock overlay', {
            message: err && err.message,
            code: err && err.code,
            details: err && err.details,
            hint: err && err.hint,
        });
        return [];
    }
}

// Fishbowl customer export: file path and schedule (every 30 min)
const FISHBOWL_EXPORT_DIR = path.join(__dirname, 'data');
const FISHBOWL_EXPORT_FILE = path.join(FISHBOWL_EXPORT_DIR, 'fishbowl-customers.csv');
const FISHBOWL_EXPORT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/** Build pricing context from Supabase for getEffectiveMargin. */
async function getPricingContext() {
  const [companies, customer_manufacturer_pricing, tier_discount_by_code] = await Promise.all([
    companiesService.getCompanies(),
    companiesService.getCustomerManufacturerPricing(),
    pricingTiersService.getTierDiscountMap(),
  ]);
  return { companies, customer_manufacturer_pricing, tier_discount_by_code };
}

/** Customer-safe tier label + source (no internal rule math). */
async function attachPricingTierPresentation(userLike) {
  if (!userLike) return userLike;
  const out = { ...userLike };
  try {
    const meta = await pricingTiersService.getTierByCode(out.discount_tier);
    out.pricing_tier_display =
      meta && meta.display_name
        ? meta.display_name
        : String(out.discount_tier || 'standard').replace(/\b\w/g, (c) => c.toUpperCase());
  } catch (_) {
    out.pricing_tier_display = out.discount_tier || 'Standard';
  }
  if (out.pricing_tier_source == null) out.pricing_tier_source = 'manual';
  try {
    const map = await pricingTiersService.getTierDiscountMap();
    out.pricing_tier_discount_percent_applied = commercePricing.getTierDiscountPercentForUser(out, map);
  } catch (_) {
    out.pricing_tier_discount_percent_applied = commercePricing.getTierDiscountPercentForUser(out, null);
  }
  return out;
}

function schedulePricingTierReevaluation(userId, source) {
  const sid = userId != null ? String(userId).trim() : '';
  if (!sid) return;
  setImmediate(() => {
    pricingTierEvaluationService
      .evaluateAndApplyUserTier(sid, { source: source || 'post_order' })
      .catch((e) => console.error('[pricing_tier_eval]', e && e.message ? e.message : e));
  });
}

/** Get company IDs the authenticated user can access (for company-scoped record access). */
async function getCompanyIdsForAuthenticatedUser(req) {
    if (!req.user?.id) return [];
    const user = await usersService.getUserById(req.user.id);
    return user ? companiesService.getCompanyIdsForUser(user) : [];
}

/** Admin sees full product rows (cost, etc.); storefront users get sanitized JSON. */
async function getPublicProductApiAccess(req) {
    if (!req.user?.id) {
        return { isAdmin: false, isApprovedB2B: false, companyId: null };
    }
    if (await usersService.isAdmin(req.user.id)) {
        return { isAdmin: true, isApprovedB2B: false, companyId: null };
    }
    const user = await usersService.getUserById(req.user.id);
    const companyId = user ? await companiesService.getCompanyIdForUser(user) : null;
    return {
        isAdmin: false,
        isApprovedB2B: !!(user && user.is_approved),
        companyId,
    };
}

/** @returns {boolean} true if response was sent */
function respondCommerceCanonicalError(err, res) {
  if (err && err.name === 'MissingSellableProductError') {
    res.status(422).json({
      error: err.message,
      code: 'MISSING_SELLABLE_PRODUCT',
      catalog_product_id: err.canonicalProductId,
    });
    return true;
  }
  if (err && err.name === 'MissingCanonicalProductIdError') {
    res.status(422).json({
      error: err.message,
      code: 'MISSING_CANONICAL_PRODUCT_ID',
      context: err.context,
    });
    return true;
  }
  if (err && err.name === 'MissingVariantCanonicalProductIdError') {
    res.status(422).json({
      error: err.message,
      code: 'MISSING_VARIANT_CANONICAL_PRODUCT_ID',
      context: err.context,
      size: err.size,
    });
    return true;
  }
  if (err && err.name === 'CatalogV2ProductMappingError') {
    res.status(422).json({
      error: err.message,
      code: 'CATALOG_V2_PRODUCT_MAPPING_FAILED',
      catalogos_product_id: err.catalogosProductId,
    });
    return true;
  }
  if (err && err.name === 'InvalidCatalogV2ProductIdError') {
    res.status(err.statusCode || 422).json({
      error: err.message,
      code: err.typedCode || 'INVALID_CATALOG_PRODUCT_ID',
      context: err.context,
      product_id: err.product_id,
    });
    return true;
  }
  return false;
}

/**
 * Same shipping resolution as checkout/order routes: saved ship-to wins; else validated custom address.
 * @returns {Promise<{ ok: true, finalShippingAddress: object } | { ok: false, status: number, body: object }>}
 */
async function resolveFinalShippingAddressForCheckout(companyIds, userId, ship_to_id, shipping_address) {
    let finalShippingAddress = null;
    if (ship_to_id) {
        const shipTos = await dataService.getShipToByCompanyId(companyIds, userId);
        const shipTo = shipTos.find((s) => s.id == ship_to_id);
        if (shipTo) {
            finalShippingAddress = addressValidation.normalizeAddress({
                full_name: shipTo.label || 'Ship-to',
                address_line1: shipTo.address,
                city: shipTo.city,
                state: shipTo.state,
                zip_code: shipTo.zip,
            });
        }
    }
    if (!finalShippingAddress) {
        const addressData = typeof shipping_address === 'object' && shipping_address !== null ? shipping_address : null;
        if (!addressData) {
            return {
                ok: false,
                status: 400,
                body: {
                    error: 'Shipping address is required',
                    field_errors: { shipping_address: 'Please provide a shipping address' },
                    code: 'SHIPPING_ADDRESS_REQUIRED',
                },
            };
        }
        const validation = addressValidation.validateAddress(addressData);
        if (!validation.valid) {
            return {
                ok: false,
                status: 400,
                body: {
                    error: addressValidation.getErrorMessage(validation),
                    field_errors: addressValidation.getErrorsByField(validation),
                    code: 'SHIPPING_ADDRESS_INVALID',
                },
            };
        }
        finalShippingAddress = addressValidation.normalizeAddress(addressData);
    }
    return { ok: true, finalShippingAddress };
}

/**
 * When the client sends cart_lines[], each canonical_product_id must match the server cart’s
 * catalog_v2 id (same order as persisted cart). Totals still come from the server cart only.
 * Each id must exist in catalog_v2.catalog_products (not catalogos.products.id alone).
 * @returns {Promise<boolean>} false if res was already sent
 */
async function assertCheckoutCartLinesMatchBody(cartItems, body, res) {
    const { assertCatalogV2ProductIdForCommerce } = require('./lib/catalog-v2-product-guard');
    const cart_lines = body && body.cart_lines;
    if (!Array.isArray(cart_lines) || cart_lines.length === 0) return true;
    if (cart_lines.length !== cartItems.length) {
        res.status(400).json({
            error: 'cart_lines length does not match server cart.',
            code: 'CHECKOUT_CART_LINES_MISMATCH',
        });
        return false;
    }
    for (let i = 0; i < cartItems.length; i++) {
        const expected = normalizeCanonicalUuidInput(resolveLineCatalogProductId(cartItems[i]));
        const got = normalizeCanonicalUuidInput(cart_lines[i].canonical_product_id);
        if (!got || !expected || got !== expected) {
            res.status(400).json({
                error:
                    'cart_lines canonical_product_id does not match server cart. Expected catalog_v2.catalog_products.id per line.',
                code: 'CHECKOUT_CART_LINES_MISMATCH',
                line_index: i,
            });
            return false;
        }
        try {
            await assertCatalogV2ProductIdForCommerce(got, 'checkout_cart_lines');
        } catch (e) {
            if (respondCommerceCanonicalError(e, res)) return false;
            throw e;
        }
    }
    return true;
}

/** Load cart and run canonical + availability checks. Sends response and returns null on failure. */
async function loadAndValidateCartForCheckout(cartKey, res, contextLabel) {
    const cartItems = await dataService.getCart(cartKey);
    if (cartItems.length === 0) {
        res.status(400).json({ error: 'Cart is empty' });
        return null;
    }
    try {
        await ensureCommerceLinesHaveCanonical(cartItems, contextLabel);
    } catch (e) {
        if (respondCommerceCanonicalError(e, res)) return null;
        throw e;
    }
    const missing = [];
    for (const item of cartItems) {
        const listingId = resolveCartLineListingProductId(item);
        const product = await productsService.getProductById(listingId || item.product_id);
        if (!product || !product.in_stock) missing.push(item);
    }
    if (missing.length > 0) {
        res.status(400).json({
            error: 'Some items in your cart are no longer available. Please update your cart.',
            unavailable_product_ids: [...new Set(missing.map((m) => m.product_id))],
        });
        return null;
    }
    const avail = await inventory.checkAvailability(cartItems);
    if (!avail.ok) {
        const first = avail.insufficient[0];
        const idLabel = first.canonical_product_id || 'unknown';
        res.status(400).json({
            error: `Insufficient stock for one or more items. Catalog product ${idLabel}: need ${first.needed}, available ${first.available}.`,
            insufficient: avail.insufficient,
        });
        return null;
    }
    return cartItems;
}

/**
 * Resolve order for PaymentIntent webhooks: prefer orders.stripe_payment_intent_id;
 * legacy fallback when metadata.order_id exists and the row has no PI yet.
 */
async function resolveOrderForStripePaymentIntent(pi) {
  const piId = pi && pi.id;
  if (!piId) return { order: null, reason: 'no_pi_id' };
  const byPi = await dataService.getOrderByStripePaymentIntentId(piId);
  if (byPi) return { order: byPi, reason: null };
  const metaOid = pi.metadata && pi.metadata.order_id;
  if (!metaOid) return { order: null, reason: 'no_order_for_pi' };
  const byMeta = await dataService.getOrderByIdAdmin(metaOid);
  if (!byMeta) return { order: null, reason: 'metadata_order_missing' };
  const storedPi = byMeta.stripe_payment_intent_id && String(byMeta.stripe_payment_intent_id).trim();
  if (!storedPi) return { order: byMeta, reason: null };
  if (storedPi === piId) return { order: byMeta, reason: null };
  return { order: null, reason: 'order_pi_mismatch', conflictingOrderId: byMeta.id };
}

// Middleware (increase limit for large CSV imports)
const bodyLimit = '50mb';
app.use(cors());

// Stripe webhook needs raw body for signature verification (must be before express.json).
// PRODUCTION HARDENED: Includes idempotency, structured logging, and comprehensive error handling.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const startTime = Date.now();
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    // Reject if Stripe not configured
    if (!webhookSecret || !stripe) {
        paymentLog.webhookRejected('stripe_not_configured', sig);
        res.status(200).send();
        return;
    }
    
    // Verify webhook signature
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        paymentLog.webhookRejected('signature_verification_failed', sig);
        res.status(400).send('Webhook signature verification failed');
        return;
    }
    
    const eventId = event.id;
    const eventType = event.type;
    paymentLog.webhookReceived(eventId, eventType);
    paymentLog.webhookVerified(eventId, eventType);
    
    // Idempotency check - skip if already processed
    try {
        const isDuplicate = await webhookIdempotency.isDuplicateEvent(eventId);
        if (isDuplicate) {
            paymentLog.webhookSkipped(eventId, eventType, 'duplicate_event', null);
            res.status(200).send();
            return;
        }
    } catch (idempotencyErr) {
        // Continue processing if idempotency check fails
        console.error('[Stripe] Idempotency check error:', idempotencyErr.message);
    }

    const pi = event.data.object;
    let webhookOrderId = null;

    try {
        // ====== PAYMENT SUCCEEDED ======
        if (eventType === 'payment_intent.succeeded') {
            const { order: ord, reason: resolveReason, conflictingOrderId } = await resolveOrderForStripePaymentIntent(pi);

            if (resolveReason === 'order_pi_mismatch') {
                paymentLog.logError('stripe.critical_pi_order_mismatch', new Error('metadata order does not own this PaymentIntent'), {
                    pi_id: pi.id,
                    conflicting_order_id: conflictingOrderId,
                });
                webhookOrderId = conflictingOrderId || null;
                await webhookIdempotency.markEventProcessed(eventId, eventType, webhookOrderId, 'processed');
                paymentLog.webhookProcessed(eventId, eventType, webhookOrderId, Date.now() - startTime);
                res.status(200).send();
                return;
            }

            if (!ord) {
                paymentLog.webhookSkipped(eventId, eventType, resolveReason || 'order_not_found', null);
                await webhookIdempotency.markEventProcessed(eventId, eventType, null, 'skipped');
                paymentLog.webhookProcessed(eventId, eventType, null, Date.now() - startTime);
                res.status(200).send();
                return;
            }

            webhookOrderId = ord.id;

            if (ord.status !== 'pending_payment') {
                paymentLog.webhookSkipped(eventId, eventType, 'order_not_pending_payment', ord.id);
                await webhookIdempotency.markEventProcessed(eventId, eventType, ord.id, 'processed');
                paymentLog.webhookProcessed(eventId, eventType, ord.id, Date.now() - startTime);
                res.status(200).send();
                return;
            }

            const expectedCents = Math.round(Number(ord.total) * 100);
            const receivedCents = Number(
                typeof pi.amount_received === 'number' ? pi.amount_received : pi.amount
            );
            const currency = String(pi.currency || '').toLowerCase();
            if (receivedCents !== expectedCents || currency !== 'usd') {
                paymentLog.logError('stripe.critical_payment_amount_mismatch', new Error('Stripe amount/currency does not match order'), {
                    order_id: ord.id,
                    order_number: ord.order_number,
                    pi_id: pi.id,
                    amount_received: receivedCents,
                    expected_cents: expectedCents,
                    currency: pi.currency,
                    order_total: ord.total,
                });
                await dataService.flagPaymentIntegrityHold(
                    ord.id,
                    JSON.stringify({
                        reason: 'amount_or_currency_mismatch',
                        payment_intent_id: pi.id,
                        amount_received: receivedCents,
                        expected_cents: expectedCents,
                        currency: pi.currency,
                    })
                );
                await webhookIdempotency.markEventProcessed(eventId, eventType, ord.id, 'processed');
                paymentLog.webhookProcessed(eventId, eventType, ord.id, Date.now() - startTime);
                res.status(200).send();
                return;
            }

            await dataService.updateOrderStatus(ord.id, 'pending');
            paymentLog.orderStatusUpdated(ord.id, ord.order_number, 'pending_payment', 'pending');
            paymentLog.paymentIntentSucceeded(pi.id, ord.id, ord.order_number);
            schedulePricingTierReevaluation(ord.user_id, 'post_order');

            try {
                await dataService.updateOrder(ord.id, { payment_confirmed_at: new Date().toISOString() });
            } catch (_) { /* non-fatal */ }

            try {
                const user = await usersService.getUserById(ord.user_id);
                if (user && user.email) {
                    const emailContent = emailTemplates.paymentSuccess(ord, user);
                    await dispatchEmail({
                        to: user.email,
                        subject: emailContent.subject,
                        text: emailContent.text,
                        html: emailContent.html,
                        emailType: 'payment_confirmed',
                        orderId: ord.id,
                        orderNumber: ord.order_number,
                    });
                }
            } catch (emailErr) {
                paymentLog.emailFailed(ord.id, ord.order_number, 'payment_confirmed', emailErr);
                paymentLog.adminEmailAlert({
                    severity: 'error',
                    email_type: 'payment_confirmed',
                    order_id: ord.id,
                    order_number: ord.order_number,
                    error_message: emailErr.message || String(emailErr),
                    note: 'exception_before_or_during_dispatch',
                });
            }

            await webhookIdempotency.markEventProcessed(eventId, eventType, ord.id, 'processed');
            paymentLog.webhookProcessed(eventId, eventType, ord.id, Date.now() - startTime);
            res.status(200).send();
            return;
        }

        // ====== PAYMENT FAILED ======
        if (eventType === 'payment_intent.payment_failed') {
            const { order: ord } = await resolveOrderForStripePaymentIntent(pi);
            const orderId = ord ? ord.id : null;
            webhookOrderId = orderId;
            paymentLog.paymentIntentFailed(pi.id, orderId, pi.last_payment_error?.message || 'unknown');

            if (orderId) {
                if (ord.status === 'pending_payment') {
                    const needRelease =
                        ord.inventory_reserved_at &&
                        !ord.inventory_released_at &&
                        !ord.inventory_deducted_at;
                    if (needRelease) {
                        await inventory.tryReleaseReservedStockForNonFulfillment(orderId);
                        paymentLog.inventoryReleased(orderId, 'payment_failed');
                    }

                    await dataService.updateOrderStatus(orderId, 'payment_failed');
                    paymentLog.orderStatusUpdated(orderId, ord.order_number, 'pending_payment', 'payment_failed');

                    try {
                        const user = await usersService.getUserById(ord.user_id);
                        if (user && user.email) {
                            const emailContent = emailTemplates.paymentFailed(ord, user);
                            await dispatchEmail({
                                to: user.email,
                                subject: emailContent.subject,
                                text: emailContent.text,
                                html: emailContent.html,
                                emailType: 'payment_failed',
                                orderId,
                                orderNumber: ord.order_number,
                            });
                        }
                    } catch (emailErr) {
                        paymentLog.emailFailed(orderId, ord.order_number, 'payment_failed', emailErr);
                        paymentLog.adminEmailAlert({
                            severity: 'error',
                            email_type: 'payment_failed',
                            order_id: orderId,
                            order_number: ord.order_number,
                            error_message: emailErr.message || String(emailErr),
                            note: 'exception_before_or_during_dispatch',
                        });
                    }
                } else {
                    paymentLog.webhookSkipped(eventId, eventType, 'order_not_pending_payment', orderId);
                }
            }

            await webhookIdempotency.markEventProcessed(eventId, eventType, orderId, 'processed');
            paymentLog.webhookProcessed(eventId, eventType, orderId, Date.now() - startTime);
            res.status(200).send();
            return;
        }

        // ====== PAYMENT CANCELED ======
        if (eventType === 'payment_intent.canceled') {
            const { order: ord } = await resolveOrderForStripePaymentIntent(pi);
            const orderId = ord ? ord.id : null;
            webhookOrderId = orderId;
            paymentLog.paymentIntentCanceled(pi.id, orderId);

            if (orderId) {
                if (ord.status === 'pending_payment') {
                    const needRelease =
                        ord.inventory_reserved_at &&
                        !ord.inventory_released_at &&
                        !ord.inventory_deducted_at;
                    if (needRelease) {
                        await inventory.tryReleaseReservedStockForNonFulfillment(orderId);
                        paymentLog.inventoryReleased(orderId, 'payment_canceled');
                    }
                    await dataService.updateOrderStatus(orderId, 'cancelled');
                    paymentLog.orderStatusUpdated(orderId, ord.order_number, 'pending_payment', 'cancelled');
                } else {
                    paymentLog.webhookSkipped(eventId, eventType, 'order_not_pending_payment', orderId);
                }
            }

            await webhookIdempotency.markEventProcessed(eventId, eventType, orderId, 'processed');
            paymentLog.webhookProcessed(eventId, eventType, orderId, Date.now() - startTime);
            res.status(200).send();
            return;
        }

        // Unhandled event type - acknowledge but don't process
        await webhookIdempotency.markEventProcessed(eventId, eventType, null, 'skipped');
        paymentLog.webhookSkipped(eventId, eventType, 'unhandled_event_type', null);
        res.status(200).send();
    } catch (err) {
        // Return 500 on error so Stripe retries
        paymentLog.webhookError(eventId, eventType, err);
        await webhookIdempotency.markEventProcessed(eventId, eventType, webhookOrderId, 'error');
        res.status(500).send('Webhook processing failed');
    }
});

app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
// Note: express.static is registered later, after all API routes, so /api/* never serves static files

// API rate limit: 200 requests per 15 minutes per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', apiLimiter);

// Supabase health (registered first so never hit by catch-all; no auth for diagnostics)
// In production, returns minimal payload to avoid leaking config paths
app.get('/api/admin/supabase/health', async (req, res) => {
    const minimal = process.env.NODE_ENV === 'production';
    const payload = minimal ? { ok: false } : {
        ok: false,
        cwd: process.cwd(),
        envFilePath: path.join(__dirname, '.env'),
        supabaseUrlSet: !!process.env.SUPABASE_URL,
        serviceRoleSet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    try {
        if (!isSupabaseAdminConfigured()) {
            payload.error = minimal ? 'Not configured' : 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set';
            return res.status(200).json(payload);
        }
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.schema('gc_commerce').from('sellable_products').select('id').limit(1);
        if (error) {
            payload.error = minimal ? 'DB error' : error.message;
            return res.status(200).json(payload);
        }
        payload.ok = true;
        if (!minimal) payload.productsReachable = true;
        return res.json(payload);
    } catch (e) {
        payload.error = minimal ? 'Check failed' : ((e && e.message) || 'Supabase check failed');
        return res.status(200).json(payload);
    }
});
console.log('[routes] health: /api/admin/supabase/health registered');

// AI routes: stricter limit per IP (and per user when authenticated)
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Too many AI requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const uid = req.user && req.user.id ? String(req.user.id) : '';
        const ip = (req.ip || req.connection?.remoteAddress || 'unknown').trim();
        return uid ? `ai:user:${uid}` : `ai:ip:${ip}`;
    },
});

// Stricter limit for auth and contact to prevent abuse
const authContactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const leadCaptureLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many lead submissions from this network. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Serve CSV template file
app.get('/products-template.csv', (req, res) => {
    const csvPath = path.join(__dirname, 'products-template.csv');
    if (fs.existsSync(csvPath)) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
        res.sendFile(csvPath);
    } else {
        res.status(404).send('Template file not found');
    }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            const isExpired = err.name === 'TokenExpiredError';
            return res.status(isExpired ? 401 : 403).json({ error: isExpired ? 'Session expired' : 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Optional auth (must call next() only after verify completes so req.user is set for cart routes)
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return next();
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err) req.user = user;
        next();
    });
};

// ============ AUTH ROUTES ============

app.post('/api/auth/register', authContactLimiter, async (req, res) => {
    try {
        const { company_name, email, password, contact_name, phone, address, city, state, zip, cases_or_pallets, allow_free_upgrades } = req.body;
        const existing = await usersService.getUserByEmail(email);
        if (existing) return res.status(400).json({ error: 'Email already registered' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await usersService.createUser({
            company_name,
            email,
            password_hash: hashedPassword,
            plain_password: password,
            contact_name,
            phone: phone || '',
            address: address || '',
            city: city || '',
            state: state || '',
            zip: zip || '',
            cases_or_pallets: (cases_or_pallets || '').toString().trim() || '',
            allow_free_upgrades: !!allow_free_upgrades,
            payment_terms: 'credit_card',
            is_approved: 0,
            discount_tier: 'standard'
        });
        res.json({ success: true, message: 'Account created! Pending approval for B2B pricing.', userId: newUser.id });
    } catch (error) {
        console.error('[POST /api/auth/register]', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', authContactLimiter, async (req, res) => {
    try {
        const email = (req.body.email || '').toString().trim();
        const password = (req.body.password != null && req.body.password !== '') ? String(req.body.password).trim() : '';
        if (!email || !password) return res.status(400).json({ error: 'Please enter email and password.' });
        const user = await usersService.getUserByEmail(email);
        if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
        const validPassword = await bcrypt.compare(password, user.password || user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Invalid email or password.' });
        const authSubject = String(user.id);
        const token = jwt.sign(
            { id: authSubject, email: user.email, company: user.company_name, approved: user.is_approved },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        const isAdminUser = await usersService.isAdmin(authSubject);
        let company_net_terms = null;
        try {
            company_net_terms = await netTermsService.getCommercialSnapshotForUserId(user.id);
        } catch (e) {
            console.error('[login net_terms snapshot]', e.message || e);
        }
        const loginUser = await attachPricingTierPresentation({
            id: authSubject,
            company_name: user.company_name,
            email: user.email,
            contact_name: user.contact_name,
            is_approved: user.is_approved,
            discount_tier: user.discount_tier,
            pricing_tier_source: user.pricing_tier_source,
        });
        res.json({
            success: true,
            token,
            user: {
                ...loginUser,
                is_admin: isAdminUser,
                company_net_terms,
            },
        });
    } catch (error) {
        console.error('[POST /api/auth/login]', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const isAdminUser = await usersService.isAdmin(user.id);
        const { password, password_hash, ...safeUser } = user;
        let company_net_terms = null;
        try {
            company_net_terms = await netTermsService.getCommercialSnapshotForUserId(user.id);
        } catch (e) {
            console.error('[GET /api/auth/me net_terms]', e.message || e);
        }
        const presented = await attachPricingTierPresentation(safeUser);
        res.json({ ...presented, is_admin: isAdminUser, company_net_terms });
    } catch (err) {
        console.error('[GET /api/auth/me]', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ============ ACCOUNT: NET TERMS APPLICATION ============

app.post('/api/account/net-terms-application', authenticateToken, async (req, res) => {
    try {
        const application = await netTermsService.submitApplication(req.user.id, req.body || {});
        res.status(201).json({ success: true, application });
    } catch (err) {
        const code = err.statusCode || 500;
        console.error('[POST /api/account/net-terms-application]', err);
        res.status(code).json({ error: err.message || 'Failed to submit application' });
    }
});

app.get('/api/account/net-terms-application', authenticateToken, async (req, res) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const companyId = await companiesService.getCompanyIdForUser(user);
        let application = null;
        if (companyId != null) {
            application = await netTermsService.getLatestApplicationForCompany(companyId);
        }
        const company_net_terms = await netTermsService.getCommercialSnapshotForUserId(req.user.id);
        res.json({ application, company_net_terms });
    } catch (err) {
        console.error('[GET /api/account/net-terms-application]', err);
        res.status(500).json({ error: err.message || 'Failed to load application' });
    }
});

// ============ CONTACT ============

app.post('/api/contact', authContactLimiter, async (req, res) => {
    try {
        const { name, email, company, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required.' });
        }
        const emailTrim = (email || '').toString().trim();
        const nameTrim = (name || '').toString().trim();
        const companyTrim = (company || '').toString().trim();
        const messageTrim = (message || '').toString().trim();
        if (!emailTrim || !nameTrim || !messageTrim) {
            return res.status(400).json({ error: 'Name, email, and message are required.' });
        }
        await dataService.createContactMessage({ name: nameTrim, email: emailTrim, company: companyTrim, message: messageTrim });

        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'sales@glovecubs.com';
        const text = `New contact form submission from Glovecubs\n\nName: ${nameTrim}\nEmail: ${emailTrim}\nCompany: ${companyTrim}\n\nMessage:\n${messageTrim}`;
        await dispatchEmail({
            to: adminEmail,
            subject: `[Glovecubs] Contact from ${nameTrim}`,
            text,
            emailType: 'contact_form_admin',
            metadata: { contact_email: emailTrim },
        });
        await dispatchEmail({
            to: emailTrim,
            subject: 'We received your message - Glovecubs',
            text: `Hi ${nameTrim},\n\nThank you for contacting Glovecubs. We have received your message and will get back to you soon.\n\nBest regards,\nGlovecubs Team`,
            emailType: 'contact_form_user_receipt',
            alertOnFailure: false,
        });

        res.json({ success: true, message: 'Message sent! We\'ll get back to you soon.' });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to send message.' });
    }
});

// ============ PASSWORD RESET ============

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

app.post('/api/auth/forgot-password', authContactLimiter, async (req, res) => {
    try {
        const email = (req.body.email || '').toString().trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }
        const user = await usersService.getUserByEmail(email);
        if (!user) {
            return res.json({ success: true, message: 'If that email is on file, we sent a reset link.' });
        }
        const token = require('crypto').randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString();
        await dataService.deletePasswordResetTokensByUserId(user.id);
        await dataService.createPasswordResetToken(email, token, expiresAt, user.id);

        const baseUrl = process.env.DOMAIN || process.env.BASE_URL || 'http://localhost:3004';
        const resetLink = `${baseUrl}#reset-password?token=${token}`;
        const text = `Hi ${user.contact_name || 'there'},\n\nYou requested a password reset for your Glovecubs account. Click the link below to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.\n\nGlovecubs`;
        await dispatchEmail({
            to: user.email,
            subject: 'Reset your Glovecubs password',
            text,
            emailType: 'password_reset',
            metadata: { user_id: user.id },
        });
        return res.json({ success: true, message: 'If that email is on file, we sent a reset link.' });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Request failed.' });
    }
});

app.get('/api/auth/reset-check', async (req, res) => {
    const token = (req.query.token || '').toString().trim();
    if (!token) return res.status(400).json({ error: 'Token required.', valid: false });
    try {
        const row = await dataService.findPasswordResetToken(token);
        if (!row) return res.json({ valid: false, error: 'Invalid or expired link.' });
        return res.json({ valid: true });
    } catch (e) {
        return res.json({ valid: false, error: e.message || 'Invalid or expired link.' });
    }
});

app.post('/api/auth/reset-password', authContactLimiter, async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password || String(password).length < 6) {
            return res.status(400).json({ error: 'Valid token and password (min 6 characters) are required.' });
        }
        const row = await dataService.findPasswordResetToken(token);
        if (!row) {
            return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
        }
        const userId = row.user_id;
        const user = userId != null ? await usersService.getUserById(userId) : await usersService.getUserByEmail(row.email);
        if (!user) return res.status(400).json({ error: 'User not found.' });
        const password_hash = await bcrypt.hash(String(password).trim(), 10);
        await usersService.updateUser(user.id, { password_hash });
        await dataService.deletePasswordResetToken(token);
        return res.json({ success: true, message: 'Password updated. You can log in now.' });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Reset failed.' });
    }
});

// ============ PRODUCT ROUTES ============
// When inventory table has a record, use quantity_on_hand for availability (in_stock = qty > 0).
/** Map catalog_v2.catalog_products.id (public.inventory.canonical_product_id) -> inventory row. */
function inventoryRowsByCanonicalProductId(inventoryList) {
    const byCanon = new Map();
    for (const i of inventoryList || []) {
        const key = normalizeCanonicalUuidInput(i.canonical_product_id);
        if (key) byCanon.set(key, i);
    }
    return byCanon;
}

/** Join PDP/list products to inventory using catalog_v2 id only (productsService.attachCatalogV2ProductId). */
function applyInventoryToProducts(products, inventoryList) {
    const byCanon = inventoryRowsByCanonicalProductId(inventoryList);
    return products.map((p) => {
        const key = normalizeCanonicalUuidInput(p.catalog_v2_product_id);
        const inv = key ? byCanon.get(key) : null;
        if (inv == null) return p;
        const qty = inv.quantity_on_hand ?? 0;
        return { ...p, in_stock: qty > 0 ? 1 : 0, quantity_on_hand: qty };
    });
}

// Public config for front end (e.g. Stripe publishable key for checkout).
function buildPurchaseAnalyticsClientPayload(orderItems, order, user, paymentMethod) {
    const customer_type = user && (user.company_id != null || user.is_approved) ? 'company' : 'retail';
    return {
        order_id: order.id,
        order_number: order.order_number,
        total: Number(order.total),
        subtotal: Number(order.subtotal),
        shipping: Number(order.shipping),
        tax: Number(order.tax),
        discount: Number(order.discount) || 0,
        payment_method: paymentMethod,
        customer_type,
        items: (orderItems || []).map((i) => ({
            product_id: i.product_id,
            sku: i.sku || null,
            name: (i.name || i.product_name || '').toString().slice(0, 200),
            quantity: i.quantity,
            unit_price: Number(i.price != null ? i.price : i.unit_price) || 0,
        })),
    };
}

app.get('/api/config', async (req, res) => {
    try {
        const taxConfig = taxLib.getConfig();
        const shipCfg = await shippingPolicyService.resolveShippingConfigForCheckout();
        res.json({
            stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
            ga4MeasurementId: process.env.GA4_MEASUREMENT_ID || '',
            posthogKey: process.env.POSTHOG_KEY || '',
            posthogHost: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
            tax: {
                businessState: taxConfig.businessState,
                rate: taxConfig.taxRate,
                rateFormatted: taxLib.formatTaxRate(taxConfig.taxRate),
                configured: taxConfig.configured
            },
            shipping: {
                free_shipping_threshold: shipCfg.freeShippingThreshold,
                flat_shipping_rate: shipCfg.flatShippingRate,
                min_order_amount: shipCfg.minOrderAmount,
                shipping_policy_version_id: shipCfg.shipping_policy_version_id,
                policy_source: shipCfg.policy_source,
            },
        });
    } catch (e) {
        console.error('[GET /api/config]', e);
        res.status(500).json({ error: e.message || 'Config failed' });
    }
});

/** Public thresholds for cart/checkout (must match server order creation). */
app.get('/api/commerce/shipping-config', async (req, res) => {
    try {
        const c = await shippingPolicyService.resolveShippingConfigForCheckout();
        res.json({
            free_shipping_threshold: c.freeShippingThreshold,
            flat_shipping_rate: c.flatShippingRate,
            min_order_amount: c.minOrderAmount,
            shipping_policy_version_id: c.shipping_policy_version_id,
            policy_source: c.policy_source,
        });
    } catch (e) {
        console.error('[GET /api/commerce/shipping-config]', e);
        res.status(500).json({ error: e.message || 'Shipping config failed' });
    }
});

// Tax estimate for cart/checkout display
app.post('/api/tax/estimate', (req, res) => {
    const { subtotal, shipping_state, shipping } = req.body;
    
    if (typeof subtotal !== 'number' || subtotal < 0) {
        return res.status(400).json({ error: 'subtotal must be a non-negative number' });
    }
    
    const result = taxLib.calculateTax({
        subtotal,
        shippingState: shipping_state,
        shipping: shipping || 0
    });
    
    res.json({
        tax: result.tax,
        rate: result.rate,
        rateFormatted: taxLib.formatTaxRate(result.rate),
        taxable: result.taxable,
        reason: result.reason,
        summary: taxLib.getTaxSummary(result)
    });
});

// ============ EMAIL ADMIN ROUTES ============

// Get email configuration status (admin only)
app.get('/api/admin/email/status', authenticateToken, requireAdmin, async (req, res) => {
    const status = getEmailConfigStatus();
    let connectionStatus = { ok: false, error: 'Not tested' };
    
    if (status.configured && req.query.verify === 'true') {
        connectionStatus = await verifyEmailConnection();
    }
    
    res.json({
        ...status,
        connection: connectionStatus
    });
});

// Send test email (admin only)
app.post('/api/admin/email/test', authenticateToken, requireAdmin, async (req, res) => {
    const status = getEmailConfigStatus();
    
    if (!status.configured) {
        return res.status(400).json({
            error: 'Email not configured',
            missing: status.missing,
            instructions: 'Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables'
        });
    }
    
    const recipientEmail = req.body.to || req.body.email || req.user.email;
    if (!recipientEmail) {
        return res.status(400).json({ error: 'No recipient email specified' });
    }
    
    const emailContent = emailTemplates.testEmail(recipientEmail);
    const result = await dispatchEmail({
        to: recipientEmail,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
        emailType: 'test_email',
        alertOnFailure: false,
    });
    
    if (result.sent) {
        res.json({
            success: true,
            message: `Test email sent to ${recipientEmail}`,
            messageId: result.messageId
        });
    } else {
        res.status(500).json({
            success: false,
            error: result.error,
            message: 'Failed to send test email'
        });
    }
});

app.get('/api/products', optionalAuth, async (req, res) => {
    try {
        const { products: rawProducts, total } = await productsService.getProducts({
            search: req.query.search,
            category: req.query.category,
            brand: req.query.brand,
            material: req.query.material,
            powder: req.query.powder,
            thickness: req.query.thickness,
            size: req.query.size,
            color: req.query.color,
            grade: req.query.grade,
            useCase: req.query.useCase,
            page: req.query.page || 1,
            limit: Math.min(parseInt(req.query.limit, 10) || 100, 100)
        });
        let products = rawProducts || [];

    // Search filter first so it runs on full catalog
    if (req.query.search && String(req.query.search).trim()) {
        const search = String(req.query.search).trim().toLowerCase();
        products = products.filter(p => {
            const name = (p.name || '').toLowerCase();
            const description = (p.description || '').toLowerCase();
            const sku = (p.sku || '').toLowerCase();
            const brand = (p.brand || '').toLowerCase();
            const material = (p.material || '').toLowerCase();
            const color = (p.color || '').toLowerCase();
            const useCase = (p.useCase || '').toLowerCase();
            const certifications = (p.certifications || '').toLowerCase();
            return name.includes(search) ||
                   description.includes(search) ||
                   sku.includes(search) ||
                   brand.includes(search) ||
                   material.includes(search) ||
                   color.includes(search) ||
                   useCase.includes(search) ||
                   certifications.includes(search);
        });
    }

    // Category filter (single value)
    if (req.query.category) {
        products = products.filter(p => p.category === req.query.category);
    }
    
    // Brand filter (single value) — case-insensitive so "Hospeco" matches "HOSPECO" etc.
    if (req.query.brand) {
        const brandQ = (req.query.brand || '').trim().toLowerCase();
        if (brandQ) products = products.filter(p => (p.brand || '').trim().toLowerCase() === brandQ);
    }
    
    // Material filter (multiple values possible); product.material can be comma-separated
    if (req.query.material) {
        const materials = Array.isArray(req.query.material) ? req.query.material : [req.query.material];
        const materialSet = new Set(materials.map(m => (m || '').trim().toLowerCase()));
        products = products.filter(p => {
            const productMaterials = (p.material || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
            return productMaterials.some(m => materialSet.has(m)) || (productMaterials.length === 0 && (p.material || '').trim() && materialSet.has((p.material || '').trim().toLowerCase()));
        });
    }
    
    // Powder filter (multiple values possible)
    if (req.query.powder) {
        const powders = Array.isArray(req.query.powder) ? req.query.powder : [req.query.powder];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '')).toLowerCase();
            return powders.some(powder => {
                const powderLower = powder.toLowerCase();
                if (powderLower === 'powder-free') {
                    return nameDesc.includes('powder-free') || nameDesc.includes('powder free') || nameDesc.includes('powderfree');
                } else if (powderLower === 'powdered') {
                    return nameDesc.includes('powdered') && !nameDesc.includes('powder-free') && !nameDesc.includes('powder free');
                }
                return false;
            });
        });
    }
    
    // Thickness filter (multiple values possible)
    if (req.query.thickness) {
        const thicknesses = Array.isArray(req.query.thickness) ? req.query.thickness : [req.query.thickness];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.thickness || '')).toLowerCase();
            return thicknesses.some(t => {
                if (t === '7+') {
                    return nameDesc.includes('7 mil') || nameDesc.includes('8 mil') || nameDesc.includes('9 mil') || nameDesc.includes('10 mil');
                }
                return nameDesc.includes(t + ' mil') || (p.thickness && p.thickness.toString() === t);
            });
        });
    }
    
    // Size filter (multiple values possible)
    if (req.query.size) {
        const sizes = Array.isArray(req.query.size) ? req.query.size : [req.query.size];
        products = products.filter(p => {
            const productSizes = (p.sizes || '').split(',').map(s => s.trim().toUpperCase());
            return sizes.some(s => productSizes.includes(s.toUpperCase()));
        });
    }
    
    // Color filter (multiple values possible)
    if (req.query.color) {
        const colors = Array.isArray(req.query.color) ? req.query.color : [req.query.color];
        products = products.filter(p => {
            const productColor = (p.color || '').toLowerCase();
            return colors.some(c => productColor.includes(c.toLowerCase()));
        });
    }
    
    // Grade filter (multiple values possible)
    if (req.query.grade) {
        const grades = Array.isArray(req.query.grade) ? req.query.grade : [req.query.grade];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.grade || '')).toLowerCase();
            return grades.some(g => {
                const gradeLower = g.toLowerCase();
                if (gradeLower.includes('medical') || gradeLower.includes('exam')) {
                    return nameDesc.includes('medical') || nameDesc.includes('exam') || nameDesc.includes('healthcare');
                } else if (gradeLower.includes('industrial')) {
                    return nameDesc.includes('industrial') || nameDesc.includes('heavy-duty') || nameDesc.includes('heavy duty');
                } else if (gradeLower.includes('food')) {
                    return nameDesc.includes('food') || nameDesc.includes('fda') || nameDesc.includes('food service');
                }
                return false;
            });
        });
    }
    
    // Use Case (Industries) filter (multiple values possible)
    if (req.query.useCase) {
        const industries = Array.isArray(req.query.useCase) ? req.query.useCase : [req.query.useCase];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.useCase || '') + ' ' + (p.industry || '')).toLowerCase();
            return industries.some(industry => {
                const industryLower = industry.toLowerCase();
                
                // Disposable Glove Industries
                if (industryLower === 'healthcare') {
                    return nameDesc.includes('healthcare') || nameDesc.includes('medical') || nameDesc.includes('exam') || nameDesc.includes('hospital');
                } else if (industryLower === 'food service') {
                    return nameDesc.includes('food service') || nameDesc.includes('foodservice') || nameDesc.includes('restaurant') || nameDesc.includes('catering');
                } else if (industryLower === 'food processing') {
                    return nameDesc.includes('food processing') || nameDesc.includes('foodprocessing') || nameDesc.includes('food plant') || nameDesc.includes('processing');
                } else if (industryLower === 'janitorial') {
                    return nameDesc.includes('janitorial') || nameDesc.includes('cleaning') || nameDesc.includes('custodial');
                } else if (industryLower === 'sanitation') {
                    return nameDesc.includes('sanitation') || nameDesc.includes('sanitary') || nameDesc.includes('hygiene');
                } else if (industryLower === 'laboratories') {
                    return nameDesc.includes('laboratory') || nameDesc.includes('lab') || nameDesc.includes('laboratories');
                } else if (industryLower === 'pharmaceuticals') {
                    return nameDesc.includes('pharmaceutical') || nameDesc.includes('pharma') || nameDesc.includes('drug') || nameDesc.includes('medication');
                } else if (industryLower === 'beauty & personal care' || industryLower.includes('beauty')) {
                    return nameDesc.includes('beauty') || nameDesc.includes('personal care') || nameDesc.includes('cosmetic') || nameDesc.includes('salon');
                } else if (industryLower === 'tattoo & body art' || industryLower.includes('tattoo')) {
                    return nameDesc.includes('tattoo') || nameDesc.includes('body art') || nameDesc.includes('bodyart');
                } else if (industryLower === 'automotive') {
                    return nameDesc.includes('automotive') || nameDesc.includes('auto') || nameDesc.includes('vehicle') || nameDesc.includes('mechanics') || nameDesc.includes('mechanical');
                } else if (industryLower === 'education') {
                    return nameDesc.includes('education') || nameDesc.includes('school') || nameDesc.includes('university') || nameDesc.includes('academic');
                } else if (industryLower === 'childcare') {
                    return nameDesc.includes('childcare') || nameDesc.includes('child care') || nameDesc.includes('daycare') || nameDesc.includes('preschool');
                } else if (industryLower === 'cannabis') {
                    return nameDesc.includes('cannabis') || nameDesc.includes('marijuana') || nameDesc.includes('hemp');
                }
                
                // Work Glove Industries
                else if (industryLower === 'construction') {
                    return nameDesc.includes('construction') || nameDesc.includes('contractor') || nameDesc.includes('building');
                } else if (industryLower.includes('trades') || industryLower.includes('electrician') || industryLower.includes('hvac') || industryLower.includes('plumbing')) {
                    return nameDesc.includes('electrician') || nameDesc.includes('electrical') || nameDesc.includes('hvac') || nameDesc.includes('plumbing') || nameDesc.includes('trade');
                } else if (industryLower === 'manufacturing') {
                    return nameDesc.includes('manufacturing') || nameDesc.includes('factory') || nameDesc.includes('production');
                } else if (industryLower === 'industrial') {
                    return nameDesc.includes('industrial') || nameDesc.includes('heavy-duty') || nameDesc.includes('heavy duty');
                } else if (industryLower === 'warehousing') {
                    return nameDesc.includes('warehouse') || nameDesc.includes('warehousing') || nameDesc.includes('storage');
                } else if (industryLower === 'logistics') {
                    return nameDesc.includes('logistics') || nameDesc.includes('shipping') || nameDesc.includes('freight');
                } else if (industryLower === 'distribution') {
                    return nameDesc.includes('distribution') || nameDesc.includes('fulfillment') || nameDesc.includes('warehouse');
                } else if (industryLower === 'transportation') {
                    return nameDesc.includes('transportation') || nameDesc.includes('transit') || nameDesc.includes('trucking');
                } else if (industryLower === 'utilities') {
                    return nameDesc.includes('utility') || nameDesc.includes('utilities') || nameDesc.includes('power line') || nameDesc.includes('powerline');
                } else if (industryLower === 'energy') {
                    return nameDesc.includes('energy') || nameDesc.includes('power') || nameDesc.includes('oil') || nameDesc.includes('gas');
                } else if (industryLower === 'agriculture') {
                    return nameDesc.includes('agriculture') || nameDesc.includes('farming') || nameDesc.includes('farm') || nameDesc.includes('agricultural');
                } else if (industryLower === 'landscaping') {
                    return nameDesc.includes('landscaping') || nameDesc.includes('landscape') || nameDesc.includes('lawn care') || nameDesc.includes('gardening');
                } else if (industryLower === 'mining') {
                    return nameDesc.includes('mining') || nameDesc.includes('mine') || nameDesc.includes('quarry');
                } else if (industryLower === 'heavy industry') {
                    return nameDesc.includes('heavy industry') || nameDesc.includes('heavyindustry') || nameDesc.includes('steel') || nameDesc.includes('foundry');
                } else if (industryLower === 'public works') {
                    return nameDesc.includes('public works') || nameDesc.includes('publicworks') || nameDesc.includes('infrastructure');
                } else if (industryLower === 'municipal services') {
                    return nameDesc.includes('municipal') || nameDesc.includes('city') || nameDesc.includes('government');
                } else if (industryLower === 'waste management') {
                    return nameDesc.includes('waste management') || nameDesc.includes('wastemanagement') || nameDesc.includes('garbage') || nameDesc.includes('trash');
                } else if (industryLower === 'recycling') {
                    return nameDesc.includes('recycling') || nameDesc.includes('recycle') || nameDesc.includes('scrap');
                } else if (industryLower === 'environmental services') {
                    return nameDesc.includes('environmental') || nameDesc.includes('environment') || nameDesc.includes('hazmat') || nameDesc.includes('hazardous');
                }
                
                // Fallback: try exact match
                return nameDesc.includes(industryLower);
            });
        });
    }
    
    // Compliance/Certifications filter (multiple values possible)
    if (req.query.compliance) {
        const compliances = Array.isArray(req.query.compliance) ? req.query.compliance : [req.query.compliance];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.certifications || '')).toLowerCase();
            return compliances.some(c => {
                const cLower = c.toLowerCase();
                if (cLower.includes('fda')) {
                    return nameDesc.includes('fda') || nameDesc.includes('food and drug');
                } else if (cLower.includes('astm')) {
                    return nameDesc.includes('astm');
                } else if (cLower.includes('food safe')) {
                    return nameDesc.includes('food safe') || nameDesc.includes('food-safe') || nameDesc.includes('fda');
                } else if (cLower.includes('latex free')) {
                    return nameDesc.includes('latex-free') || nameDesc.includes('latex free') || nameDesc.includes('nitrile') || nameDesc.includes('vinyl');
                } else if (cLower.includes('chemo')) {
                    return nameDesc.includes('chemo') || nameDesc.includes('chemotherapy');
                } else if (cLower.includes('en 455')) {
                    return nameDesc.includes('en 455') || nameDesc.includes('en455');
                } else if (cLower.includes('en 374')) {
                    return nameDesc.includes('en 374') || nameDesc.includes('en374');
                }
                return false;
            });
        });
    }
    
    // Cut Level filter (ANSI A1-A9) - matches name, description, certifications, cut_level
    if (req.query.cutLevel) {
        const cutLevels = Array.isArray(req.query.cutLevel) ? req.query.cutLevel : [req.query.cutLevel];
        products = products.filter(p => {
            const text = (p.name + ' ' + (p.description || '') + ' ' + (p.certifications || '') + ' ' + (p.cut_level || '')).toLowerCase();
            return cutLevels.some(cl => {
                const clLower = (cl || '').toLowerCase();
                return text.includes('cut level ' + clLower) || text.includes('ansi ' + clLower) || text.includes('cut ' + clLower) || text.includes(' a' + clLower + ' ') || text.includes('a' + clLower) || text.includes(clLower);
            });
        });
    }
    
    // Puncture Level filter (P1-P5)
    if (req.query.punctureLevel) {
        const levels = Array.isArray(req.query.punctureLevel) ? req.query.punctureLevel : [req.query.punctureLevel];
        products = products.filter(p => {
            const text = (p.name + ' ' + (p.description || '') + ' ' + (p.certifications || '') + ' ' + (p.puncture_level || '')).toLowerCase();
            return levels.some(l => text.includes(l.toLowerCase()) || text.includes('puncture ' + l.toLowerCase()));
        });
    }
    
    // Abrasion Level filter (1-4)
    if (req.query.abrasionLevel) {
        const levels = Array.isArray(req.query.abrasionLevel) ? req.query.abrasionLevel : [req.query.abrasionLevel];
        products = products.filter(p => {
            const text = (p.name + ' ' + (p.description || '') + ' ' + (p.certifications || '') + ' ' + (p.abrasion_level || '')).toLowerCase();
            return levels.some(l => text.includes('abrasion level ' + l) || text.includes('abrasion ' + l) || text.includes('level ' + l + ' abrasion'));
        });
    }
    
    // Flame Resistant filter
    if (req.query.flameResistant) {
        const vals = Array.isArray(req.query.flameResistant) ? req.query.flameResistant : [req.query.flameResistant];
        if (vals.some(v => (v || '').toLowerCase().includes('yes') || (v || '').toLowerCase().includes('flame'))) {
            products = products.filter(p => {
                const text = (p.name + ' ' + (p.description || '') + ' ' + (p.certifications || '') + ' ' + (p.flame_resistant || '')).toLowerCase();
                return text.includes('flame resist') || text.includes('flame-resist') || text.includes('fr ') || text.includes('nfpa ') || text.includes('astm f1506');
            });
        }
    }
    
    // Arc Rating filter (Category 1-4, cal ratings)
    if (req.query.arcLevel) {
        const levels = Array.isArray(req.query.arcLevel) ? req.query.arcLevel : [req.query.arcLevel];
        products = products.filter(p => {
            const text = (p.name + ' ' + (p.description || '') + ' ' + (p.certifications || '') + ' ' + (p.arc_level || '')).toLowerCase();
            return levels.some(l => {
                const lLower = l.toLowerCase();
                if (lLower.includes('cat')) return text.includes('category') || text.includes('cat ') || text.includes('arc');
                return text.includes(lLower) || text.includes('arc ' + lLower) || text.includes(lLower + ' cal');
            });
        });
    }
    
    // Warm / Cold Weather filter
    if (req.query.warmRating) {
        const ratings = Array.isArray(req.query.warmRating) ? req.query.warmRating : [req.query.warmRating];
        products = products.filter(p => {
            const text = (p.name + ' ' + (p.description || '') + ' ' + (p.warm_rating || '')).toLowerCase();
            return ratings.some(r => {
                const rLower = (r || '').toLowerCase();
                if (rLower.includes('insulat')) return text.includes('insulat');
                if (rLower.includes('winter')) return text.includes('winter') || text.includes('cold');
                if (rLower.includes('cold')) return text.includes('cold') || text.includes('winter') || text.includes('insulat');
                if (rLower.includes('heat')) return text.includes('heat') || text.includes('heated');
                return text.includes(rLower);
            });
        });
    }
    
    // Texture filter (multiple values possible)
    if (req.query.texture) {
        const textures = Array.isArray(req.query.texture) ? req.query.texture : [req.query.texture];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.texture || '')).toLowerCase();
            return textures.some(t => {
                const tLower = t.toLowerCase();
                if (tLower.includes('smooth')) {
                    return !nameDesc.includes('textured') && !nameDesc.includes('texture');
                } else if (tLower.includes('fingertip')) {
                    return nameDesc.includes('fingertip') || nameDesc.includes('finger tip');
                } else if (tLower.includes('fully textured')) {
                    return nameDesc.includes('fully textured') || nameDesc.includes('textured') && !nameDesc.includes('fingertip');
                }
                return false;
            });
        });
    }
    
    // Cuff Style filter (multiple values possible)
    if (req.query.cuffStyle) {
        const cuffStyles = Array.isArray(req.query.cuffStyle) ? req.query.cuffStyle : [req.query.cuffStyle];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.cuffStyle || '')).toLowerCase();
            return cuffStyles.some(cs => {
                const csLower = cs.toLowerCase();
                if (csLower.includes('beaded')) {
                    return nameDesc.includes('beaded');
                } else if (csLower.includes('non-beaded')) {
                    return !nameDesc.includes('beaded');
                } else if (csLower.includes('extended')) {
                    return nameDesc.includes('extended cuff') || nameDesc.includes('extended');
                }
                return false;
            });
        });
    }
    
    // Hand Orientation filter (multiple values possible)
    if (req.query.handOrientation) {
        const orientations = Array.isArray(req.query.handOrientation) ? req.query.handOrientation : [req.query.handOrientation];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.handOrientation || '')).toLowerCase();
            return orientations.some(o => {
                if (o.toLowerCase().includes('ambidextrous')) {
                    return nameDesc.includes('ambidextrous') || !nameDesc.includes('left') && !nameDesc.includes('right');
                }
                return false;
            });
        });
    }
    
    // Packaging filter (multiple values possible)
    if (req.query.packaging) {
        const packagings = Array.isArray(req.query.packaging) ? req.query.packaging : [req.query.packaging];
        products = products.filter(p => {
            const packQty = p.pack_qty || 0;
            const caseQty = p.case_qty || 0;
            return packagings.some(pkg => {
                if (pkg.includes('Box (100 ct)')) {
                    return packQty === 100;
                } else if (pkg.includes('Box (200–250 ct)')) {
                    return packQty >= 200 && packQty <= 250;
                } else if (pkg.includes('Case (1,000 ct)')) {
                    return caseQty === 1000;
                } else if (pkg.includes('Case (2,000+ ct)')) {
                    return caseQty >= 2000;
                }
                return false;
            });
        });
    }
    
    // Sterility filter (multiple values possible)
    if (req.query.sterility) {
        const sterilities = Array.isArray(req.query.sterility) ? req.query.sterility : [req.query.sterility];
        products = products.filter(p => {
            const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.sterility || '')).toLowerCase();
            return sterilities.some(s => {
                if (s.toLowerCase().includes('sterile')) {
                    return nameDesc.includes('sterile');
                } else if (s.toLowerCase().includes('non-sterile')) {
                    return !nameDesc.includes('sterile');
                }
                return false;
            });
        });
    }
    
    // Price range filter (per-box price)
    const priceMin = req.query.priceMin != null ? parseFloat(req.query.priceMin) : null;
    const priceMax = req.query.priceMax != null ? parseFloat(req.query.priceMax) : null;
    if (priceMin != null && !isNaN(priceMin)) {
        products = products.filter(p => (p.price || 0) >= priceMin);
    }
    if (priceMax != null && !isNaN(priceMax)) {
        products = products.filter(p => (p.price || 0) <= priceMax);
    }

    // Featured filter
    if (req.query.featured) {
        products = products.filter(p => p.featured === 1);
    }

    // Sorting: if search query present, use relevance sorting; otherwise sort by featured then name
    const searchQuery = req.query.search ? String(req.query.search).trim() : '';
    const sortParam = (req.query.sort || '').toLowerCase();
    
    if (searchQuery && (sortParam === 'relevance' || sortParam === '' || !sortParam)) {
        // Apply relevance scoring and sort by it
        products = sortByRelevance(products, searchQuery);
    } else if (sortParam === 'price_low') {
        products.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortParam === 'price_high') {
        products.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortParam === 'name_az') {
        products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortParam === 'name_za') {
        products.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sortParam === 'newest') {
        products.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else {
        // Default: featured first, then by name
        products.sort((a, b) => {
            if (a.featured !== b.featured) return (b.featured || 0) - (a.featured || 0);
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    // Apply inventory (in-app fishbowl): in_stock and quantity_on_hand from inventory table when present
    const inventory = await getInventoryForCatalogRoutes();
    products = applyInventoryToProducts(products, inventory);

    const access = await getPublicProductApiAccess(req);
    if (!access.isAdmin && access.companyId != null) {
        const ctx = await getPricingContext();
        products = products.map((p) => {
            const cost = p.cost != null && p.cost !== '' ? Number(p.cost) : (p.price != null ? Number(p.price) : 0);
            const margin = getEffectiveMargin(ctx, access.companyId, p.manufacturer_id);
            const sell = computeSellPrice(cost, margin);
            const fallback =
                p.list_price != null && !Number.isNaN(Number(p.list_price)) ? Number(p.list_price) : (p.price || 0);
            return { ...p, sell_price: Number.isNaN(sell) ? fallback : sell };
        });
    }

    if (access.isAdmin) {
        res.json(products);
    } else {
        res.json(
            sanitizeProductsArrayForPublicApi(products, {
                isAdmin: false,
                isApprovedB2B: access.isApprovedB2B,
            })
        );
    }
    } catch (err) {
        sendCatalogApiError(res, err, '[GET /api/products]');
    }
});

// SEO: slug from product name (or stored slug)
function productSlug(p) {
    const raw = (p.slug || p.name || '').toString().trim();
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '';
}

app.get('/api/products/:id', optionalAuth, async (req, res) => {
    try {
        let product = await productsService.getProductById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const inventory = await getInventoryForCatalogRoutes();
        const applied = applyInventoryToProducts([{ ...product }], inventory);
        product = applied[0] || product;
        const access = await getPublicProductApiAccess(req);
        if (!access.isAdmin && access.companyId != null) {
            const ctx = await getPricingContext();
            const cost = product.cost != null && product.cost !== '' ? Number(product.cost) : (product.price != null ? Number(product.price) : 0);
            const margin = getEffectiveMargin(ctx, access.companyId, product.manufacturer_id);
            const sell = computeSellPrice(cost, margin);
            const fallback =
                product.list_price != null && !Number.isNaN(Number(product.list_price))
                    ? Number(product.list_price)
                    : (product.price || 0);
            product.sell_price = Number.isNaN(sell) ? fallback : sell;
        }
        if (access.isAdmin) {
            res.json(product);
        } else {
            res.json(
                sanitizeProductForPublicApi(product, {
                    isAdmin: false,
                    isApprovedB2B: access.isApprovedB2B,
                    sellPrice: product.sell_price,
                })
            );
        }
    } catch (err) {
        sendCatalogApiError(res, err, '[GET /api/products/:id]');
    }
});

// SEO: get product by URL slug (e.g. black-nitrile-exam-gloves). Optional category/material to disambiguate.
app.get('/api/products/by-slug', optionalAuth, async (req, res) => {
    try {
        const slug = (req.query.slug || '').toString().trim().toLowerCase();
        const categorySegment = (req.query.category || '').toString().trim().toLowerCase();
        if (!slug) return res.status(400).json({ error: 'slug query parameter required' });
        let product = await productsService.getProductBySlug(slug, categorySegment);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const inventory = await getInventoryForCatalogRoutes();
        const applied = applyInventoryToProducts([{ ...product }], inventory);
        product = { ...(applied[0] || product), slug: product.slug || productsService.slugFromName(product.name) };
        const access = await getPublicProductApiAccess(req);
        if (!access.isAdmin && access.companyId != null) {
            const ctx = await getPricingContext();
            const cost = product.cost != null && product.cost !== '' ? Number(product.cost) : (product.price != null ? Number(product.price) : 0);
            const margin = getEffectiveMargin(ctx, access.companyId, product.manufacturer_id);
            const sell = computeSellPrice(cost, margin);
            const fallback =
                product.list_price != null && !Number.isNaN(Number(product.list_price))
                    ? Number(product.list_price)
                    : (product.price || 0);
            product.sell_price = Number.isNaN(sell) ? fallback : sell;
        }
        if (access.isAdmin) {
            res.json(product);
        } else {
            res.json(
                sanitizeProductForPublicApi(product, {
                    isAdmin: false,
                    isApprovedB2B: access.isApprovedB2B,
                    sellPrice: product.sell_price,
                })
            );
        }
    } catch (err) {
        sendCatalogApiError(res, err, '[GET /api/products/by-slug]');
    }
});

// SEO: list industries for landing pages (slug, title, description, useCase param)
// Routes: /industries/medical, janitorial, food-service, industrial, automotive (+ legacy slugs)
const SEO_INDUSTRIES = [
    { slug: 'medical', title: 'Medical & Healthcare Gloves', useCase: 'Healthcare', description: 'Exam and medical-grade gloves for healthcare facilities. Nitrile, latex-free, and sterile options.' },
    { slug: 'janitorial', title: 'Janitorial & Cleaning Gloves', useCase: 'Janitorial', description: 'Disposable and reusable work gloves for janitorial, custodial, and cleaning professionals. Bulk pricing, fast shipping.' },
    { slug: 'food-service', title: 'Food Service Gloves', useCase: 'Food Service', description: 'FDA-compliant gloves for restaurants, catering, and food service. Nitrile, vinyl, and polyethylene options.' },
    { slug: 'foodservice', title: 'Food Service Gloves', useCase: 'Food Service', description: 'FDA-compliant gloves for restaurants, catering, and food service. Nitrile, vinyl, and polyethylene options.' },
    { slug: 'hospitality', title: 'Hospitality Gloves', useCase: 'Food Service', description: 'Food-safe gloves for hospitality and back-of-house. Nitrile, vinyl, and case pricing for consistent supply.' },
    { slug: 'industrial', title: 'Industrial & Manufacturing Gloves', useCase: 'Manufacturing', description: 'Reusable work gloves for manufacturing, assembly, and industrial applications.' },
    { slug: 'manufacturing', title: 'Manufacturing & Industrial Gloves', useCase: 'Manufacturing', description: 'Reusable work gloves for manufacturing, assembly, and industrial applications.' },
    { slug: 'automotive', title: 'Automotive Gloves', useCase: 'Automotive', description: 'Mechanic and automotive gloves. Nitrile, impact, and cut-resistant styles.' },
    { slug: 'healthcare', title: 'Healthcare Gloves', useCase: 'Healthcare', description: 'Professional gloves for healthcare and clinical use. B2B pricing and bulk quantities.' },
    { slug: 'food-processing', title: 'Food Processing Gloves', useCase: 'Food Processing', description: 'Heavy-duty gloves for food processing and manufacturing. Cut-resistant and chemical-resistant options.' },
];

app.get('/api/seo/industries', (req, res) => {
    res.json(SEO_INDUSTRIES);
});

// SEO: single industry landing page data (products + meta)
app.get('/api/seo/industry/:slug', async (req, res) => {
    try {
        const slug = (req.params.slug || '').toString().trim().toLowerCase();
        const industry = SEO_INDUSTRIES.find(i => i.slug === slug);
        if (!industry) return res.status(404).json({ error: 'Industry not found' });
        const useCase = industry.useCase;
        let products = await productsService.getProductsForIndustry(useCase);
        products = products.filter(p => {
        const nameDesc = (p.name + ' ' + (p.description || '') + ' ' + (p.useCase || '') + ' ' + (p.industry || '')).toLowerCase();
        const industryLower = (useCase || '').toLowerCase();
        if (industryLower === 'healthcare') {
            return nameDesc.includes('healthcare') || nameDesc.includes('medical') || nameDesc.includes('exam') || nameDesc.includes('hospital');
        }
        if (industryLower === 'food service') {
            return nameDesc.includes('food service') || nameDesc.includes('foodservice') || nameDesc.includes('restaurant') || nameDesc.includes('catering');
        }
        if (industryLower === 'food processing') {
            return nameDesc.includes('food processing') || nameDesc.includes('foodprocessing') || nameDesc.includes('food plant') || nameDesc.includes('processing');
        }
        if (industryLower === 'janitorial') {
            return nameDesc.includes('janitorial') || nameDesc.includes('cleaning') || nameDesc.includes('custodial');
        }
        if (industryLower === 'manufacturing') {
            return nameDesc.includes('manufacturing') || nameDesc.includes('factory') || nameDesc.includes('production');
        }
        if (industryLower === 'automotive') {
            return nameDesc.includes('automotive') || nameDesc.includes('auto') || nameDesc.includes('vehicle') || nameDesc.includes('mechanics') || nameDesc.includes('mechanical');
        }
        return nameDesc.includes(industryLower);
    });
    products.sort((a, b) => (b.featured || 0) - (a.featured || 0) || (a.name || '').localeCompare(b.name || ''));
    res.json({ industry: { ...industry }, products });
    } catch (err) {
        sendCatalogApiError(res, err, '[GET /api/seo/industry/:slug]');
    }
});

// SEO: sitemap URLs (for generating sitemap.xml or crawlers)
app.get('/api/seo/sitemap-urls', async (req, res) => {
    try {
        const { products } = await productsService.getProducts({ limit: 10000 });
        const db = { products };
    const base = (process.env.DOMAIN || process.env.BASE_URL || 'https://glovecubs.com').replace(/\/$/, '');
    const pages = [
        { url: base + '/', priority: '1.0', changefreq: 'weekly' },
        { url: base + '/gloves/', priority: '0.9', changefreq: 'weekly' },
        { url: base + '/gloves/nitrile/', priority: '0.9', changefreq: 'weekly' },
        { url: base + '/gloves/vinyl/', priority: '0.9', changefreq: 'weekly' },
        { url: base + '/gloves/latex/', priority: '0.9', changefreq: 'weekly' },
        { url: base + '/gloves/disposable-gloves/', priority: '0.9', changefreq: 'weekly' },
        { url: base + '/gloves/work-gloves/', priority: '0.9', changefreq: 'weekly' }
    ];
    SEO_INDUSTRIES.forEach(ind => {
        pages.push({ url: base + '/industries/' + ind.slug + '/', priority: '0.8', changefreq: 'weekly' });
    });
    const { products: productList } = await productsService.getProducts({ limit: 10000 });
    (productList || []).forEach(p => {
        const slug = productSlug(p);
        if (!slug) return;
        const seg = (p.material || p.subcategory || 'gloves').toString().toLowerCase().replace(/\s+/g, '-');
        pages.push({ url: base + '/gloves/' + seg + '/' + slug + '/', priority: '0.7', changefreq: 'weekly' });
        const sizes = (p.sizes || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
        sizes.forEach(sz => {
            pages.push({ url: base + '/gloves/' + seg + '/' + slug + '/size/' + sz.toLowerCase().replace(/\s+/g, '-') + '/', priority: '0.6', changefreq: 'weekly' });
        });
    });
    res.json({ pages });
    } catch (err) {
        sendCatalogApiError(res, err, '[GET /api/seo/sitemap-urls]');
    }
});

// CSV import: Supabase (when configured) or JSON DB. Row-fault-tolerant; returns parsedRows, created, updated, failed, skipped, errorSamples.
app.post('/api/products/import-csv', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        let csvContent = req.body.csvContent;
        if (!csvContent) {
            return res.status(400).json({ error: 'CSV content is required' });
        }
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            return res.status(400).json({ error: 'CSV must have at least a header row and one data row' });
        }

        let parsedRows, created, updated, failed, skipped, deleted, withImage, errorSamples;

        const result = await importCsvToSupabase(csvContent);
        parsedRows = result.parsedRows;
        created = result.created;
        updated = result.updated;
        failed = result.failed;
        skipped = result.skipped;
        deleted = 0;
        withImage = 0;
        errorSamples = result.errorSamples || [];

        const msgParts = [
            parsedRows != null && `${parsedRows} row(s) in file`,
            created > 0 && `${created} created`,
            updated > 0 && `${updated} updated`,
            deleted > 0 && `${deleted} deleted`,
            skipped > 0 && `${skipped} skipped`,
            failed > 0 && `${failed} failed`
        ].filter(Boolean);
        const msg = msgParts.length ? msgParts.join('; ') : 'No changes';
        const success = failed === 0;
        const resBody = {
            success,
            parsedRows: parsedRows ?? 0,
            created,
            updated,
            failed,
            skipped,
            deleted,
            withImage,
            errorSamples: errorSamples.slice(0, 20),
            message: failed > 0 ? `Import finished with errors: ${msg}. Check Import Results for details.` : `Import complete: ${msg}.`
        };
        res.json(resBody);
    } catch (error) {
        console.error('CSV import error:', error);
        res.status(500).json({ error: error.message, errorSamples: [{ row: 0, message: error.message }] });
    }
});

// Update product images only from CSV (admin only) - simple 2-column: sku, image_url
app.post('/api/products/update-images-csv', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        let csvContent = req.body.csvContent;
        if (!csvContent) return res.status(400).json({ error: 'CSV content is required' });
        if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1);
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
        const firstLine = lines[0];
        const useSemicolon = firstLine.indexOf(';') !== -1 && firstLine.indexOf(',') === -1;
        const delimiter = useSemicolon ? ';' : ',';
        const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }
                } else if (char === delimiter && !inQuotes) {
                    result.push(current.trim().replace(/^"|"$/g, ''));
                    current = '';
                } else { current += char; }
            }
            result.push(current.trim().replace(/^"|"$/g, ''));
            return result;
        };
        const headers = parseCSVLine(lines[0]).map(h => (h || '').replace(/^"|"$/g, '').trim().replace(/^\ufeff/, '').toLowerCase());
        const iSku = headers.indexOf('sku');
        const iImage = Math.max(headers.indexOf('image_url'), headers.indexOf('image url'), headers.indexOf('imageurl'), headers.indexOf('image'), headers.indexOf('url'));
        if (iSku === -1 || iImage === -1) {
            return res.status(400).json({
                error: 'CSV must have columns: sku and image_url (or image url, image, url)',
                debug: { headers: parseCSVLine(lines[0]).map(h => (h || '').replace(/^"|"$/g, '').trim()), headersLower: headers }
            });
        }
        let updated = 0;
        for (let i = 1; i < lines.length; i++) {
            const rawValues = parseCSVLine(lines[i]);
            const values = rawValues.map(v => (v || '').replace(/^"|"$/g, '').trim());
            if (values.length <= iSku) continue;
            const sku = values[iSku] || '';
            if (!sku) continue;
            let imageUrl = (values[iImage] || '').trim();
            if (values.length > 2 && iImage >= 0) imageUrl = values.slice(iImage).join(',').trim();
            if (!imageUrl) continue;
            if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) imageUrl = '/' + imageUrl;
            const product = await productsService.getProductById(sku);
            if (product) {
                await productsService.updateProduct(product.id, { image_url: imageUrl });
                updated++;
            }
        }
        const resBody = { success: true, updated, message: `Updated images for ${updated} product(s).` };
        if (updated === 0 && lines.length > 1) {
            const firstValues = parseCSVLine(lines[1]).map(v => (v || '').replace(/^"|"$/g, '').trim());
            const { products: sample } = await productsService.getProducts({ limit: 3 });
            resBody.debug = {
                headers: parseCSVLine(lines[0]).map(h => (h || '').replace(/^"|"$/g, '').trim()),
                firstRowColumnCount: firstValues.length,
                firstRowSku: firstValues[iSku] || '(empty)',
                firstRowImageUrl: (firstValues[iImage] || '').substring(0, 60) + ((firstValues[iImage] || '').length > 60 ? '...' : ''),
                dbSkuSample: (sample || []).slice(0, 3).map(p => p.sku)
            };
        }
        res.json(resBody);
    } catch (error) {
        console.error('Update images CSV error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add Product by URL: classify asset vs page; asset = no HTML parse, return hints.image_urls + empty extracted
app.post('/api/admin/products/parse-url', authenticateToken, requireAdmin, async (req, res) => {
    const url = (req.body && req.body.url) ? String(req.body.url).trim() : '';
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).json({ error: 'URL must start with http:// or https://' });
    }
    try {
        const payload = await parseProductUrl(url);
        if (payload.kind === 'asset') {
            const hints = payload.hints || {};
            const image_urls = hints.image_urls || hints.images || (payload.asset && payload.asset.finalUrl ? [payload.asset.finalUrl] : [url]);
            return res.json({
                kind: 'asset',
                url: payload.url,
                asset: payload.asset,
                hints: { image_urls, images: image_urls },
                extracted: { meta: {}, jsonld: [], text: '' }
            });
        }
        if (payload.kind === 'page' && payload.extracted) {
            logParseEvent({ event: 'parse-url', url: payload.url, meta: payload.extracted.meta });
            const extracted = {
                jsonld: payload.extracted.jsonld || [],
                meta: payload.extracted.meta || { title: '', image: '', description: '' },
                text: payload.extracted.text || ''
            };
            if (payload.extracted.sku) extracted.sku = payload.extracted.sku;
            if (payload.extracted.skuGuess) extracted.skuGuess = payload.extracted.skuGuess;
            if (payload.extracted.image_urls && payload.extracted.image_urls.length) extracted.image_urls = payload.extracted.image_urls;
            if (payload.extracted.productDetails && typeof payload.extracted.productDetails === 'object') extracted.productDetails = payload.extracted.productDetails;
            if (payload.extracted.specText) extracted.specText = payload.extracted.specText;
            if (Array.isArray(payload.extracted.bullets)) extracted.bullets = payload.extracted.bullets;
            const hints = payload.hints || {};
            const image_urls = hints.image_urls || hints.images || [];
            return res.json({
                url: payload.url,
                finalUrl: payload.finalUrl,
                kind: 'page',
                extracted,
                hints: { ...hints, image_urls, images: image_urls }
            });
        }
        res.json(payload);
    } catch (err) {
        const message = err.message || 'Failed to fetch URL';
        const isTimeout = err.name === 'AbortError' || (message && (message.includes('abort') || message.includes('timeout')));
        const is403 = message.includes('403') || message.includes('forbidden');
        res.status(is403 ? 403 : isTimeout ? 504 : 502).json({ error: isTimeout ? 'Request timed out. Try again or use a different URL.' : message });
    }
});

// AI normalization: input { kind, url, extracted, hints }. Output strict schema + attributes (filter vocab).
const { normalizeProduct } = require('./lib/productImport/normalizeProduct');
const { inferAttributesAI, mergeAttributes, mergeWarnings, isConfigured: inferAiConfigured } = require('./lib/productImport/inferAttributesAI');

app.post('/api/admin/products/ai-normalize', authenticateToken, requireAdmin, async (req, res) => {
    const body = req.body || {};
    const extracted = body.extracted;
    if (!extracted || typeof extracted !== 'object') {
        return res.status(400).json({ error: 'extracted payload is required (jsonld, meta, text)' });
    }
    const hints = body.hints || {};
    try {
        let normalized;
        let fromFallback = false;
        const options = { hints };
        if (aiNormalizeConfigured()) {
            normalized = await aiNormalizeProduct(extracted, options);
        } else {
            normalized = normalizeFromExtracted(extracted, options);
            fromFallback = true;
        }
        const specText = (extracted.specText || '').toString();
        const bullets = Array.isArray(extracted.bullets) ? extracted.bullets : [];
        const attrDraft = normalizeProduct(extracted, hints, specText, bullets);
        let attributes = attrDraft.attributes || {};
        let attribute_warnings = attrDraft.warnings || [];
        let source_confidence = {};
        if (inferAiConfigured()) {
            const aiInput = {
                name: normalized.name,
                description: normalized.description,
                specText,
                bullets
            };
            const aiResult = await inferAttributesAI(aiInput);
            if (aiResult) {
                attributes = mergeAttributes(attributes, aiResult);
                attribute_warnings = mergeWarnings(attribute_warnings, aiResult.warnings);
                source_confidence = aiResult.confidence || {};
            }
        }
        normalized.attributes = attributes;
        normalized.attribute_warnings = attribute_warnings;
        normalized.source_confidence = source_confidence;
        if (body.logParse) {
            console.log('[admin/products] ai-normalize', fromFallback ? 'fallback' : 'openai', body.url ? 'url=' + body.url.slice(0, 60) : '');
            logParseEvent({ event: 'ai-normalize', url: body.url || '', normalized: { ...normalized, attributes, attribute_warnings }, fromFallback });
        }
        res.json({ normalized, fromFallback: fromFallback || undefined });
    } catch (err) {
        console.error('AI normalize error:', err);
        res.status(500).json({ error: err.message || 'AI normalization failed' });
    }
});

// Validate image URLs: HEAD then GET. Returns valid_urls + invalid. Optional: withVerification=true returns results with verified flag (do not drop URLs).
app.post('/api/admin/products/validate-images', authenticateToken, requireAdmin, async (req, res) => {
    const image_urls = Array.isArray(req.body && req.body.image_urls) ? req.body.image_urls : [];
    const withVerification = !!(req.body && req.body.withVerification);
    try {
        if (withVerification) {
            const { results } = await validateImageUrlsWithVerification(image_urls);
            res.json({ results, valid_urls: results.filter((r) => r.verified).map((r) => r.url), invalid: results.filter((r) => !r.verified).map((r) => r.url) });
        } else {
            const { valid_urls, invalid } = await validateImageUrls(image_urls);
            res.json({ valid_urls, invalid });
        }
    } catch (err) {
        res.status(500).json({ error: err.message || 'Validation failed' });
    }
});

// Save product draft to Supabase: upsert by sku, upsert manufacturer, set manufacturer_id.
// Uses server-only supabaseAdmin (service role). Always returns JSON.
app.post('/api/admin/products/save', authenticateToken, requireAdmin, async (req, res) => {
    const body = req.body || {};
    const sku = (body.sku || '').toString().trim();
    const name = (body.name || '').toString().trim();
    if (!sku || !name) {
        return res.status(400).json({ error: 'sku and name are required' });
    }
    let supabase;
    try {
        supabase = getSupabaseAdmin();
    } catch (e) {
        return res.status(500).json({ error: e.message || 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (local) or host env vars (prod).' });
    }
    const image_urls = Array.isArray(body.image_urls) ? body.image_urls : [];
    const primaryImage = image_urls[0] || body.image_url || '';
    const additionalImages = image_urls.length > 1 ? image_urls.slice(1).map(u => (u || '').toString().trim()).filter(Boolean) : [];
    const brand = (body.brand || '').toString().trim();
    try {
        const attributes = body.attributes && typeof body.attributes === 'object' ? body.attributes : {};
        const attribute_warnings = Array.isArray(body.attribute_warnings) ? body.attribute_warnings : [];
        const source_confidence = body.source_confidence && typeof body.source_confidence === 'object' ? body.source_confidence : {};
        const productPayload = {
            sku,
            name,
            brand: brand || null,
            manufacturer_id:
                body.manufacturer_id != null && !Number.isNaN(Number(body.manufacturer_id))
                    ? Number(body.manufacturer_id)
                    : undefined,
            description: (body.description || '').toString().trim() || null,
            cost: body.cost != null && !Number.isNaN(Number(body.cost)) ? Number(body.cost) : 0,
            image_url: (primaryImage || '').toString().trim() || null,
            images: additionalImages,
            material: (body.material || '').toString().trim() || null,
            color: (body.color || '').toString().trim() || null,
            sizes: (body.sizes || '').toString().trim() || null,
            pack_qty: body.pack_qty != null && !Number.isNaN(Number(body.pack_qty)) ? Number(body.pack_qty) : null,
            case_qty: body.case_qty != null && !Number.isNaN(Number(body.case_qty)) ? Number(body.case_qty) : null,
            category: (body.category || '').toString().trim() || null,
            subcategory: (body.subcategory || '').toString().trim() || null,
            thickness: (body.thickness || '').toString().trim() || null,
            powder: (body.powder || '').toString().trim() || null,
            grade: (body.grade || '').toString().trim() || null,
            attributes,
            attribute_warnings,
            source_confidence,
        };
        const existingBySku = await productsService.getProductBySkuForWrite(sku);
        if (existingBySku && existingBySku.ambiguous) {
            return res.status(409).json({ error: 'Multiple catalog rows share this SKU; resolve in catalog admin.' });
        }
        if (existingBySku && existingBySku.id) {
            await productsService.updateProduct(existingBySku.id, productPayload);
            logParseEvent({ event: 'save', action: 'updated', sku, name });
            if (req.body && req.body.logParse) {
                console.log('[admin/products] save updated', sku);
            }
            return res.json({ success: true, action: 'updated', sku });
        }
        await productsService.createProduct(productPayload);
        console.log('Product inserted:', sku);
        logParseEvent({ event: 'save', action: 'created', sku, name });
        if (req.body && req.body.logParse) {
            console.log('[admin/products] save created', sku);
        }
        res.json({ success: true, action: 'created', sku });
    } catch (err) {
        console.error('Save product error:', err);
        return res.status(500).json({ error: err.message || 'Save failed' });
    }
});

// ------------ Bulk Import (admin + internal worker) ------------
function requireInternalCron(req, res, next) {
    const secret = process.env.INTERNAL_CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'INTERNAL_CRON_SECRET not configured' });
    const headerSecret = req.headers['x-internal-cron-secret'] || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '');
    if (headerSecret !== secret) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

app.post('/api/admin/import/bulk', authenticateToken, requireAdmin, async (req, res) => {
    if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    const urls = req.body && req.body.urls;
    if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'urls array required' });
    try {
        const supabase = getSupabase();
        const { job_id, total_count } = await enqueueBulkUrls(supabase, urls);
        const { data: job } = await supabase.from('import_jobs').select('id, created_at, total_count').eq('id', job_id).single();
        res.status(201).json({ job_id, total_count, job: job || { id: job_id, total_count } });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Enqueue failed' });
    }
});

app.get('/api/admin/import/jobs', authenticateToken, requireAdmin, async (req, res) => {
    if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    try {
        const supabase = getSupabase();
        const { data: jobs, error } = await supabase.from('import_jobs').select('id, created_at, total_count').order('id', { ascending: false }).limit(100);
        if (error) throw error;
        const counts = await Promise.all((jobs || []).map(async (j) => {
            const { count } = await supabase.from('import_job_items').select('*', { count: 'exact', head: true }).eq('job_id', j.id);
            const { count: done } = await supabase.from('import_job_items').select('*', { count: 'exact', head: true }).eq('job_id', j.id).eq('status', 'done');
            const { count: err } = await supabase.from('import_job_items').select('*', { count: 'exact', head: true }).eq('job_id', j.id).eq('status', 'error');
            const { count: queued } = await supabase.from('import_job_items').select('*', { count: 'exact', head: true }).eq('job_id', j.id).eq('status', 'queued');
            return { job_id: j.id, total_count: j.total_count, items_count: count ?? 0, done: done ?? 0, error: err ?? 0, queued: queued ?? 0 };
        }));
        res.json({ jobs: (jobs || []).map((j, i) => ({ ...j, ...counts[i] })) });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to list jobs' });
    }
});

app.get('/api/admin/import/jobs/:id', authenticateToken, requireAdmin, async (req, res) => {
    if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid job id' });
    try {
        const supabase = getSupabase();
        const { data: job, error: jobErr } = await supabase.from('import_jobs').select('*').eq('id', id).single();
        if (jobErr || !job) return res.status(404).json({ error: 'Job not found' });
        const { data: items, error: itemsErr } = await supabase.from('import_job_items').select('id, source_url, status, attempt_count, error_message, created_product_id, created_at').eq('job_id', id).order('id');
        if (itemsErr) throw itemsErr;
        res.json({ job, items: items || [] });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to get job' });
    }
});

app.post('/api/internal/import/run', requireInternalCron, async (req, res) => {
    if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    const limit = Math.min(parseInt(req.body && req.body.limit, 10) || 20, 50);
    try {
        const supabase = getSupabase();
        const result = await runWorker(supabase, limit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Worker failed' });
    }
});

// ---------- AI Email Routing: review queue (approve/reject/send AI-drafted responses) ----------
const emailRouting = require('./lib/email-routing');
app.get('/api/email-routing/review', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const list = await emailRouting.reviewQueue.listPending({ status: 'pending_review', limit });
        res.json({ items: list });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to list review queue' });
    }
});
app.get('/api/email-routing/review/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const action = await emailRouting.reviewQueue.getActionById(req.params.id);
        if (!action) return res.status(404).json({ error: 'Action not found' });
        res.json(action);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to get action' });
    }
});
app.post('/api/email-routing/review/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reviewedBy = req.user && (req.user.email || req.user.id);
        await emailRouting.reviewQueue.approve(req.params.id, reviewedBy);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to approve' });
    }
});
app.post('/api/email-routing/review/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reviewedBy = req.user && (req.user.email || req.user.id);
        await emailRouting.reviewQueue.reject(req.params.id, reviewedBy);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to reject' });
    }
});
app.post('/api/email-routing/review/:id/send', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await emailRouting.reviewQueue.sendApproved(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to send' });
    }
});

app.get('/api/admin/import/drafts', authenticateToken, requireAdmin, async (req, res) => {
    if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('products_drafts').select('id, source_url, status, sku, name, brand, import_job_item_id, created_at').eq('status', 'draft').order('id', { ascending: false }).limit(200);
        if (error) throw error;
        res.json({ drafts: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to list drafts' });
    }
});

app.get('/api/admin/import/drafts/:id', authenticateToken, requireAdmin, async (req, res) => {
    if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid draft id' });
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('products_drafts').select('*').eq('id', id).single();
        if (error || !data) return res.status(404).json({ error: 'Draft not found' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to get draft' });
    }
});

app.patch('/api/admin/import/drafts/:id', authenticateToken, requireAdmin, async (req, res) => {
    if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid draft id' });
    const body = req.body || {};
    const allowed = ['sku', 'name', 'brand', 'description', 'image_url', 'images', 'material', 'color', 'sizes', 'pack_qty', 'case_qty', 'category', 'subcategory', 'thickness', 'powder', 'grade', 'attributes', 'attribute_warnings', 'source_confidence'];
    const updates = {};
    for (const k of allowed) {
        if (body[k] !== undefined) {
            if (k === 'images' && Array.isArray(body[k])) updates[k] = body[k];
            else if (k === 'attributes' && typeof body[k] === 'object') updates[k] = body[k];
            else if (k === 'attribute_warnings' && Array.isArray(body[k])) updates[k] = body[k];
            else if (k === 'source_confidence' && typeof body[k] === 'object') updates[k] = body[k];
            else if (typeof body[k] === 'string' || typeof body[k] === 'number') updates[k] = body[k];
        }
    }
    updates.updated_at = new Date().toISOString();
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('products_drafts').update(updates).eq('id', id).eq('status', 'draft').select().single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Draft not found or already approved' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to update draft' });
    }
});

app.post('/api/admin/import/drafts/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
    if (!supabaseConfigured()) return res.status(503).json({ error: 'Supabase not configured' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid draft id' });
    try {
        const supabase = getSupabase();
        const result = await approveDraft(supabase, id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Approve failed' });
    }
});

// ============ AI LAYER (glove-finder, invoice extract/recommend) ============
const getSupabaseForAi = () => (supabaseConfigured() ? getSupabase() : null);

// Stable error shape for AI endpoints: { error: { code, message }, details? }
function aiError(res, status, code, message, details = null) {
    const body = { error: { code, message } };
    if (details != null) body.details = details;
    return res.status(status).json(body);
}

app.post('/api/ai/glove-finder', optionalAuth, aiLimiter, async (req, res) => {
    const parsed = validateGloveFinderRequest(req.body || {});
    if (!parsed.success) {
        return aiError(res, 400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }
    if (!aiConfigured()) {
        return aiError(res, 503, 'AI_NOT_CONFIGURED', 'AI not configured. Set AI_PROVIDER and OPENAI_API_KEY (or GEMINI_API_KEY).');
    }
    try {
        const result = await aiGenerate(parsed.data);
        const validated = validateGloveFinderResponse(result);
        if (!validated.success) {
            return aiError(res, 500, 'INVALID_AI_RESPONSE', 'Invalid AI response', validated.error.flatten());
        }
        const summary = (result.recommendations || []).length + ' recommendations';
        const supabase = getSupabaseForAi();
        if (supabase) {
            await logConversation(supabase, {
                user_id: req.user && req.user.id ? req.user.id : null,
                ip_hash: hashIp(req.ip || req.connection?.remoteAddress),
                kind: 'glove_finder',
                request_summary: JSON.stringify(parsed.data).slice(0, 500),
                response_summary: summary,
            });
        }
        res.json(validated.data);
    } catch (err) {
        console.error('AI glove-finder error:', err);
        return aiError(res, 500, 'INTERNAL_ERROR', err.message || 'AI request failed');
    }
});

app.post('/api/ai/invoice/extract', optionalAuth, aiLimiter, async (req, res) => {
    const rawText = typeof req.body === 'object' && req.body && typeof req.body.text === 'string' ? req.body.text : (typeof req.body === 'string' ? req.body : '');
    if (!rawText || rawText.trim().length < 10) {
        return res.status(400).json({ error: 'Request body must include "text" with invoice content (min 10 chars).' });
    }
    if (!aiConfigured()) {
        return res.status(503).json({ error: 'AI not configured. Set AI_PROVIDER and OPENAI_API_KEY (or GEMINI_API_KEY).' });
    }
    try {
        const result = await aiExtractInvoice(rawText);
        const validated = validateInvoiceExtractResponse(result);
        if (!validated.success) {
            return res.status(500).json({ error: 'Invalid AI response', details: validated.error.flatten() });
        }
        const data = validated.data;
        const summary = `vendor=${data.vendor_name || 'N/A'}, lines=${(data.lines || []).length}`;
        const supabase = getSupabaseForAi();
        let uploadId = null;
        if (supabase) {
            uploadId = await logInvoiceUpload(supabase, {
                user_id: req.user && req.user.id ? req.user.id : null,
                ip_hash: hashIp(req.ip || req.connection?.remoteAddress),
                file_name: req.body && req.body.file_name ? String(req.body.file_name).slice(0, 255) : null,
                vendor_name: data.vendor_name,
                invoice_number: data.invoice_number,
                total_amount: data.total_amount,
                line_count: (data.lines || []).length,
                extract_summary: summary,
            });
            if (uploadId && data.lines && data.lines.length) await logInvoiceLines(supabase, uploadId, data.lines);
        }
        res.json({ ...data, upload_id: uploadId });
    } catch (err) {
        console.error('AI invoice extract error:', err);
        res.status(500).json({ error: err.message || 'Extraction failed' });
    }
});

app.post('/api/ai/invoice/recommend', optionalAuth, aiLimiter, async (req, res) => {
    const extract = req.body && req.body.extract;
    if (!extract || !Array.isArray(extract.lines)) {
        return res.status(400).json({ error: 'Request body must include "extract" with "lines" array (e.g. from /api/ai/invoice/extract).' });
    }
    if (!aiConfigured()) {
        return res.status(503).json({ error: 'AI not configured. Set AI_PROVIDER and OPENAI_API_KEY (or GEMINI_API_KEY).' });
    }
    const productCatalogSummary = (req.body && req.body.product_catalog_summary) ? String(req.body.product_catalog_summary).slice(0, 2000) : '';
    try {
        const result = await aiRecommendFromInvoice(extract, productCatalogSummary);
        const validated = validateInvoiceRecommendResponse(result);
        if (!validated.success) {
            return res.status(500).json({ error: 'Invalid AI response', details: validated.error.flatten() });
        }
        const supabase = getSupabaseForAi();
        if (supabase && result.recommendations && result.recommendations.length) {
            await logRecommendations(supabase, {
                upload_id: req.body && req.body.upload_id ? req.body.upload_id : null,
                recommendations: result.recommendations,
            });
        }
        res.json(validated.data);
    } catch (err) {
        console.error('AI invoice recommend error:', err);
        res.status(500).json({ error: err.message || 'Recommendation failed' });
    }
});

app.post('/api/products', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const skuRaw = (req.body.sku || '').toString().trim();
        if (!skuRaw) return res.status(400).json({ error: 'Product SKU is required.' });
        const { products } = await productsService.getProducts({ limit: 1 });
        const existingBySku = await productsService.getProductById(skuRaw);
        if (existingBySku) return res.status(409).json({ error: 'A product with this SKU already exists. Use Edit to update it instead of adding a duplicate.' });
        const images = Array.isArray(req.body.images) ? req.body.images.filter(u => typeof u === 'string' && u.trim()) : [];
        const thicknessVal = req.body.thickness;
        const thickness = thicknessVal !== undefined && thicknessVal !== null && thicknessVal !== '' ? (thicknessVal === '7+' || thicknessVal === 7 ? 7 : parseFloat(thicknessVal)) : null;
        const newProduct = await productsService.createProduct({
            sku: req.body.sku || '',
            name: req.body.name || '',
            brand: req.body.brand || '',
            category: req.body.category || 'Disposable Gloves',
            subcategory: req.body.subcategory || '',
            description: req.body.description || '',
            material: req.body.material || '',
            sizes: req.body.sizes || '',
            color: req.body.color || '',
            pack_qty: parseInt(req.body.pack_qty) || 100,
            case_qty: parseInt(req.body.case_qty) || 1000,
            price: parseFloat(req.body.price) || 0,
            bulk_price: parseFloat(req.body.bulk_price) || 0,
            image_url: req.body.image_url || '',
            images,
            video_url: (req.body.video_url || '').trim() || '',
            in_stock: req.body.in_stock ? 1 : 0,
            featured: req.body.featured ? 1 : 0,
            powder: req.body.powder || '',
            thickness: isNaN(thickness) ? null : thickness,
            sterility: req.body.sterility || '',
            grade: req.body.grade || '',
            useCase: req.body.useCase || '',
            certifications: req.body.certifications || '',
            texture: req.body.texture || '',
            cuffStyle: req.body.cuffStyle || ''
        });
        res.json({ success: true, product: newProduct });
    } catch (err) {
        console.error('[POST /api/products]', err);
        res.status(500).json({ error: err.message || 'Database error' });
    }
});

// Update product (admin only)
app.put('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const product = await productsService.getProductById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const payload = { ...product };
    if (req.body.sku !== undefined) payload.sku = req.body.sku;
    if (req.body.name !== undefined) payload.name = req.body.name;
    if (req.body.brand !== undefined) payload.brand = req.body.brand;
    if (req.body.category !== undefined) payload.category = req.body.category;
    if (req.body.subcategory !== undefined) payload.subcategory = req.body.subcategory;
    if (req.body.description !== undefined) payload.description = req.body.description;
    if (req.body.material !== undefined) payload.material = req.body.material;
    if (req.body.sizes !== undefined) payload.sizes = req.body.sizes;
    if (req.body.color !== undefined) payload.color = req.body.color;
    if (req.body.pack_qty !== undefined) payload.pack_qty = parseInt(req.body.pack_qty);
    if (req.body.case_qty !== undefined) payload.case_qty = parseInt(req.body.case_qty);
    if (req.body.price !== undefined) payload.price = parseFloat(req.body.price);
    if (req.body.bulk_price !== undefined) payload.bulk_price = parseFloat(req.body.bulk_price);
    if (req.body.image_url !== undefined) payload.image_url = req.body.image_url;
    if (req.body.images !== undefined) payload.images = Array.isArray(req.body.images) ? req.body.images.filter(u => typeof u === 'string' && u.trim()) : (payload.images || []);
    if (req.body.video_url !== undefined) payload.video_url = (req.body.video_url || '').trim() || '';
    if (req.body.in_stock !== undefined) payload.in_stock = req.body.in_stock ? 1 : 0;
    if (req.body.featured !== undefined) payload.featured = req.body.featured ? 1 : 0;
    if (req.body.powder !== undefined) payload.powder = req.body.powder || '';
    if (req.body.thickness !== undefined) payload.thickness = req.body.thickness ? parseFloat(req.body.thickness) : null;
    if (req.body.grade !== undefined) payload.grade = req.body.grade || '';
    if (req.body.useCase !== undefined) payload.useCase = req.body.useCase || '';
    if (req.body.certifications !== undefined) payload.certifications = req.body.certifications || '';
    if (req.body.texture !== undefined) payload.texture = req.body.texture || '';
    if (req.body.cuffStyle !== undefined) payload.cuffStyle = req.body.cuffStyle || '';
    if (req.body.sterility !== undefined) payload.sterility = req.body.sterility || '';
        const updated = await productsService.updateProduct(product.id, payload);
        res.json({ success: true, product: updated });
    } catch (err) {
        console.error('[PUT /api/products/:id]', err);
        res.status(500).json({ error: err.message || 'Database error' });
    }
});

// Delete product (admin only)
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const product = await productsService.getProductById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        await productsService.deleteProduct(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/products/:id]', err);
        res.status(500).json({ error: err.message || 'Database error' });
    }
});

// Batch delete products (admin only)
app.post('/api/products/batch-delete', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required and must not be empty' });
        const deleted = await productsService.deleteProductsByIds(ids);
        res.json({ success: true, deleted });
    } catch (err) {
        console.error('[POST /api/products/batch-delete]', err);
        res.status(500).json({ error: err.message || 'Database error' });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await productsService.getCategories();
        res.json(categories);
    } catch (err) {
        sendCatalogApiError(res, err, '[GET /api/categories]');
    }
});

app.get('/api/brands', async (req, res) => {
    try {
        const brands = await productsService.getBrands();
        res.json(brands);
    } catch (err) {
        sendCatalogApiError(res, err, '[GET /api/brands]');
    }
});

// Products CSV export: stream CSV for download (optionally save to disk when writable)
app.get('/api/products/export.csv', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).send('Admin access required');
        const { products: rawProducts } = await productsService.getProducts({ limit: 10000 });
        let products = Array.isArray(rawProducts) ? [...rawProducts] : [];
        const brand = (req.query.brand || '').trim();
        const category = (req.query.category || '').trim();
        const colorsParam = req.query.colors;
        const materialsParam = req.query.materials;
        const colors = colorsParam ? (Array.isArray(colorsParam) ? colorsParam : colorsParam.split(',').map(s => s.trim()).filter(Boolean)) : [];
        const materials = materialsParam ? (Array.isArray(materialsParam) ? materialsParam : materialsParam.split(',').map(s => s.trim()).filter(Boolean)) : [];

        if (brand) products = products.filter(p => (p.brand || '').trim().toLowerCase() === brand.trim().toLowerCase());
        if (category) products = products.filter(p => (p.category || '').trim() === category);
        if (colors.length > 0) {
            const colorSet = new Set(colors.map(c => (c || '').toLowerCase()));
            products = products.filter(p => {
                const productColors = (p.color || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
                return productColors.some(c => colorSet.has(c)) || colorSet.has((p.color || '').trim().toLowerCase());
            });
        }
        if (materials.length > 0) {
            const matSet = new Set(materials.map(m => (m || '').toLowerCase()));
            products = products.filter(p => matSet.has((p.material || '').trim().toLowerCase()));
        }

        const manufacturers = await dataService.getManufacturers();
        const { csvContent, filename } = productStore.productsToCsv(products, { manufacturers: manufacturers || [] });
        try {
            if (!fs.existsSync(FISHBOWL_EXPORT_DIR)) {
                fs.mkdirSync(FISHBOWL_EXPORT_DIR, { recursive: true });
            }
            fs.writeFileSync(path.join(FISHBOWL_EXPORT_DIR, filename), csvContent, 'utf8');
        } catch (writeErr) {
            console.warn('Could not save export file (e.g. read-only FS):', writeErr.message);
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
        res.send(csvContent);
    } catch (err) {
        console.error('Export CSV error:', err);
        res.status(500).json({ error: err.message || 'Export failed' });
    }
});

// ============ FISHBOWL INTEGRATION ============

app.get('/api/fishbowl/status', (req, res) => {
    if (!fishbowl.isConfigured()) {
        return res.json({ configured: false, connected: false, message: 'Fishbowl env vars not set (FISHBOWL_BASE_URL, FISHBOWL_USERNAME, FISHBOWL_PASSWORD)' });
    }
    fishbowl.getToken()
        .then(() => res.json({ configured: true, connected: true, message: 'Connected to Fishbowl' }))
        .catch((err) => res.json({
            configured: true,
            connected: false,
            message: err.message || 'Connection failed',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        }));
});

app.post('/api/fishbowl/sync-inventory', authenticateToken, async (req, res) => {
    if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required to sync inventory' });
    if (!fishbowl.isConfigured()) return res.status(400).json({ error: 'Fishbowl not configured. Set FISHBOWL_BASE_URL, FISHBOWL_USERNAME, FISHBOWL_PASSWORD in .env' });
    try {
        const inventoryList = await fishbowl.getAllInventory(true);
        const GLV_PREFIX = 'GLV-';
        const qtyByPartNumber = {};
        for (const row of inventoryList) {
            const num = (row.partNumber || row.number || '').toString().trim().toUpperCase();
            if (!num || !num.startsWith(GLV_PREFIX)) continue;
            qtyByPartNumber[num] = (qtyByPartNumber[num] || 0) + (row.quantity || 0);
        }
        const { products: productList } = await productsService.getProducts({ limit: 10000 });
        let updated = 0;
        for (const product of productList || []) {
            const mainSku = (product.sku || '').toString().trim().toUpperCase();
            if (!mainSku) continue;
            let totalQty = qtyByPartNumber[mainSku] || 0;
            const sizes = (product.sizes || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
            for (const size of sizes) {
                totalQty += qtyByPartNumber[mainSku + '-' + size.toUpperCase().replace(/\s+/g, '')] || 0;
            }
            const inStock = totalQty > 0 ? 1 : 0;
            const currentQoh = product.quantity_on_hand ?? 0;
            if (product.in_stock !== inStock || currentQoh !== totalQty) {
                const invCanon = normalizeCanonicalUuidInput(product.catalog_v2_product_id);
                if (!invCanon) continue;
                await dataService.upsertInventory(invCanon, {
                    quantity_on_hand: totalQty,
                    canonical_product_id: invCanon,
                });
                await productsService.updateProduct(product.id, { in_stock: inStock });
                updated++;
            }
        }
        res.json({ success: true, updated, totalProducts: (productList || []).length, message: `Synced: ${updated} product(s) updated from Fishbowl (GLV- only)` });
    } catch (err) {
        console.error('Fishbowl sync error:', err);
        res.status(500).json({
            error: err.message || 'Fishbowl sync failed',
            mfaRequired: err.mfaRequired === true
        });
    }
});

app.get('/api/fishbowl/export-customers', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const customers = await dataService.getCustomersForFishbowlExport();
        res.json({ customers, count: customers.length });
    } catch (err) {
        console.error('[fishbowl/export-customers]', err);
        res.status(500).json({ error: err.message || 'Failed to export customers' });
    }
});

app.get('/api/fishbowl/export-customers.csv', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).send('Admin access required');
        await writeFishbowlCustomersExport();
        const customers = await dataService.getCustomersForFishbowlExport();
        const escapeCsv = (v) => { const s = (v == null ? '' : String(v)).replace(/"/g, '""'); return /[",\r\n]/.test(s) ? `"${s}"` : s; };
        const headers = ['id', 'company_name', 'contact_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'order_count', 'last_order_number', 'last_order_date'];
        const rows = [headers.join(',')].concat(customers.map(c => headers.map(h => escapeCsv(c[h])).join(',')));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="fishbowl-customers.csv"');
        res.send(rows.join('\r\n'));
    } catch (err) {
        console.error('[fishbowl/export-customers.csv]', err);
        res.status(500).send('Export failed');
    }
});

async function writeFishbowlCustomersExport() {
    try {
        const customers = await dataService.getCustomersForFishbowlExport();
        const escapeCsv = (v) => { const s = (v == null ? '' : String(v)).replace(/"/g, '""'); return /[",\r\n]/.test(s) ? `"${s}"` : s; };
        const headers = ['id', 'company_name', 'contact_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'order_count', 'last_order_number', 'last_order_date'];
        const rows = [headers.join(',')].concat(customers.map(c => headers.map(h => escapeCsv(c[h])).join(',')));
        const csvContent = rows.join('\r\n');
        if (!fs.existsSync(FISHBOWL_EXPORT_DIR)) fs.mkdirSync(FISHBOWL_EXPORT_DIR, { recursive: true });
        fs.writeFileSync(FISHBOWL_EXPORT_FILE, csvContent, 'utf8');
        console.log(`[Fishbowl] Customer export written: ${customers.length} customers -> ${FISHBOWL_EXPORT_FILE}`);
    } catch (err) {
        console.error('[Fishbowl] Error writing customer export:', err.message);
    }
}

app.get('/api/fishbowl/export-customers-file', async (req, res) => {
    const secret = process.env.FISHBOWL_EXPORT_SECRET;
    const useSecret = secret && req.query.secret === secret;
    if (!useSecret) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Missing auth: use Authorization header or ?secret=FISHBOWL_EXPORT_SECRET' });
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const isAdminUser = await usersService.isAdmin(decoded.id);
            if (!isAdminUser) return res.status(403).json({ error: 'Admin access required' });
            serveExportFile(res);
        } catch (err) {
            const isExpired = err.name === 'TokenExpiredError';
            return res.status(isExpired ? 401 : 403).json({ error: isExpired ? 'Session expired' : 'Invalid token' });
        }
        return;
    }
    serveExportFile(res);
});

function serveExportFile(res) {
    if (!fs.existsSync(FISHBOWL_EXPORT_FILE)) {
        return res.status(404).json({ error: 'Export file not yet generated. It is created every 30 minutes.' });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fishbowl-customers.csv"');
    res.sendFile(FISHBOWL_EXPORT_FILE);
}

// ============ CART ROUTES ============

app.get('/api/cart', optionalAuth, async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'] || 'anonymous';
        const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
        const cartItems = await dataService.getCart(cartKey);
        let companyId = null;
        let user = null;
        let ctx = { companies: [], customer_manufacturer_pricing: [] };
        if (req.user) {
            user = await usersService.getUserById(req.user.id);
            if (user) companyId = await companiesService.getCompanyIdForUser(user);
            ctx = await getPricingContext();
        }
        const enrichedCart = [];
        for (const item of cartItems) {
            const catalogId = resolveLineCatalogProductId(item);
            if (!catalogId) {
                enrichedCart.push({
                    ...item,
                    name: 'Unknown',
                    price: 0,
                    bulk_price: null,
                    checkout_unit_price: 0,
                    image_url: '',
                    sku: '',
                    variant_sku: '',
                    catalog_error: 'MISSING_CANONICAL_PRODUCT_ID',
                });
                continue;
            }
            const listingId = resolveCartLineListingProductId(item);
            const product = await productsService.getProductById(listingId || catalogId);
            const resolved = commercePricing.resolveLineUnitPriceForCheckout({
                user,
                companyId,
                product,
                quantity: item.quantity,
                pricingContext: ctx,
            });
            let variantSku = product?.sku || '';
            if (item.size && variantSku) {
                const sizeSuffix = item.size.toUpperCase().replace(/\s+/g, '');
                variantSku = `${variantSku}-${sizeSuffix}`;
            }
            enrichedCart.push({
                ...item,
                name: product?.name || 'Unknown',
                price: resolved.listUnitPrice,
                bulk_price: resolved.catalogBulkUnitPrice,
                checkout_unit_price: resolved.unitPrice,
                image_url: product?.image_url || '',
                sku: product?.sku || '',
                variant_sku: variantSku
            });
        }
        res.json(enrichedCart);
    } catch (err) {
        console.error('[cart GET]', err);
        const mapped = mapPostgrestOrDatabaseError(err);
        if (mapped.status !== 500) {
            res.status(mapped.status).json(mapped.body);
            return;
        }
        res.status(500).json({ error: err.message || 'Failed to load cart' });
    }
});

app.post('/api/cart', optionalAuth, async (req, res) => {
    try {
        const { product_id, size, quantity, canonical_product_id } = req.body;
        const qty = Math.max(1, parseInt(quantity, 10) || 1);
        const sessionId = req.headers['x-session-id'] || 'anonymous';
        const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
        const cartItems = await dataService.getCart(cartKey);
        const lineForCanon = { product_id, size, canonical_product_id };
        try {
            await ensureCommerceLinesHaveCanonical([lineForCanon], 'cart_post');
        } catch (e) {
            if (respondCommerceCanonicalError(e, res)) return;
            throw e;
        }
        const catalogV2Id = lineForCanon.canonical_product_id;
        const listingId = normalizeCanonicalUuidInput(lineForCanon.listing_id);
        const product = await productsService.getProductById(listingId || catalogV2Id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const existing = cartItems.find(
            (item) => String(resolveLineCatalogProductId(item)) === String(catalogV2Id) && item.size === size
        );
        if (existing) {
            existing.quantity += qty;
            existing.canonical_product_id = catalogV2Id;
            existing.product_id = catalogV2Id;
            existing.listing_id = lineForCanon.listing_id;
        } else {
            cartItems.push(
                cartLineContract.newCartLineFromBody({
                    product_id: catalogV2Id,
                    size,
                    quantity: qty,
                    canonical_product_id: catalogV2Id,
                    listing_id: lineForCanon.listing_id,
                }),
            );
        }
        await dataService.setCart(cartKey, cartItems);
        res.json({ success: true });
    } catch (err) {
        if (respondCommerceCanonicalError(err, res)) return;
        console.error('[cart POST]', err);
        res.status(500).json({ error: err.message || 'Failed to update cart' });
    }
});

app.put('/api/cart/:id', optionalAuth, async (req, res) => {
    try {
        const quantity = parseInt(req.body?.quantity, 10);
        const sessionId = req.headers['x-session-id'] || 'anonymous';
        const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
        const cartItems = await dataService.getCart(cartKey);
        if (!cartItems.length) return res.json({ success: true });
        if (!Number.isInteger(quantity) || quantity <= 0) {
            const filtered = cartItems.filter(item => item.id != req.params.id);
            await dataService.setCart(cartKey, filtered);
        } else {
            const item = cartItems.find(i => i.id == req.params.id);
            if (item) item.quantity = quantity;
            await dataService.setCart(cartKey, cartItems);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[cart PUT]', err);
        res.status(500).json({ error: err.message || 'Failed to update cart' });
    }
});

app.delete('/api/cart/:id', optionalAuth, async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'] || 'anonymous';
        const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
        const cartItems = await dataService.getCart(cartKey);
        const filtered = cartItems.filter(item => item.id != req.params.id);
        await dataService.setCart(cartKey, filtered);
        res.json({ success: true });
    } catch (err) {
        console.error('[cart DELETE :id]', err);
        res.status(500).json({ error: err.message || 'Failed to update cart' });
    }
});

app.delete('/api/cart', optionalAuth, async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'] || 'anonymous';
        const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
        await dataService.setCart(cartKey, []);
        res.json({ success: true });
    } catch (err) {
        console.error('[cart DELETE]', err);
        res.status(500).json({ error: err.message || 'Failed to clear cart' });
    }
});

// ============ CHECKOUT QUOTE (server-authoritative totals) ============

app.post('/api/checkout/quote', authenticateToken, async (req, res) => {
    const totalsGuard = assertNoClientSuppliedTotals(req.body || {});
    if (!totalsGuard.ok) {
        return res.status(400).json({
            error: 'Client-supplied totals are not accepted.',
            code: 'CLIENT_TOTALS_REJECTED',
        });
    }
    try {
        const { shipping_address, ship_to_id, payment_method: quotePaymentMethod } = req.body || {};
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const addrRes = await resolveFinalShippingAddressForCheckout(companyIds, req.user.id, ship_to_id, shipping_address);
        if (!addrRes.ok) return res.status(addrRes.status).json(addrRes.body);

        const cartKey = `user_${req.user.id}`;
        const cartItems = await loadAndValidateCartForCheckout(cartKey, res, 'checkout_quote');
        if (!cartItems) return;
        if (!(await assertCheckoutCartLinesMatchBody(cartItems, req.body, res))) return;

        const user = await usersService.getUserById(req.user.id);
        const companyIdForPricing = user ? await companiesService.getCompanyIdForUser(user) : null;
        const pricingCtx = await getPricingContext();
        const money = await checkoutCompute.computeCheckoutMoneyFromCart({
            cartItems,
            finalShippingAddress: addrRes.finalShippingAddress,
            user,
            companyId: companyIdForPricing,
            pricingContext: pricingCtx,
            productsService,
        });
        if (!money.ok) return res.status(money.status).json(money.body);

        const v = money.value;
        const tierPct = commercePricing.getTierDiscountPercentForUser(user, pricingCtx.tier_discount_by_code);
        const thr = v.shipCfg.freeShippingThreshold;
        const amountToFree =
            thr > 0 && v.subtotal < thr ? Math.round((thr - v.subtotal) * 100) / 100 : 0;

        const quotePm =
            quotePaymentMethod === 'net30' || quotePaymentMethod === 'credit_card' || quotePaymentMethod === 'ach'
                ? quotePaymentMethod
                : null;

        const quotePayload = {
            ok: true,
            lines: v.orderItems.map((row) => ({
                product_id: row.product_id,
                name: row.name,
                sku: row.sku,
                variant_sku: row.variant_sku,
                size: row.size,
                quantity: row.quantity,
                unit_price: row.price,
                line_total: Math.round(row.price * row.quantity * 100) / 100,
                canonical_product_id: row.canonical_product_id || undefined,
            })),
            subtotal: v.subtotal,
            discount: v.discount,
            shipping: v.shipping,
            tax: v.tax,
            total: v.total,
            tax_rate: v.taxResult.rate,
            tax_reason: v.taxResult.reason,
            tax_summary: taxLib.getTaxSummary(v.taxResult),
            tax_taxable: v.taxResult.taxable,
            tier_discount_percent_applied: tierPct,
            shipping_policy: {
                free_shipping_threshold: v.shipCfg.freeShippingThreshold,
                flat_shipping_rate: v.shipCfg.flatShippingRate,
                min_order_amount: v.shipCfg.minOrderAmount,
            },
            amount_to_free_shipping: amountToFree,
        };

        if (quotePm === 'net30') {
            let coQuote = null;
            try {
                coQuote = await netTermsService.fetchCompanyForUser(user);
            } catch (qe) {
                console.error('[POST /api/checkout/quote] company for net30 credit preview', qe.message || qe);
            }
            const ev = evaluateNet30Credit(coQuote, v.total);
            if (ev.credit) {
                quotePayload.net30_credit = Object.assign({}, ev.credit, { within_limit: ev.ok });
            }
        }

        res.json(quotePayload);
    } catch (err) {
        console.error('[POST /api/checkout/quote]', err);
        res.status(500).json({ error: err.message || 'Failed to build checkout quote' });
    }
});

// ============ ORDER ROUTES ============

app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const totalsGuardPostOrders = assertNoClientSuppliedTotals(req.body || {});
        if (!totalsGuardPostOrders.ok) {
            return res.status(400).json({
                error: 'Client-supplied totals are not accepted. Pricing is calculated on the server.',
                code: 'CLIENT_TOTALS_REJECTED',
            });
        }

        const idemHeader = req.headers['idempotency-key'];
        const idemKey =
            typeof idemHeader === 'string' && idemHeader.trim().length > 0
                ? idemHeader.trim().slice(0, 255)
                : null;

        const marketingAtt = sanitizeMarketingAttribution(req.body && req.body.marketing_attribution);

        const { shipping_address, notes, ship_to_id, payment_method } = req.body;
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const addrRes = await resolveFinalShippingAddressForCheckout(companyIds, req.user.id, ship_to_id, shipping_address);
        if (!addrRes.ok) return res.status(addrRes.status).json(addrRes.body);
        const { finalShippingAddress } = addrRes;

        const cartKey = `user_${req.user.id}`;
        if (idemKey) {
            const idemDone = await dataService.getOrderByUserIdempotencyKey(req.user.id, idemKey);
            if (idemDone && idemDone.status !== 'cancelled' && idemDone.inventory_reserved_at) {
                const uIdem = await usersService.getUserById(req.user.id);
                const pmIdem = idemDone.payment_method || 'net30';
                const purchase_analytics = buildPurchaseAnalyticsClientPayload(
                    idemDone.items || [],
                    idemDone,
                    uIdem,
                    pmIdem
                );
                return res.json({
                    success: true,
                    order_number: idemDone.order_number,
                    order_id: idemDone.id,
                    total: Number(idemDone.total),
                    purchase_analytics,
                });
            }
        }

        const cartItems = await loadAndValidateCartForCheckout(cartKey, res, 'checkout_post_orders');
        if (!cartItems) return;
        if (!(await assertCheckoutCartLinesMatchBody(cartItems, req.body, res))) return;

        const user = await usersService.getUserById(req.user.id);
        const companyIdForPricing = user ? await companiesService.getCompanyIdForUser(user) : null;
        const pricingCtxOrders = await getPricingContext();
        const money = await checkoutCompute.computeCheckoutMoneyFromCart({
            cartItems,
            finalShippingAddress,
            user,
            companyId: companyIdForPricing,
            pricingContext: pricingCtxOrders,
            productsService,
        });
        if (!money.ok) return res.status(money.status).json(money.body);

        const { orderItems, subtotal, discount, shipping, tax, total, taxResult, shipCfg } = money.value;

        const allowedMethods = ['credit_card', 'ach', 'net30'];
        const requested = (payment_method && allowedMethods.includes(payment_method)) ? payment_method : (user.payment_terms === 'net30' ? 'net30' : 'credit_card');
        let companyRowForTerms = null;
        try {
            companyRowForTerms = await netTermsService.fetchCompanyForUser(user);
        } catch (e) {
            console.error('[POST /api/orders] company for terms', e.message || e);
        }
        if (requested === 'net30') {
            const inv = canPlaceInvoiceOrder(user, companyRowForTerms, { orderTotal: total, skipCreditCheck: false });
            if (!inv.ok) {
                const body = {
                    error: inv.message || 'Invoice checkout is not available for this account.',
                    code: inv.code || 'INVOICE_CHECKOUT_BLOCKED',
                };
                if (inv.code === 'CREDIT_LIMIT_EXCEEDED' && inv.credit) {
                    Object.assign(body, inv.credit);
                }
                return res.status(400).json(body);
            }
        }

        const companyId = companyIdForPricing;

        let order;
        let orderNumber;

        if (idemKey) {
            const idemRow = await dataService.getOrderByUserIdempotencyKey(req.user.id, idemKey);
            if (idemRow && idemRow.status !== 'cancelled' && !idemRow.inventory_reserved_at) {
                order = idemRow;
                orderNumber = idemRow.order_number;
            }
        }

        const orderPayload = {
            user_id: req.user.id,
            order_number: orderNumber || 'GC-' + Date.now().toString(36).toUpperCase(),
            status: 'pending',
            payment_method: requested,
            subtotal,
            discount,
            shipping,
            tax,
            tax_rate: taxResult.rate,
            tax_reason: taxResult.reason,
            total,
            shipping_address: finalShippingAddress,
            ship_to_id: ship_to_id || null,
            notes: notes || null,
            tracking_number: '',
            tracking_url: '',
            ...buildOrderEconomicsOrderFields({ subtotal, shipping, shipCfg }),
            items: orderItems.map((i) => {
                const snap = buildLineCostSnapshotFields(i.cost_at_order, i.quantity);
                return {
                    product_id: i.product_id,
                    quantity: i.quantity,
                    size: i.size,
                    unit_price: i.price,
                    canonical_product_id: i.canonical_product_id,
                    unit_cost_at_order: snap.unit_cost_at_order,
                    total_cost_at_order: snap.total_cost_at_order,
                };
            }),
        };
        if (idemKey) orderPayload.idempotency_key = idemKey;
        if (marketingAtt) orderPayload.marketing_attribution = marketingAtt;

        if (!order) {
            orderNumber = orderPayload.order_number;
            try {
                order = await dataService.createOrder(orderPayload, { companyId, createdByUserId: req.user.id });
            } catch (createErr) {
                if (idemKey && createErr && String(createErr.code) === '23505') {
                    const replay = await dataService.getOrderByUserIdempotencyKey(req.user.id, idemKey);
                    if (replay && replay.status !== 'cancelled') {
                        order = replay;
                        orderNumber = replay.order_number;
                    } else {
                        throw createErr;
                    }
                } else {
                    throw createErr;
                }
            }
        } else {
            orderNumber = order.order_number;
            if (marketingAtt) {
                try {
                    await dataService.updateOrder(order.id, { marketing_attribution: marketingAtt });
                } catch (maErr) {
                    console.warn('[POST /api/orders] marketing_attribution update failed:', maErr.message || maErr);
                }
            }
        }

        if (requested === 'net30') {
            let coFresh = null;
            try {
                coFresh = await netTermsService.fetchCompanyForUser(user);
            } catch (cfe) {
                console.error('[POST /api/orders] credit re-check company', cfe.message || cfe);
            }
            const credEv = evaluateNet30Credit(coFresh, total);
            if (!credEv.ok) {
                try {
                    await dataService.cancelOrderClearIdempotencyKey(order.id);
                } catch (cErr) {
                    console.error('[POST /api/orders] cancel after credit re-check', cErr);
                }
                return res.status(400).json({
                    error: credEv.message,
                    code: 'CREDIT_LIMIT_EXCEEDED',
                    ...credEv.credit,
                });
            }
        }

        try {
            await inventory.reserveStockForOrder(order.id, order.items);
        } catch (resErr) {
            paymentLog.logError('inventory.reserve_failed', resErr, {
                order_id: order.id,
                user_id: req.user.id,
                order_number: orderNumber,
                flow: 'post_orders_net30',
            });
            try {
                await dataService.cancelOrderClearIdempotencyKey(order.id);
            } catch (cancelErr) {
                paymentLog.logError('order.cancel_after_reserve_failed', cancelErr, {
                    order_id: order.id,
                    user_id: req.user.id,
                    order_number: orderNumber,
                    flow: 'post_orders_net30',
                });
            }
            return res.status(400).json({ error: resErr.message || 'Insufficient stock. Please update your cart.' });
        }

        if (requested === 'net30') {
            try {
                await arInvoiceService.applyNet30OrderOpen({
                    orderId: order.id,
                    companyId: order.company_id,
                    orderTotal: Number(order.total),
                    companyRow: companyRowForTerms || { invoice_terms_code: 'net30' },
                    orderCreatedAt: order.created_at,
                });
            } catch (arErr) {
                paymentLog.logError('ar.net30_open_failed', arErr, {
                    order_id: order.id,
                    user_id: req.user.id,
                    order_number: orderNumber,
                });
                try {
                    await inventory.releaseStockForOrder(order.id, req.user.id);
                } catch (relErr) {
                    paymentLog.logError('ar.rollback_release_failed', relErr, { order_id: order.id });
                }
                try {
                    await dataService.cancelOrderClearIdempotencyKey(order.id);
                } catch (cErr) {
                    paymentLog.logError('ar.rollback_cancel_failed', cErr, { order_id: order.id });
                }
                try {
                    await dataService.setCart(cartKey, cartItems);
                } catch (cartErr) {
                    paymentLog.logError('ar.rollback_cart_failed', cartErr, { order_id: order.id });
                }
                const isCredit =
                    arErr.code === 'CREDIT_LIMIT_EXCEEDED' ||
                    (arErr.arPayload && arErr.arPayload.error === 'CREDIT_LIMIT_EXCEEDED');
                const status = isCredit ? 400 : 500;
                const body = {
                    error:
                        arErr.message ||
                        'Could not open accounts receivable for this invoice order. Your cart was restored. Try again or pay by card.',
                    code: isCredit ? 'CREDIT_LIMIT_EXCEEDED' : 'AR_OPEN_FAILED',
                };
                if (isCredit) {
                    const src = arErr.arPayload || arErr;
                    for (const k of [
                        'credit_limit',
                        'outstanding_balance',
                        'order_total',
                        'projected_outstanding',
                        'available_credit',
                    ]) {
                        if (src[k] != null) body[k] = Number(src[k]);
                    }
                }
                return res.status(status).json(body);
            }
        }

        await dataService.setCart(cartKey, []);

        // Send order confirmation email (non-blocking; failures: [EmailFailed] + [EmailAlert] + Payment log)
        if (user && user.email) {
            const emailOrder = { ...orderPayload, order_number: orderNumber, items: orderItems.map(i => ({ ...i, product_name: i.name, unit_price: i.price })) };
            const invoiceTermsLabel =
                requested === 'net30' && companyRowForTerms ? formatInvoiceTermsLabel(companyRowForTerms) : null;
            const emailContent = emailTemplates.orderConfirmation(emailOrder, user, { invoiceTermsLabel });
            dispatchEmailInBackground({
                to: user.email,
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html,
                emailType: 'order_confirmation',
                orderId: order.id,
                orderNumber: orderNumber,
            });
        }
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
        if (adminEmail) {
            const adminOrder = { ...orderPayload, order_number: orderNumber, items: orderItems.map(i => ({ ...i, product_name: i.name, unit_price: i.price })) };
            const adminContent = emailTemplates.adminNewOrder(adminOrder, user);
            dispatchEmailInBackground({
                to: adminEmail,
                subject: adminContent.subject,
                text: adminContent.text,
                html: adminContent.html,
                emailType: 'admin_new_order',
                orderId: order.id,
                orderNumber: orderNumber,
            });
        }
        schedulePricingTierReevaluation(req.user.id, 'post_order');
        const purchase_analytics = buildPurchaseAnalyticsClientPayload(orderItems, order, user, requested);
        res.json({
            success: true,
            order_number: orderNumber,
            order_id: order.id,
            total: Number(order.total),
            purchase_analytics,
        });
    } catch (err) {
        if (respondCommerceCanonicalError(err, res)) return;
        console.error('[POST /api/orders]', err);
        res.status(500).json({ error: err.message || 'Failed to create order' });
    }
});

// Create order in pending_payment and Stripe PaymentIntent for card/ACH (returns client_secret for Stripe.js).
// Subtotal, tax, shipping, and total are computed only on the server; PaymentIntent amount matches persisted order.total.
app.post('/api/orders/create-payment-intent', authenticateToken, async (req, res) => {
    if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured. Use Credit Card or ACH after setting STRIPE_SECRET_KEY.' });
    }
    const piTotalsGuard = assertNoClientSuppliedTotals(req.body || {});
    if (!piTotalsGuard.ok) {
        return res.status(400).json({
            error: 'Client-supplied totals are not accepted. Pricing is calculated on the server.',
            code: 'CLIENT_TOTALS_REJECTED',
        });
    }
    const { shipping_address, notes, ship_to_id, payment_method } = req.body;
    const marketingAttPi = sanitizeMarketingAttribution(req.body && req.body.marketing_attribution);
    if (payment_method !== 'credit_card' && payment_method !== 'ach') {
        return res.status(400).json({ error: 'Use this endpoint only for credit_card or ach. Use POST /api/orders for Net 30.' });
    }

    try {
    // ====== FIX 4: Duplicate order prevention (idempotency) ======
    // Check for existing pending_payment order within last 10 minutes
    try {
        const existingOrder = await dataService.getRecentPendingPaymentOrder(req.user.id, 10);
        if (existingOrder && existingOrder.stripe_payment_intent_id) {
            // Return existing order's payment intent to continue payment
            try {
                const existingIntent = await stripe.paymentIntents.retrieve(existingOrder.stripe_payment_intent_id);
                if (existingIntent && existingIntent.status !== 'succeeded' && existingIntent.status !== 'canceled') {
                    paymentLog.duplicatePrevented(req.user.id, existingOrder.order_number, existingOrder.id);
                    const uReuse = await usersService.getUserById(req.user.id);
                    const pmReuse = existingOrder.payment_method || payment_method;
                    const purchase_analytics = buildPurchaseAnalyticsClientPayload(
                        existingOrder.items || [],
                        existingOrder,
                        uReuse,
                        pmReuse
                    );
                    return res.json({
                        success: true,
                        client_secret: existingIntent.client_secret,
                        order_id: existingOrder.id,
                        order_number: existingOrder.order_number,
                        total: existingOrder.total,
                        reused_existing: true,
                        purchase_analytics,
                    });
                }
            } catch (intentErr) {
                // PaymentIntent may be expired or invalid, continue to create new one
                console.log(`[create-payment-intent] Existing PaymentIntent not reusable: ${intentErr.message}`);
            }
        }
    } catch (idempotencyErr) {
        console.error('[create-payment-intent] Idempotency check failed:', idempotencyErr.message);
        // Continue with order creation on error
    }

    const companyIds = await getCompanyIdsForAuthenticatedUser(req);
    const addrResPi = await resolveFinalShippingAddressForCheckout(companyIds, req.user.id, ship_to_id, shipping_address);
    if (!addrResPi.ok) return res.status(addrResPi.status).json(addrResPi.body);
    const { finalShippingAddress } = addrResPi;

    const cartKey = `user_${req.user.id}`;
    const cartItems = await loadAndValidateCartForCheckout(cartKey, res, 'checkout_create_payment_intent');
    if (!cartItems) return;
    if (!(await assertCheckoutCartLinesMatchBody(cartItems, req.body, res))) return;

    const user = await usersService.getUserById(req.user.id);
    const companyIdForPricing = user ? await companiesService.getCompanyIdForUser(user) : null;
    const pricingCtxPi = await getPricingContext();
    const moneyPi = await checkoutCompute.computeCheckoutMoneyFromCart({
        cartItems,
        finalShippingAddress,
        user,
        companyId: companyIdForPricing,
        pricingContext: pricingCtxPi,
        productsService,
    });
    if (!moneyPi.ok) return res.status(moneyPi.status).json(moneyPi.body);

    const { orderItems, subtotal, discount, shipping, tax, total, taxResult, shipCfg: shipCfgPi } = moneyPi.value;

    const amountCents = Math.round(total * 100);
    if (amountCents < 50) return res.status(400).json({ error: 'Order total must be at least $0.50 to pay by card or ACH.' });
    const orderNumber = 'GC-' + Date.now().toString(36).toUpperCase();
    let paymentIntent;
    try {
        paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: 'usd',
            automatic_payment_methods: { enabled: true },
            metadata: { order_number: orderNumber, user_id: String(req.user.id) }
        });
        paymentLog.paymentIntentCreated(paymentIntent.id, orderNumber, req.user.id, amountCents);
    } catch (err) {
        console.error('[Stripe] PaymentIntent create failed:', err.message);
        return res.status(502).json({ error: 'Could not create payment session. Please try again or use a different payment method.' });
    }
    const companyId = companyIdForPricing;
    const orderPayload = {
        user_id: req.user.id,
        order_number: orderNumber,
        status: 'pending_payment',
        payment_method,
        subtotal,
        discount,
        shipping,
        tax,
        tax_rate: taxResult.rate,
        tax_reason: taxResult.reason,
        total,
        shipping_address: finalShippingAddress,
        ship_to_id: ship_to_id || null,
        notes: notes || '',
        stripe_payment_intent_id: paymentIntent.id,
        tracking_number: '',
        tracking_url: '',
        ...buildOrderEconomicsOrderFields({ subtotal, shipping, shipCfg: shipCfgPi }),
        items: orderItems.map((i) => {
            const snap = buildLineCostSnapshotFields(i.cost_at_order, i.quantity);
            return {
                product_id: i.product_id,
                quantity: i.quantity,
                size: i.size,
                unit_price: i.price,
                canonical_product_id: i.canonical_product_id,
                unit_cost_at_order: snap.unit_cost_at_order,
                total_cost_at_order: snap.total_cost_at_order,
            };
        }),
    };
    if (marketingAttPi) orderPayload.marketing_attribution = marketingAttPi;
    let order;
    try {
        order = await dataService.createOrder(orderPayload, { companyId, createdByUserId: req.user.id });
    } catch (createErr) {
        const code = createErr && (createErr.code || createErr.cause?.code);
        if (code === '23505' || (createErr.message && /duplicate key|unique constraint/i.test(createErr.message))) {
            try {
                await stripe.paymentIntents.cancel(paymentIntent.id);
            } catch (_) { /* best effort */ }
            paymentLog.logError('create_payment_intent.duplicate_stripe_pi', createErr, { pi_id: paymentIntent.id });
            return res.status(409).json({
                error: 'Payment session conflict. Please start checkout again.',
                code: 'DUPLICATE_PAYMENT_INTENT',
            });
        }
        throw createErr;
    }
    paymentLog.orderCreated(order.id, orderNumber, req.user.id, total, payment_method);
    
    try {
        await inventory.reserveStockForOrder(order.id, order.items);
        paymentLog.inventoryReserved(order.id, order.items);
    } catch (resErr) {
        paymentLog.logError('inventory.reserve_failed_create_payment_intent', resErr, {
            order_id: order.id,
            user_id: req.user.id,
            order_number: orderNumber,
        });
        try {
            await stripe.paymentIntents.cancel(paymentIntent.id);
            await dataService.updateOrderStatus(order.id, 'cancelled');
        } catch (_) { /* best effort cleanup */ }
        return res.status(400).json({ error: resErr.message || 'Insufficient stock. Please update your cart.' });
    }
    
    await dataService.setCart(cartKey, []);
    
    // Update PaymentIntent with order_id in metadata
    try {
        await stripe.paymentIntents.update(paymentIntent.id, { 
            metadata: { ...paymentIntent.metadata, order_id: String(order.id) } 
        });
    } catch (updateErr) {
        // Non-fatal but log it
        console.warn('[create-payment-intent] Failed to update PaymentIntent metadata:', updateErr.message);
    }

    const purchase_analytics = buildPurchaseAnalyticsClientPayload(orderItems, order, user, payment_method);
    res.json({
        success: true,
        client_secret: paymentIntent.client_secret,
        order_id: order.id,
        order_number: orderNumber,
        total,
        purchase_analytics,
    });
    } catch (err) {
        if (respondCommerceCanonicalError(err, res)) return;
        console.error('[create-payment-intent]', err);
        res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        let orders = await dataService.getOrdersByCompanyId(companyIds, req.user.id);
        
        const { page = 1, limit = 25, status, from, to, search } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
        
        if (status) {
            orders = orders.filter(o => o.status === status);
        }
        if (from) {
            const fromDate = new Date(from).toISOString();
            orders = orders.filter(o => o.created_at >= fromDate);
        }
        if (to) {
            const toDate = new Date(to);
            toDate.setDate(toDate.getDate() + 1);
            orders = orders.filter(o => o.created_at < toDate.toISOString());
        }
        if (search) {
            const searchLower = search.toLowerCase();
            orders = orders.filter(o => {
                const orderNum = (o.order_number || `GC-${o.id}`).toLowerCase();
                if (orderNum.includes(searchLower)) return true;
                const items = o.items || [];
                return items.some(item => {
                    const name = (item.product_name || item.name || '').toLowerCase();
                    const sku = (item.sku || '').toLowerCase();
                    return name.includes(searchLower) || sku.includes(searchLower);
                });
            });
        }
        
        orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        const total = orders.length;
        const pages = Math.ceil(total / limitNum);
        const offset = (pageNum - 1) * limitNum;
        const paginatedOrders = orders.slice(offset, offset + limitNum);
        
        res.json({
            orders: paginatedOrders,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages
            }
        });
    } catch (err) {
        console.error('[GET /api/orders]', err);
        res.status(500).json({ error: err.message || 'Failed to load orders' });
    }
});

app.get('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const order = await dataService.getOrderByIdForCompany(req.params.id, companyIds, req.user.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.shipping_address && typeof order.shipping_address === 'object' && order.shipping_address.display) {
            order.shipping_address = order.shipping_address.display;
        }
        res.json(order);
    } catch (err) {
        console.error('[GET /api/orders/:id]', err);
        res.status(500).json({ error: err.message || 'Failed to load order' });
    }
});

// Reorder preview: current B2B pricing vs last order (no cart mutation)
app.get('/api/orders/:id/reorder-preview', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const order = await dataService.getOrderByIdForCompany(req.params.id, companyIds, req.user.id);
        if (!order || !order.items || order.items.length === 0) {
            return res.status(404).json({ error: 'Order not found or has no items' });
        }
        const user = await usersService.getUserById(req.user.id);
        const companyIdForPricing = user ? await companiesService.getCompanyIdForUser(user) : null;
        const pricingContext = await getPricingContext();
        const lines = await orderReorder.buildReorderPreviews(
            order.items,
            user,
            companyIdForPricing,
            pricingContext,
            productsService
        );
        res.json({
            order_id: order.id,
            order_number: order.order_number,
            lines,
            disclaimer:
                'Prices shown are today’s contract/catalog rates. Cart and checkout use server-verified totals.',
        });
    } catch (err) {
        console.error('[GET /api/orders/:id/reorder-preview]', err);
        res.status(500).json({ error: err.message || 'Failed to build reorder preview' });
    }
});

/**
 * Reorder into cart: optional body.lines = [{ product_id, size?, quantity }].
 * Omit lines or send null to add every line that is still available (original quantities).
 * Empty array is rejected (use omit lines for “all available”).
 */
app.post('/api/orders/:id/reorder', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const order = await dataService.getOrderByIdForCompany(req.params.id, companyIds, req.user.id);
        if (!order || !order.items || order.items.length === 0) {
            return res.status(404).json({ error: 'Order not found or has no items' });
        }
        const user = await usersService.getUserById(req.user.id);
        const companyIdForPricing = user ? await companiesService.getCompanyIdForUser(user) : null;
        const pricingContext = await getPricingContext();
        const previews = await orderReorder.buildReorderPreviews(
            order.items,
            user,
            companyIdForPricing,
            pricingContext,
            productsService
        );

        const rawLines = req.body && req.body.lines;
        if (Array.isArray(rawLines) && rawLines.length === 0) {
            return res.status(400).json({
                error: 'Select items to add, or omit "lines" to add all products that are still available.',
            });
        }

        const resolved = orderReorder.resolveReorderSelections(previews, rawLines);
        if (!resolved.ok) return res.status(400).json({ error: resolved.error });

        const skippedUnavailable = previews.filter((p) => p.status !== 'available');
        if (resolved.adds.length === 0) {
            return res.status(400).json({
                error: 'No items from this order can be added right now (removed from catalog or out of stock).',
                skipped_unavailable: skippedUnavailable.map((s) => ({
                    product_id: s.product_id,
                    size: s.size,
                    name: s.name,
                    reason: s.reason,
                })),
            });
        }

        const cartKey = `user_${req.user.id}`;
        const cartItems = await dataService.getCart(cartKey);
        let n = 0;
        const results = [];

        for (const { preview, quantity } of resolved.adds) {
            const existing = cartItems.find(
                (c) =>
                    String(c.product_id) === String(preview.product_id) &&
                    orderReorder.normSize(c.size) === orderReorder.normSize(preview.size)
            );
            if (existing) existing.quantity += quantity;
            else {
                const line = {
                    id: Date.now() + n,
                    product_id: preview.product_id,
                    size: preview.size || null,
                    quantity,
                };
                if (preview.canonical_product_id) line.canonical_product_id = preview.canonical_product_id;
                cartItems.push(line);
                n += 1;
            }
            results.push({
                product_id: preview.product_id,
                size: preview.size,
                quantity_added: quantity,
                status: 'added',
            });
        }

        try {
            await ensureCommerceLinesHaveCanonical(cartItems, 'reorder');
        } catch (e) {
            if (respondCommerceCanonicalError(e, res)) return;
            throw e;
        }
        await dataService.setCart(cartKey, cartItems);
        res.json({
            success: true,
            mode: resolved.mode,
            added_lines: results.length,
            results,
            skipped_unavailable: skippedUnavailable.map((s) => ({
                product_id: s.product_id,
                size: s.size,
                name: s.name,
                reason: s.reason,
            })),
        });
    } catch (err) {
        if (respondCommerceCanonicalError(err, res)) return;
        console.error('[POST /api/orders/:id/reorder]', err);
        res.status(500).json({ error: err.message || 'Failed to reorder' });
    }
});

// Invoice data for an order (for display/print)
app.get('/api/orders/:id/invoice', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const order = await dataService.getOrderByIdForCompany(req.params.id, companyIds, req.user.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.shipping_address && typeof order.shipping_address === 'object' && order.shipping_address.display) order.shipping_address = order.shipping_address.display;
        const user = await usersService.getUserById(req.user.id);
        const items = order.items || [];
        const invoiceTotals = orderInvoiceTotals.computeInvoiceTotalsForDisplay(order, items);
        const totalsValidation = orderInvoiceTotals.validateInvoiceTotalsMatchOrder(order, invoiceTotals);
        res.json({
            order,
            company: user ? { company_name: user.company_name, contact_name: user.contact_name, address: user.address, city: user.city, state: user.state, zip: user.zip, email: user.email, phone: user.phone } : null,
            invoice_totals: {
                ...invoiceTotals,
                totals_match_order: totalsValidation.ok,
                ...(totalsValidation.ok ? {} : { totals_mismatch_message: totalsValidation.error }),
            },
        });
    } catch (err) {
        console.error('[GET /api/orders/:id/invoice]', err);
        res.status(500).json({ error: err.message || 'Failed to load invoice' });
    }
});

// Invoice PDF download
app.get('/api/orders/:id/invoice/pdf', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const order = await dataService.getOrderByIdForCompany(req.params.id, companyIds, req.user.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        const user = await usersService.getUserById(req.user.id);
        const company = user ? {
            company_name: user.company_name || '',
            contact_name: user.contact_name || '',
            address: user.address || '',
            city: user.city || '',
            state: user.state || '',
            zip: user.zip || '',
            email: user.email || '',
            phone: user.phone || ''
        } : {};
        
        const orderNumber = order.order_number || `GC-${order.id}`;
        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : '';
        const items = order.items || [];
        const totals = orderInvoiceTotals.computeInvoiceTotalsForDisplay(order, items);
        const validation = orderInvoiceTotals.validateInvoiceTotalsMatchOrder(order, totals);
        if (!validation.ok) {
            console.error('[GET /api/orders/:id/invoice/pdf]', validation.error);
            return res.status(409).json({ error: validation.error || 'Invoice totals do not match order' });
        }
        const { subtotal, shipping, tax, discount, orderTotal: total } = totals;

        let shippingAddress = order.shipping_address || '';
        if (typeof shippingAddress === 'object' && shippingAddress.display) {
            shippingAddress = shippingAddress.display;
        }
        
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Invoice ${orderNumber}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .logo { font-size: 28px; font-weight: bold; color: #2563eb; }
        .invoice-title { font-size: 24px; color: #666; }
        .invoice-number { font-size: 14px; color: #666; margin-top: 5px; }
        .addresses { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .address-block { width: 45%; }
        .address-block h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background: #f3f4f6; text-align: left; padding: 12px; font-size: 12px; text-transform: uppercase; color: #666; }
        td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
        .totals { text-align: right; }
        .totals table { width: 300px; margin-left: auto; }
        .totals td { padding: 8px 12px; }
        .total-row { font-weight: bold; font-size: 18px; border-top: 2px solid #333; }
        .footer { margin-top: 50px; text-align: center; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="logo">GLOVECUBS</div>
            <div style="font-size: 12px; color: #666;">Industrial Gloves & Safety Supplies</div>
        </div>
        <div style="text-align: right;">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">${orderNumber}</div>
            <div class="invoice-number">Date: ${orderDate}</div>
        </div>
    </div>
    
    <div class="addresses">
        <div class="address-block">
            <h3>Bill To</h3>
            <div><strong>${company.company_name}</strong></div>
            <div>${company.contact_name}</div>
            <div>${company.address}</div>
            <div>${company.city}${company.city && company.state ? ', ' : ''}${company.state} ${company.zip}</div>
            <div>${company.email}</div>
            <div>${company.phone}</div>
        </div>
        <div class="address-block">
            <h3>Ship To</h3>
            <div>${shippingAddress || 'Same as billing'}</div>
        </div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>SKU</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Unit Price</th>
                <th style="text-align: right;">Total</th>
            </tr>
        </thead>
        <tbody>
            ${items.map(item => `
            <tr>
                <td>${item.product_name || item.name || 'Product'}${item.size ? ` - ${item.size}` : ''}</td>
                <td>${item.sku || '-'}</td>
                <td style="text-align: center;">${item.quantity}</td>
                <td style="text-align: right;">$${(item.unit_price || 0).toFixed(2)}</td>
                <td style="text-align: right;">$${((item.quantity || 0) * (item.unit_price || 0)).toFixed(2)}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    
    <div class="totals">
        <table>
            <tr><td>Subtotal:</td><td style="text-align: right;">$${subtotal.toFixed(2)}</td></tr>
            ${discount > 0 ? `<tr><td>Discount:</td><td style="text-align: right;">-$${discount.toFixed(2)}</td></tr>` : ''}
            <tr><td>Shipping:</td><td style="text-align: right;">$${shipping.toFixed(2)}</td></tr>
            <tr><td>Tax:</td><td style="text-align: right;">$${tax.toFixed(2)}</td></tr>
            <tr class="total-row"><td>Total:</td><td style="text-align: right;">$${total.toFixed(2)}</td></tr>
        </table>
    </div>
    
    <div class="footer">
        <p>Thank you for your business!</p>
        <p>Questions? Contact us at support@glovecubs.com</p>
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${orderNumber}.html"`);
        res.send(htmlContent);
    } catch (err) {
        console.error('[GET /api/orders/:id/invoice/pdf]', err);
        res.status(500).json({ error: err.message || 'Failed to generate invoice' });
    }
});

// Order tracking details
app.get('/api/orders/:id/tracking', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const order = await dataService.getOrderByIdForCompany(req.params.id, companyIds, req.user.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        const trackingEvents = order.tracking_events || [];
        let status = 'processing';
        if (order.status === 'delivered' || order.actual_delivery) status = 'delivered';
        else if (order.status === 'shipped' || order.tracking_number) status = 'shipped';
        else if (order.status === 'cancelled') status = 'cancelled';
        else if (order.status) status = order.status;
        
        res.json({
            order_id: order.id,
            order_number: order.order_number || `GC-${order.id}`,
            carrier: order.carrier || null,
            tracking_number: order.tracking_number || null,
            tracking_url: order.tracking_url || null,
            status,
            estimated_delivery: order.estimated_delivery || null,
            actual_delivery: order.actual_delivery || null,
            events: trackingEvents
        });
    } catch (err) {
        console.error('[GET /api/orders/:id/tracking]', err);
        res.status(500).json({ error: err.message || 'Failed to load tracking' });
    }
});

// ============ ACCOUNT: BUDGET, REP, TIER PROGRESS ============

app.get('/api/account/tier-progress', authenticateToken, async (req, res) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const companyIds = await companiesService.getCompanyIdsForUser(user);
        const orders = await dataService.getOrdersByCompanyId(companyIds, req.user.id);
        const metrics = pricingTierEvaluationService.computeSpendMetrics(orders);
        const ytdSpend = metrics.ytd;
        const currentTier = user.discount_tier || 'standard';
        let tierRows = [];
        try {
            tierRows = await pricingTiersService.listTiersForAdmin();
        } catch (e) {
            console.error('[tier-progress] listTiers', e.message || e);
        }
        const ladder = tierRows
            .filter((t) => t.active && t.require_is_approved && t.min_spend_ytd != null && t.sort_priority > 0)
            .sort((a, b) => (a.min_spend_ytd || 0) - (b.min_spend_ytd || 0));
        const nextTierRow = ladder.find((t) => ytdSpend < (t.min_spend_ytd || 0));
        res.json({
            ytd_spend: ytdSpend,
            current_tier: currentTier,
            next_tier: nextTierRow ? nextTierRow.code : null,
            next_tier_display: nextTierRow ? nextTierRow.display_name : null,
            next_tier_threshold: nextTierRow ? nextTierRow.min_spend_ytd : null,
            amount_to_next_tier:
                nextTierRow && nextTierRow.min_spend_ytd != null
                    ? Math.max(0, nextTierRow.min_spend_ytd - ytdSpend)
                    : 0,
            pricing_tier_source: user.pricing_tier_source || 'manual',
            trailing_spend: {
                d30: metrics.trailing_30,
                d60: metrics.trailing_60,
                d90: metrics.trailing_90,
                calendar_month: metrics.calendar_month,
            },
            /** Tier discount is applied on the server on every cart/quote/order (next pricing call after tier changes). */
            tier_effective_policy: 'next_pricing_refresh',
        });
    } catch (err) {
        console.error('[account/tier-progress]', err);
        res.status(500).json({ error: err.message || 'Failed to load tier progress' });
    }
});

app.get('/api/account/budget', authenticateToken, async (req, res) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const companyIds = await companiesService.getCompanyIdsForUser(user);
        const orders = await dataService.getOrdersByCompanyId(companyIds, req.user.id);
        const budgetAmount = user.budget_amount != null ? user.budget_amount : null;
        const budgetPeriod = user.budget_period || 'monthly';
        const now = new Date();
        const periodStart = budgetPeriod === 'annual' ? new Date(now.getFullYear(), 0, 1).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const periodOrders = orders.filter(o => o.created_at >= periodStart);
        const spent = periodOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        res.json({ budget_amount: budgetAmount, budget_period: budgetPeriod, spent, remaining: budgetAmount != null ? Math.max(0, budgetAmount - spent) : null });
    } catch (err) {
        console.error('[account/budget]', err);
        res.status(500).json({ error: err.message || 'Failed to load budget' });
    }
});

app.put('/api/account/budget', authenticateToken, async (req, res) => {
    try {
        const { budget_amount, budget_period } = req.body;
        const user = await usersService.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const updates = {};
        if (budget_amount !== undefined) updates.budget_amount = budget_amount == null || budget_amount === '' ? null : parseFloat(budget_amount);
        if (budget_period !== undefined) updates.budget_period = budget_period === 'annual' ? 'annual' : 'monthly';
        await usersService.updateUser(user.id, updates);
        const updated = await usersService.getUserById(req.user.id);
        const { password, password_hash, ...safeUser } = updated || {};
        res.json({ success: true, user: safeUser });
    } catch (err) {
        console.error('[account/budget PUT]', err);
        res.status(500).json({ error: err.message || 'Failed to update budget' });
    }
});

app.get('/api/account/summary', authenticateToken, async (req, res) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const companyIds = await companiesService.getCompanyIdsForUser(user);
        const allOrders = await dataService.getOrdersByCompanyId(companyIds, req.user.id);
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const ytdOrders = allOrders.filter(o => o.created_at >= yearStart);
        const last30Orders = allOrders.filter(o => o.created_at >= thirtyDaysAgo);
        const totalSpend = allOrders.reduce((s, o) => s + (o.total || 0), 0);
        const ytdSpend = ytdOrders.reduce((s, o) => s + (o.total || 0), 0);
        const last30Spend = last30Orders.reduce((s, o) => s + (o.total || 0), 0);
        let totalSavings = 0, totalUnits = 0;
        for (const order of allOrders) {
            for (const item of order.items || []) {
                const product = await productsService.getProductById(item.product_id);
                const listPrice = product ? (product.price || 0) : (item.unit_price != null ? item.unit_price : item.price);
                const paid = (item.unit_price != null ? item.unit_price : item.price || 0) * (item.quantity || 0);
                const listTotal = listPrice * (item.quantity || 0);
                if (listTotal > paid) totalSavings += listTotal - paid;
                totalUnits += item.quantity || 0;
            }
        }
        res.json({
            total_spend: Math.round(totalSpend * 100) / 100,
            ytd_spend: Math.round(ytdSpend * 100) / 100,
            last_30_days_spend: Math.round(last30Spend * 100) / 100,
            total_savings: Math.round(totalSavings * 100) / 100,
            order_count: allOrders.length,
            total_units: totalUnits,
            ytd_orders: ytdOrders.length
        });
    } catch (err) {
        console.error('[account/summary]', err);
        res.status(500).json({ error: err.message || 'Failed to load summary' });
    }
});

// Dashboard aggregate stats for customer portal
app.get('/api/account/dashboard', authenticateToken, async (req, res) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const companyIds = await companiesService.getCompanyIdsForUser(user);
        const supabase = getSupabaseAdmin();
        
        const allOrders = await dataService.getOrdersByCompanyId(companyIds, req.user.id);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const ordersThisMonth = allOrders.filter(o => o.created_at >= monthStart);
        
        const pendingShipments = allOrders.filter(o => 
            o.status === 'processing' || o.status === 'shipped' || 
            (o.status === 'pending' && o.payment_status === 'paid')
        );
        
        const { count: favoritesCount } = await supabase
            .from('product_favorites')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', req.user.id);
        
        const recentOrders = allOrders
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5)
            .map(o => ({
                id: o.id,
                order_number: o.order_number || `GC-${o.id}`,
                created_at: o.created_at,
                status: o.status || 'pending',
                total: o.total || 0,
                item_count: (o.items || []).length,
                tracking_number: o.tracking_number || null
            }));
        
        res.json({
            orders_this_month: ordersThisMonth.length,
            pending_shipments: pendingShipments.length,
            favorites_count: favoritesCount || 0,
            recent_orders: recentOrders,
            account: {
                company_name: user.company_name || '',
                customer_id: `CUST-${user.id}`,
                pricing_tier: user.discount_tier || 'standard',
                contact_name: user.contact_name || '',
                email: user.email || ''
            }
        });
    } catch (err) {
        console.error('[account/dashboard]', err);
        res.status(500).json({ error: err.message || 'Failed to load dashboard' });
    }
});

app.get('/api/account/rep', authenticateToken, async (req, res) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            name: user.rep_name || process.env.REP_NAME || 'Glovecubs Sales',
            email: user.rep_email || process.env.REP_EMAIL || 'sales@glovecubs.com',
            phone: user.rep_phone || process.env.REP_PHONE || '1-800-GLOVECUBS'
        });
    } catch (err) {
        console.error('[account/rep]', err);
        res.status(500).json({ error: err.message || 'Failed to load rep' });
    }
});

// ============ SHIP-TO ADDRESSES ============

app.get('/api/ship-to', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const list = await dataService.getShipToByCompanyId(companyIds, req.user.id);
        res.json(list);
    } catch (err) {
        console.error('[ship-to GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load ship-to addresses' });
    }
});

app.post('/api/ship-to', authenticateToken, async (req, res) => {
    try {
        const { label, address, city, state, zip, is_default } = req.body;
        if (!address || !city || !state || !zip) return res.status(400).json({ error: 'Address, city, state, and zip are required' });
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const user = await usersService.getUserById(req.user.id);
        const companyId = user ? await companiesService.getCompanyIdForUser(user) : null;
        const list = await dataService.getShipToByCompanyId(companyIds, req.user.id);
        if (list.some(s => (s.label || '').toLowerCase() === (label || '').toLowerCase())) return res.status(400).json({ error: 'A ship-to address with this label already exists' });
        const newShipTo = await dataService.createShipTo({ companyId, createdByUserId: req.user.id, label, address, city, state, zip, is_default });
        res.json({ success: true, ship_to: newShipTo });
    } catch (err) {
        console.error('[ship-to POST]', err);
        res.status(500).json({ error: err.message || 'Failed to add ship-to address' });
    }
});

app.put('/api/ship-to/:id', authenticateToken, async (req, res) => {
    try {
        const { label, address, city, state, zip, is_default } = req.body;
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const shipTo = await dataService.updateShipTo(req.params.id, companyIds, req.user.id, { label, address, city, state, zip, is_default });
        res.json({ success: true, ship_to: shipTo });
    } catch (err) {
        if (err.message === 'Ship-to address not found') return res.status(404).json({ error: err.message });
        console.error('[ship-to PUT]', err);
        res.status(500).json({ error: err.message || 'Failed to update ship-to address' });
    }
});

app.delete('/api/ship-to/:id', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        await dataService.deleteShipTo(req.params.id, companyIds, req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[ship-to DELETE]', err);
        res.status(404).json({ error: 'Ship-to address not found' });
    }
});

// ============ SAVED LISTS ============

app.get('/api/saved-lists', authenticateToken, async (req, res) => {
    try {
        const list = await dataService.getSavedListsByUserId(req.user.id);
        res.json(list);
    } catch (err) {
        console.error('[saved-lists GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load saved lists' });
    }
});

app.post('/api/saved-lists', authenticateToken, async (req, res) => {
    try {
        const { name, items } = req.body;
        if (!name || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Name and items (array of { product_id, size, quantity }) are required' });
        const listItems = items.map((i) => {
            const row = { product_id: i.product_id, size: i.size || null, quantity: Math.max(1, parseInt(i.quantity, 10) || 1) };
            if (i.canonical_product_id) row.canonical_product_id = String(i.canonical_product_id);
            return row;
        });
        await ensureCommerceLinesHaveCanonical(listItems, 'saved_list_create');
        const newList = await dataService.createSavedList(req.user.id, { name: name.trim(), items: listItems });
        res.json({ success: true, list: newList });
    } catch (err) {
        if (respondCommerceCanonicalError(err, res)) return;
        console.error('[saved-lists POST]', err);
        res.status(500).json({ error: err.message || 'Failed to create saved list' });
    }
});

app.put('/api/saved-lists/:id', authenticateToken, async (req, res) => {
    try {
        const { name, items } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (Array.isArray(items)) {
            const listItems = items.map((i) => {
                const row = { product_id: i.product_id, size: i.size || null, quantity: Math.max(1, parseInt(i.quantity, 10) || 1) };
                if (i.canonical_product_id) row.canonical_product_id = String(i.canonical_product_id);
                return row;
            });
            await ensureCommerceLinesHaveCanonical(listItems, 'saved_list_update');
            updates.items = listItems;
        }
        const list = await dataService.updateSavedList(req.params.id, req.user.id, updates);
        res.json({ success: true, list });
    } catch (err) {
        if (respondCommerceCanonicalError(err, res)) return;
        console.error('[saved-lists PUT]', err);
        res.status(404).json({ error: 'Saved list not found' });
    }
});

app.delete('/api/saved-lists/:id', authenticateToken, async (req, res) => {
    try {
        await dataService.deleteSavedList(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[saved-lists DELETE]', err);
        res.status(404).json({ error: 'Saved list not found' });
    }
});

app.post('/api/saved-lists/:id/add-to-cart', authenticateToken, async (req, res) => {
    try {
        const list = await dataService.getSavedListById(req.params.id, req.user.id);
        if (!list || !list.items || list.items.length === 0) return res.status(404).json({ error: 'Saved list not found or empty' });
        const cartKey = `user_${req.user.id}`;
        const cartItems = await dataService.getCart(cartKey);
        const enrichedListLines = list.items.map((i) => ({ ...i }));
        await ensureCommerceLinesHaveCanonical(enrichedListLines, 'saved_list_add_to_cart_source');
        for (const item of enrichedListLines) {
            const catalogV2Id = resolveLineCatalogProductId(item);
            if (!catalogV2Id) continue;
            const listingId = resolveCartLineListingProductId(item);
            const product = await productsService.getProductById(listingId || catalogV2Id);
            if (!product) continue;
            const existing = cartItems.find(
                (c) =>
                    String(resolveLineCatalogProductId(c)) === String(catalogV2Id) && (c.size || null) === (item.size || null)
            );
            if (existing) {
                existing.quantity += item.quantity;
                existing.canonical_product_id = catalogV2Id;
                existing.product_id = catalogV2Id;
                existing.listing_id = item.listing_id;
            } else {
                cartItems.push(
                    cartLineContract.newCartLineFromBody(
                        {
                            product_id: catalogV2Id,
                            size: item.size,
                            quantity: item.quantity,
                            canonical_product_id: catalogV2Id,
                            listing_id: item.listing_id,
                        },
                        Date.now() + Math.random()
                    )
                );
            }
        }
        try {
            await ensureCommerceLinesHaveCanonical(cartItems, 'saved_list_add_to_cart_cart');
        } catch (e) {
            if (respondCommerceCanonicalError(e, res)) return;
            throw e;
        }
        await dataService.setCart(cartKey, cartItems);
        res.json({ success: true, message: 'List items added to cart' });
    } catch (err) {
        if (respondCommerceCanonicalError(err, res)) return;
        console.error('[saved-lists add-to-cart]', err);
        res.status(500).json({ error: err.message || 'Failed to add to cart' });
    }
});

// ============ PRODUCT FAVORITES (Wishlist) ============

app.get('/api/favorites', authenticateToken, async (req, res) => {
    try {
        const supabase = getSupabaseAdmin();
        const { data: favorites, error } = await supabase
            .from('product_favorites')
            .select('id, product_id, created_at')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        
        const productIds = favorites.map((f) => f.product_id).filter((id) => normalizeCanonicalUuidInput(id));
        const catalogRows = await Promise.all(productIds.map((id) => productsService.getProductById(id)));
        const products = catalogRows
            .filter(Boolean)
            .map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                sell_price: p.list_price,
                stock: p.quantity_on_hand ?? null,
                images: p.images,
            }));

        const result = favorites.map((fav) => {
            const product = products.find((p) => String(p.id) === String(fav.product_id));
            return {
                id: fav.id,
                product_id: fav.product_id,
                created_at: fav.created_at,
                product: product
                    ? {
                          id: product.id,
                          name: product.name,
                          sku: product.sku,
                          price: product.sell_price,
                          stock: product.stock,
                          image_url: Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null,
                      }
                    : null,
            };
        });
        
        res.json({ favorites: result, count: result.length });
    } catch (err) {
        console.error('[favorites GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load favorites' });
    }
});

app.post('/api/favorites', authenticateToken, async (req, res) => {
    try {
        const { product_id } = req.body;
        const catalogId = normalizeCanonicalUuidInput(product_id);
        if (!catalogId) {
            return res.status(422).json({
                error: 'product_id must be a catalogos.products UUID',
                code: 'INVALID_CATALOG_PRODUCT_ID',
            });
        }

        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('product_favorites')
            .upsert({ user_id: req.user.id, product_id: catalogId }, { onConflict: 'user_id,product_id' })
            .select()
            .single();
        if (error) throw error;
        res.json({ id: data.id, product_id: data.product_id, created_at: data.created_at });
    } catch (err) {
        console.error('[favorites POST]', err);
        res.status(500).json({ error: err.message || 'Failed to add favorite' });
    }
});

app.delete('/api/favorites/:productId', authenticateToken, async (req, res) => {
    try {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase
            .from('product_favorites')
            .delete()
            .eq('user_id', req.user.id)
            .eq('product_id', req.params.productId);
        if (error) throw error;
        res.status(204).send();
    } catch (err) {
        console.error('[favorites DELETE]', err);
        res.status(500).json({ error: err.message || 'Failed to remove favorite' });
    }
});

app.get('/api/products/:id/favorite', authenticateToken, async (req, res) => {
    try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
            .from('product_favorites')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('product_id', req.params.id)
            .maybeSingle();
        if (error) throw error;
        res.json({ is_favorited: !!data });
    } catch (err) {
        console.error('[product favorite check]', err);
        res.status(500).json({ error: err.message || 'Failed to check favorite status' });
    }
});

// ============ UPLOADED INVOICES (for cost analysis) ============

app.get('/api/invoices', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const list = await dataService.getUploadedInvoicesByCompanyId(companyIds, req.user.id);
        res.json(list.sort((a, b) => new Date(b.invoice_date || b.created_at) - new Date(a.invoice_date || a.created_at)));
    } catch (err) {
        console.error('[invoices GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load invoices' });
    }
});

app.post('/api/invoices', authenticateToken, async (req, res) => {
    try {
        const { vendor, invoice_date, total_amount, notes, line_items } = req.body;
        if (!total_amount || isNaN(parseFloat(total_amount))) return res.status(400).json({ error: 'Total amount is required.' });
        const user = await usersService.getUserById(req.user.id);
        const companyId = user ? await companiesService.getCompanyIdForUser(user) : null;
        const inv = await dataService.createUploadedInvoice({ companyId, createdByUserId: req.user.id, vendor, invoice_date, total_amount: parseFloat(total_amount), notes, line_items });
        res.json({ success: true, invoice: inv });
    } catch (err) {
        console.error('[invoices POST]', err);
        res.status(500).json({ error: err.message || 'Failed to save invoice' });
    }
});

app.delete('/api/invoices/:id', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        await dataService.deleteUploadedInvoice(req.params.id, companyIds, req.user.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[invoices DELETE]', err);
        res.status(404).json({ error: 'Invoice not found' });
    }
});

// ============ BULK ADD TO CART (CSV / SKU list) ============

app.post('/api/cart/bulk', authenticateToken, async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items array required (e.g. [{ sku, quantity, size? }])' });
        const cartKey = `user_${req.user.id}`;
        const cartItems = await dataService.getCart(cartKey);
        let added = 0, skipped = 0;
        for (const row of items) {
            const sku = (row.sku || row.SKU || '').toString().trim();
            const qty = Math.max(1, parseInt(row.quantity || row.qty || 1, 10));
            const size = row.size || null;
            if (!sku) { skipped++; continue; }
            const product = await productsService.getProductById(sku);
            if (!product) { skipped++; continue; }
            const existing = cartItems.find(
                (c) => String(c.product_id) === String(product.id) && (c.size || null) === (size || null)
            );
            if (existing) {
                existing.quantity += qty;
                existing.canonical_product_id = product.id;
                existing.product_id = product.id;
            } else {
                const line = cartLineContract.newCartLineFromBody(
                    { product_id: product.id, size, quantity: qty, canonical_product_id: product.id },
                    Date.now() + added
                );
                cartItems.push(line);
            }
            added++;
        }
        try {
            await ensureCommerceLinesHaveCanonical(cartItems, 'cart_bulk');
        } catch (e) {
            if (respondCommerceCanonicalError(e, res)) return;
            throw e;
        }
        await dataService.setCart(cartKey, cartItems);
        res.json({ success: true, added, skipped });
    } catch (err) {
        if (respondCommerceCanonicalError(err, res)) return;
        console.error('[cart/bulk]', err);
        res.status(500).json({ error: err.message || 'Failed to add to cart' });
    }
});

// ============ RFQ ROUTES ============

app.post('/api/rfqs', async (req, res) => {
    try {
        const {
            company_name, contact_name, email, phone, quantity, type, use_case, notes, cases_or_pallets, size, material,
            product_interest, estimated_volume, source
        } = req.body;
        let userId = null;
        let user = null;
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.id;
                user = await usersService.getUserById(userId);
            } catch (e) { /* ignore */ }
        }
        const companyId = user ? await companiesService.getCompanyIdForUser(user) : null;
        const newRFQ = await dataService.createRfq({
            company_name: company_name || (user && user.company_name) || '',
            contact_name: contact_name || (user && user.contact_name) || '',
            email: email || (user && user.email) || '',
            phone: phone || (user && user.phone) || '',
            quantity: quantity || '',
            type: type || '',
            use_case: use_case || '',
            cases_or_pallets: (cases_or_pallets || '').toString().trim() || '',
            size: size || '',
            material: material || '',
            notes: notes || '',
            product_interest: (product_interest || '').toString().trim(),
            estimated_volume: (estimated_volume || '').toString().trim(),
            source: (source || (user ? 'buyer_portal' : 'web_modal')).toString().trim().slice(0, 120)
        }, { companyId, createdByUserId: userId });
        // Send RFQ confirmation email with improved template
        const rfqEmail = newRFQ.email || (user && user.email);
        if (rfqEmail) {
            const emailContent = emailTemplates.rfqConfirmation(newRFQ, user);
            dispatchEmailInBackground({
                to: rfqEmail,
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html,
                emailType: 'rfq_customer_confirmation',
                metadata: { rfq_id: newRFQ.id },
            });
        }
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
        if (adminEmail) {
            const adminText = `New RFQ #${newRFQ.id}\nCompany: ${newRFQ.company_name}\nContact: ${newRFQ.contact_name}\nEmail: ${newRFQ.email}\nSource: ${newRFQ.source || '—'}\nProduct/SKU interest: ${newRFQ.product_interest || '—'}\nEst. volume: ${newRFQ.estimated_volume || '—'}\nQuantity: ${newRFQ.quantity}\nType: ${newRFQ.type}\nUse case: ${newRFQ.use_case}\nCases/pallets: ${newRFQ.cases_or_pallets || '—'}\nNotes: ${newRFQ.notes}`;
            dispatchEmailInBackground({
                to: adminEmail,
                subject: `[Glovecubs] New RFQ from ${newRFQ.company_name || newRFQ.email}`,
                text: adminText,
                emailType: 'rfq_admin_notification',
                metadata: { rfq_id: newRFQ.id },
            });
        }
        res.json({ success: true, message: 'RFQ submitted successfully', rfq_id: newRFQ.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/rfqs/mine', authenticateToken, async (req, res) => {
    try {
        const companyIds = await getCompanyIdsForAuthenticatedUser(req);
        const list = await dataService.getRfqsByCompanyId(companyIds, req.user.id);
        res.json(list);
    } catch (err) {
        console.error('[rfqs/mine]', err);
        res.status(500).json({ error: err.message || 'Failed to load RFQs' });
    }
});

app.get('/api/rfqs', authenticateToken, async (req, res) => {
    try {
        const isAdminUser = await usersService.isAdmin(req.user.id);
        if (!isAdminUser) return res.status(403).json({ error: 'Admin access required' });
        const rfqs = await dataService.getRfqs();
        res.json(rfqs);
    } catch (err) {
        console.error('[rfqs GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load RFQs' });
    }
});

app.put('/api/rfqs/:id', authenticateToken, async (req, res) => {
    try {
        const isAdminUser = await usersService.isAdmin(req.user.id);
        if (!isAdminUser) return res.status(403).json({ error: 'Admin access required' });
        const updates = {};
        if (req.body.status) updates.status = req.body.status;
        if (req.body.admin_notes !== undefined) updates.admin_notes = req.body.admin_notes;
        else if (req.body.notes !== undefined) updates.admin_notes = req.body.notes;
        if (req.body.append_admin_note) updates.append_admin_note = req.body.append_admin_note;
        if (req.body.lost_reason !== undefined) updates.lost_reason = req.body.lost_reason;
        const rfq = await dataService.updateRfq(req.params.id, updates);
        if (!rfq) return res.status(404).json({ error: 'RFQ not found' });
        res.json({ success: true, rfq });
    } catch (err) {
        console.error('[rfqs PUT]', err);
        res.status(500).json({ error: err.message || 'Failed to update RFQ' });
    }
});

/** Lightweight public lead capture (honeypot field "website" must be empty). Rate-limited. */
app.post('/api/public/lead-capture', leadCaptureLimiter, async (req, res) => {
    try {
        const out = await growthPipelineService.capturePublicLead(req.body || {});
        res.json(out);
    } catch (err) {
        const code = err.statusCode || 500;
        console.error('[public/lead-capture]', err);
        res.status(code).json({ error: err.message || 'Failed to save lead' });
    }
});

// ============ ADMIN ROUTES ============

app.get('/api/admin/orders', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const payHold = req.query.payment_integrity_hold;
        const statusFilter = req.query.status;
        const orders = await dataService.getAllOrdersAdmin({
            payment_integrity_hold: payHold === '1' || payHold === 'true',
            status: statusFilter && String(statusFilter).trim() ? String(statusFilter).trim() : undefined,
        });
        const userIds = [...new Set(orders.map(o => o.user_id))];
        const userMap = new Map();
        for (const id of userIds) {
            const u = await usersService.getUserById(id);
            if (u) userMap.set(id, u);
        }
        const out = orders.map(o => ({
            ...o,
            user: (() => { const u = userMap.get(o.user_id); return u ? { company_name: u.company_name, email: u.email, contact_name: u.contact_name } : null; })()
        }));
        res.json(out);
    } catch (err) {
        console.error('[admin/orders GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load orders' });
    }
});

/** Record payment on a Net 30 order; updates invoice_status and decreases company.outstanding_balance. */
app.post('/api/admin/orders/:id/invoice/payment', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const order = await dataService.getOrderByIdAdmin(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (String(order.payment_method || '').toLowerCase() !== 'net30') {
            return res.status(400).json({ error: 'Order is not a Net 30 invoice order.' });
        }
        if (order.invoice_amount_due == null) {
            return res.status(400).json({
                error:
                    'Invoice AR is not opened for this order. Apply net30/AR migrations (including gc_commerce) or contact support.',
                code: 'INVOICE_NOT_OPENED',
            });
        }
        const paid = Number(order.invoice_amount_paid) || 0;
        const due = Number(order.invoice_amount_due) || 0;
        const remaining = Math.round((due - paid) * 100) / 100;
        let amount = req.body && req.body.amount != null && req.body.amount !== '' ? Number(req.body.amount) : remaining;
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'amount must be a positive number (omit to pay remaining balance).' });
        }
        const result = await arInvoiceService.recordInvoicePayment({
            orderId: order.id,
            companyId: order.company_id,
            amount,
            note: req.body && req.body.note != null ? String(req.body.note).slice(0, 2000) : null,
            adminUserId: req.user.id,
        });
        res.json({ success: true, ...result });
    } catch (err) {
        const code = err.statusCode || 500;
        console.error('[admin/orders invoice/payment]', err);
        res.status(code).json({ error: err.message || 'Failed to record payment' });
    }
});

app.put('/api/admin/orders/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const order = await dataService.getOrderByIdAdmin(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (req.body.status !== undefined) {
            const v = validateAdminOrderStatusTransition(order, req.body.status);
            if (!v.ok) {
                return res.status(v.httpStatus).json({ error: v.message, code: v.code });
            }
        }
        const updates = {};
        if (req.body.tracking_number !== undefined) updates.tracking_number = String(req.body.tracking_number || '').trim();
        if (req.body.tracking_url !== undefined) updates.tracking_url = String(req.body.tracking_url || '').trim();
        if (req.body.status !== undefined) updates.status = req.body.status;
        const wasShipped = order.status === 'shipped';

        if (updates.status !== undefined && ABANDON_STATUSES.has(updates.status)) {
            try {
                await inventory.tryReleaseReservedStockForNonFulfillment(req.params.id, req.user.id);
            } catch (relErr) {
                paymentLog.logError('inventory.release_on_admin_abandon_failed', relErr, {
                    order_id: Number(req.params.id),
                    new_status: updates.status,
                    user_id: req.user.id,
                });
                return res.status(500).json({ error: relErr.message || 'Failed to release reserved inventory' });
            }
        }

        // Deduct before persisting shipped so we do not mark fulfilled if deduct fails.
        if (updates.status === 'shipped' && !wasShipped) {
            try {
                await inventory.deductStockForOrder(req.params.id, req.user.id);
            } catch (deductErr) {
                paymentLog.logError('inventory.deduct_failed_admin_ship', deductErr, {
                    order_id: Number(req.params.id),
                    user_id: req.user.id,
                });
                return res.status(500).json({ error: deductErr.message || 'Failed to deduct inventory; order not marked shipped.' });
            }
        }

        await dataService.updateOrder(req.params.id, updates);

        if (updates.status === 'shipped' && !wasShipped) {
            try {
                const user = await usersService.getUserById(order.user_id);
                if (user && user.email) {
                    const updatedOrder = await dataService.getOrderByIdAdmin(req.params.id);
                    const trackingInfo = {
                        tracking_number: updates.tracking_number || order.tracking_number || null,
                        tracking_url: updates.tracking_url || order.tracking_url || null,
                        carrier: req.body.carrier || null
                    };
                    const emailContent = emailTemplates.orderShipped(updatedOrder, user, trackingInfo);
                    await dispatchEmail({
                        to: user.email,
                        subject: emailContent.subject,
                        text: emailContent.text,
                        html: emailContent.html,
                        emailType: 'order_shipped',
                        orderId: order.id,
                        orderNumber: order.order_number,
                    });
                }
            } catch (emailErr) {
                paymentLog.emailFailed(order.id, order.order_number, 'order_shipped', emailErr);
                paymentLog.adminEmailAlert({
                    severity: 'error',
                    email_type: 'order_shipped',
                    order_id: order.id,
                    order_number: order.order_number,
                    error_message: emailErr.message || String(emailErr),
                    note: 'exception_before_or_during_dispatch',
                });
            }
        }
        
        const updated = await dataService.getOrderByIdAdmin(req.params.id);
        res.json({ success: true, order: updated });
    } catch (err) {
        console.error('[admin/orders PUT]', err);
        res.status(500).json({ error: err.message || 'Failed to update order' });
    }
});

app.get('/api/admin/users', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const users = await usersService.getAllUsers();
        const safe = users.map(u => { const { password, password_hash, ...rest } = u; return rest; });
        res.json(safe);
    } catch (err) {
        console.error('[admin/users GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load users' });
    }
});

// Admin: create new customer (approved, with optional quicklist and payment terms)
app.post('/api/admin/users', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const { company_name, contact_name, email, password, phone, address, city, state, zip, payment_terms, allow_free_upgrades, quicklist } = req.body;
        if (!company_name || !contact_name || !email || !password) return res.status(400).json({ error: 'Company name, contact name, email, and password are required' });
        const emailTrim = (email || '').toString().trim().toLowerCase();
        const existing = await usersService.getUserByEmail(emailTrim);
        if (existing) return res.status(400).json({ error: 'Email already registered' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await usersService.createUser({
        company_name: (company_name || '').trim(),
        contact_name: (contact_name || '').trim(),
        email: emailTrim,
        password_hash: hashedPassword,
        plain_password: password,
        phone: (phone || '').trim(),
        address: (address || '').trim(),
        city: (city || '').trim(),
        state: (state || '').trim(),
        zip: (zip || '').trim(),
        payment_terms: (payment_terms === 'net30' ? 'net30' : payment_terms === 'ach' ? 'ach' : 'credit_card'),
        allow_free_upgrades: !!allow_free_upgrades,
        is_approved: 1,
        discount_tier: 'standard',
        pricing_tier_source: 'manual',
        budget_amount: null,
        budget_period: 'monthly',
        rep_name: '',
        rep_email: '',
        rep_phone: ''
        });
        if (quicklist && quicklist.name && Array.isArray(quicklist.items) && quicklist.items.length > 0) {
            await dataService.createSavedList(newUser.id, {
                name: (quicklist.name || 'Quicklist').trim(),
                items: quicklist.items.map(i => ({ product_id: i.product_id, size: i.size || null, quantity: Math.max(1, parseInt(i.quantity, 10) || 1) }))
            });
        }
        const { password: _pw, password_hash: _pwh, ...safeUser } = newUser;
        res.status(201).json({ success: true, user: safeUser, message: 'Customer created. They can sign in and place orders.' });
    } catch (err) {
        console.error('[admin/users POST]', err);
        res.status(500).json({ error: err.message || 'Failed to create user' });
    }
});

app.put('/api/admin/users/:id', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const user = await usersService.getUserById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const oldTier = user.discount_tier;
        const updates = {};
        if (req.body.is_approved !== undefined) updates.is_approved = req.body.is_approved ? 1 : 0;
        if (req.body.discount_tier) {
            updates.discount_tier = req.body.discount_tier;
            updates.pricing_tier_source =
                req.body.pricing_tier_source === 'auto' ? 'auto' : 'manual';
        }
        if (req.body.pricing_tier_source !== undefined && !req.body.discount_tier) {
            updates.pricing_tier_source = req.body.pricing_tier_source === 'auto' ? 'auto' : 'manual';
        }
        if (req.body.payment_terms !== undefined) {
            const pt = req.body.payment_terms;
            updates.payment_terms = (pt === 'net30' ? 'net30' : pt === 'ach' ? 'ach' : 'credit_card');
        }
        await usersService.updateUser(req.params.id, updates);
        if (
            req.body.discount_tier &&
            String(req.body.discount_tier).toLowerCase() !== String(oldTier || '').toLowerCase()
        ) {
            try {
                await pricingTiersService.insertAuditLog({
                    userId: user.id,
                    oldTier,
                    newTier: String(req.body.discount_tier).toLowerCase(),
                    reason: (req.body.pricing_tier_change_reason || 'Admin updated tier').toString(),
                    source: 'admin_override',
                    metricsSnapshot: null,
                });
            } catch (logErr) {
                console.error('[admin/users PUT] tier audit', logErr);
            }
        }
        const updated = await usersService.getUserById(req.params.id);
        const { password, password_hash, ...safeUser } = updated || {};
        res.json({ success: true, user: safeUser });
    } catch (err) {
        console.error('[admin/users PUT]', err);
        res.status(500).json({ error: err.message || 'Failed to update user' });
    }
});

app.get('/api/admin/contact-messages', authenticateToken, async (req, res) => {
    try {
        if (!(await usersService.isAdmin(req.user.id))) return res.status(403).json({ error: 'Admin access required' });
        const messages = await dataService.listContactMessages();
        res.json(messages);
    } catch (err) {
        console.error('[admin/contact-messages]', err);
        res.status(500).json({ error: err.message || 'Failed to load messages' });
    }
});

// ---------- Admin: customer pricing (companies, default margin, manufacturer overrides) ----------
async function requireAdmin(req, res, next) {
    try {
        if (!(await usersService.isAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (err) {
        console.error('[requireAdmin]', err);
        res.status(500).json({ error: 'Database error' });
    }
}

app.get('/api/admin/growth/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const dashboard = await growthPipelineService.getDashboard();
        res.json(dashboard);
    } catch (err) {
        console.error('[admin/growth/dashboard]', err);
        res.status(500).json({ error: err.message || 'Failed to load pipeline' });
    }
});

app.get('/api/admin/growth/prospects', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 100;
        const status = req.query.status || null;
        const prospects = await growthPipelineService.listProspects({ limit, status });
        res.json({ prospects });
    } catch (err) {
        console.error('[admin/growth/prospects GET]', err);
        res.status(500).json({ error: err.message || 'Failed' });
    }
});

app.post('/api/admin/growth/prospects', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const prospect = await growthPipelineService.createProspect(req.body || {}, { adminUserId: req.user.id });
        res.json({ prospect });
    } catch (err) {
        console.error('[admin/growth/prospects POST]', err);
        res.status(500).json({ error: err.message || 'Failed to create prospect' });
    }
});

app.patch('/api/admin/growth/prospects/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const prospect = await growthPipelineService.updateProspect(req.params.id, req.body || {});
        if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
        res.json({ prospect });
    } catch (err) {
        console.error('[admin/growth/prospects PATCH]', err);
        res.status(500).json({ error: err.message || 'Failed to update' });
    }
});

/** Versioned shipping policy (DB); checkout reads active row via shippingPolicyService.resolveShippingConfigForCheckout. */
app.get('/api/admin/shipping-policies', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const list = await shippingPolicyService.listPolicyVersions({ limit: 120 });
        const active = await shippingPolicyService.resolveShippingConfigForCheckout();
        const enriched = await shippingPolicyService.enrichPoliciesWithOrderCounts(list);
        res.json({ policies: enriched, active });
    } catch (err) {
        console.error('[admin/shipping-policies GET]', err);
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Failed to load shipping policies' });
    }
});

app.post('/api/admin/shipping-policies', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const row = await shippingPolicyService.createPolicyVersion(req.body || {});
        res.status(201).json({ policy: row });
    } catch (err) {
        console.error('[admin/shipping-policies POST]', err);
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Failed to create policy' });
    }
});

app.post('/api/admin/shipping-policies/:id/activate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const row = await shippingPolicyService.activatePolicyVersion(req.params.id);
        res.json({ policy: row, message: 'New version created with effective_at = now(); it is now the active policy.' });
    } catch (err) {
        console.error('[admin/shipping-policies activate]', err);
        const code = err.statusCode || 500;
        res.status(code).json({ error: err.message || 'Failed to activate' });
    }
});

/** Read-only shipping / threshold / margin decision support (historical orders + counterfactuals). Does not change checkout. */
app.get('/api/admin/analytics/shipping-margin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const maxOrders = parseInt(req.query.max_orders, 10) || 800;
        const sinceDays = parseInt(req.query.since_days, 10) || 365;
        const excludeCancelled = req.query.include_cancelled === '1' ? false : true;
        const report = await shippingMarginAnalyticsService.buildShippingMarginReport({
            maxOrders,
            sinceDays,
            excludeCancelled
        });
        res.json(report);
    } catch (err) {
        console.error('[admin/analytics/shipping-margin]', err);
        res.status(500).json({ error: err.message || 'Failed to build report' });
    }
});

/** UTM / channel rollup on recent paid orders (read-only; bounded scan). See docs/ANALYTICS.md. */
app.get('/api/admin/analytics/channels', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : undefined;
        const data = await adminChannelAnalyticsService.getChannelAnalytics({ limit });
        res.json(data);
    } catch (err) {
        console.error('[admin/analytics/channels]', err);
        res.status(500).json({ error: err.message || 'Failed to load channel analytics' });
    }
});

// Operator queues: payment holds, stale checkout, inventory anomalies (JSON).
app.get('/api/admin/orders/operational-alerts', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 80;
        const alerts = await dataService.getAdminOrderOperationalAlerts(limit);
        res.json({
            ...alerts,
            hints: {
                list_payment_holds: '/api/admin/orders?payment_integrity_hold=true',
                list_by_status: '/api/admin/orders?status=pending_payment',
                stale_cleanup: 'POST /api/admin/orders/cleanup-stale',
                po_mapping_health: '/api/admin/po-mapping-health?summary=1',
                po_mapping_health_full: '/api/admin/po-mapping-health',
            },
        });
    } catch (err) {
        console.error('[admin/orders/operational-alerts]', err);
        res.status(500).json({ error: err.message || 'Failed to load operational alerts' });
    }
});

/** Active catalog variants: PO-blocking gaps (offers, supplier SKUs, manufacturer linkage). */
app.get('/api/admin/po-mapping-health', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : undefined;
        const issueCode = req.query.issue_code ? String(req.query.issue_code).trim() : null;
        const summary = req.query.summary === '1' || req.query.summary === 'true';
        const report = await runPoMappingHealthReport({
            limit: Number.isFinite(limit) ? limit : undefined,
            issueCode: issueCode || null,
            summary,
        });
        res.json(report);
    } catch (err) {
        console.error('[admin/po-mapping-health]', err);
        res.status(500).json({
            error: err.message || 'PO mapping health report failed',
            code: err.code || 'PO_MAPPING_HEALTH_ERROR',
            hint: 'Ensure migration po_mapping_health_report is applied (public.po_mapping_health_report).',
        });
    }
});

app.get('/api/admin/companies', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const list = await companiesService.getCompanies();
        res.json((list || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch (err) {
        console.error('[admin/companies]', err);
        res.status(500).json({ error: err.message || 'Failed to load companies' });
    }
});

app.post('/api/admin/companies', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const c = await companiesService.createCompany({ name: req.body && req.body.name });
        res.status(201).json(c);
    } catch (err) {
        const code = err.statusCode || 500;
        console.error('[admin/companies POST]', err);
        res.status(code).json({ error: err.message || 'Failed to create company' });
    }
});

app.patch('/api/admin/companies/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        if (!companiesService.isGcCompanyUuid(id)) {
            return res.status(400).json({ error: 'Invalid company id (UUID required)' });
        }
        const payload = {};
        if (req.body.name !== undefined) payload.name = req.body.name;
        if (req.body.default_gross_margin_percent !== undefined) {
            const p = Number(req.body.default_gross_margin_percent);
            if (Number.isNaN(p) || p < 0 || p >= 100) {
                return res.status(400).json({ error: 'default_gross_margin_percent must be 0–99.99' });
            }
            payload.default_gross_margin_percent = p;
        }
        const commercialKeys = [
            'net_terms_status',
            'credit_limit',
            'outstanding_balance',
            'invoice_terms_code',
            'invoice_terms_custom',
            'invoice_orders_allowed',
            'net_terms_internal_notes',
        ];
        for (const k of commercialKeys) {
            if (req.body[k] !== undefined) payload[k] = req.body[k];
        }
        if (Object.keys(payload).length === 0) {
            return res.status(400).json({
                error: 'No valid fields (name, default_gross_margin_percent, or net terms / commercial fields)',
            });
        }
        const company = await companiesService.updateCompany(id, payload);
        if (!company) return res.status(404).json({ error: 'Company not found' });
        res.json({ success: true, company });
    } catch (err) {
        const code = err.statusCode || 500;
        console.error('[admin/companies PATCH]', err);
        res.status(code).json({ error: err.message || 'Failed to update company' });
    }
});

app.get('/api/admin/net-terms/applications', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const status = req.query.status ? String(req.query.status).trim() : null;
        const applications = await netTermsService.listApplicationsForAdmin({ status: status || undefined });
        res.json({ applications });
    } catch (err) {
        console.error('[admin/net-terms/applications GET]', err);
        res.status(500).json({ error: err.message || 'Failed to list applications' });
    }
});

app.patch('/api/admin/net-terms/applications/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const application = await netTermsService.applyAdminDecision(req.user.id, req.params.id, req.body || {});
        res.json({ success: true, application });
    } catch (err) {
        const code = err.statusCode || 500;
        console.error('[admin/net-terms/applications PATCH]', err);
        res.status(code).json({ error: err.message || 'Failed to update application' });
    }
});

app.get('/api/admin/pricing-tiers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const tiers = await pricingTiersService.listTiersForAdmin();
        res.json({ tiers });
    } catch (err) {
        console.error('[admin/pricing-tiers GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load tiers' });
    }
});

app.put('/api/admin/pricing-tiers/:code', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const tier = await pricingTiersService.upsertTier(req.params.code, req.body || {});
        res.json({ success: true, tier });
    } catch (err) {
        const code = err.statusCode || 500;
        console.error('[admin/pricing-tiers PUT]', err);
        res.status(code).json({ error: err.message || 'Failed to save tier' });
    }
});

app.get('/api/admin/pricing/supplier-cost/default-rules', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { DEFAULT_RULES, normalizeRules } = require('./lib/supplierCostPricing');
        res.json({ rules: normalizeRules(DEFAULT_RULES) });
    } catch (err) {
        console.error('[admin/pricing/supplier-cost/default-rules]', err);
        res.status(500).json({ error: err.message || 'Failed' });
    }
});

app.get('/api/admin/pricing/supplier-cost/recent-runs', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(40, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const runs = await supplierCostImportService.listRecentRuns(limit);
        res.json({ runs });
    } catch (err) {
        console.error('[admin/pricing/supplier-cost/recent-runs]', err);
        res.status(500).json({ error: err.message || 'Failed to list runs' });
    }
});

app.post('/api/admin/pricing/supplier-cost/preview', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const csvText = req.body.csvText || req.body.csvContent || '';
        const rules = req.body.rules || {};
        const out = await supplierCostImportService.previewSupplierCostImport({
            csvText: String(csvText),
            rules,
            adminUserId: req.user && req.user.id
        });
        if (!out.ok) {
            return res.status(400).json(Object.assign({ error: out.error || 'Preview failed' }, out));
        }
        res.json(out);
    } catch (err) {
        console.error('[admin/pricing/supplier-cost/preview]', err);
        res.status(500).json({ error: err.message || 'Preview failed' });
    }
});

app.post('/api/admin/pricing/supplier-cost/apply', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const runId = parseInt(req.body.runId || req.body.run_id, 10);
        if (!runId) return res.status(400).json({ error: 'runId required' });
        const out = await supplierCostImportService.applyRun(runId, req.user && req.user.id);
        if (!out.ok) return res.status(400).json(out);
        res.json(out);
    } catch (err) {
        console.error('[admin/pricing/supplier-cost/apply]', err);
        res.status(500).json({ error: err.message || 'Apply failed' });
    }
});

app.get('/api/admin/pricing/supplier-cost/runs/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const run = await supplierCostImportService.getRun(id);
        if (!run) return res.status(404).json({ error: 'Not found' });
        res.json({ run });
    } catch (err) {
        console.error('[admin/pricing/supplier-cost/runs GET]', err);
        res.status(500).json({ error: err.message || 'Failed' });
    }
});

app.get('/api/admin/pricing/supplier-cost/runs/:id/lines', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const limit = parseInt(req.query.limit, 10) || 200;
        const offset = parseInt(req.query.offset, 10) || 0;
        const { lines, total } = await supplierCostImportService.getRunLines(id, limit, offset);
        res.json({ lines, total });
    } catch (err) {
        console.error('[admin/pricing/supplier-cost/runs/lines]', err);
        res.status(500).json({ error: err.message || 'Failed' });
    }
});

app.get('/api/admin/pricing/rule-sets', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const sets = await supplierCostImportService.listRuleSets();
        res.json({ rule_sets: sets });
    } catch (err) {
        console.error('[admin/pricing/rule-sets GET]', err);
        res.status(500).json({ error: err.message || 'Failed' });
    }
});

app.put('/api/admin/pricing/rule-sets/:name', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const out = await supplierCostImportService.upsertRuleSet(req.params.name, req.body || {});
        res.json(out);
    } catch (err) {
        console.error('[admin/pricing/rule-sets PUT]', err);
        res.status(400).json({ error: err.message || 'Failed' });
    }
});

app.get('/api/admin/users/:id/pricing-tier', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const u = await usersService.getUserById(req.params.id);
        if (!u) return res.status(404).json({ error: 'User not found' });
        const preview = await pricingTierEvaluationService.previewEvaluationForUser(req.params.id);
        const audit = await pricingTiersService.listAuditForUser(req.params.id, 40);
        res.json({
            user: {
                id: u.id,
                email: u.email,
                company_name: u.company_name,
                discount_tier: u.discount_tier,
                pricing_tier_source: u.pricing_tier_source,
                pricing_tier_evaluated_at: u.pricing_tier_evaluated_at,
                is_approved: u.is_approved,
            },
            metrics: preview.metrics,
            recommended: preview.recommended,
            audit_log: audit,
        });
    } catch (err) {
        console.error('[admin/users/:id/pricing-tier]', err);
        res.status(500).json({ error: err.message || 'Failed to load tier detail' });
    }
});

app.post('/api/admin/pricing-tiers/evaluate-user/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        if (body.preview_only === true) {
            const preview = await pricingTierEvaluationService.previewEvaluationForUser(req.params.id);
            const audit = await pricingTiersService.listAuditForUser(req.params.id, 40);
            return res.json({ preview_only: true, ...preview, audit_log: audit });
        }
        const result = await pricingTierEvaluationService.evaluateAndApplyUserTier(req.params.id, {
            source: 'admin_reevaluate',
            force: body.force === true,
        });
        res.json({ success: true, result });
    } catch (err) {
        const code = err.statusCode || 500;
        console.error('[admin/pricing-tiers/evaluate-user]', err);
        res.status(code).json({ error: err.message || 'Evaluation failed' });
    }
});

app.post('/api/admin/pricing-tiers/evaluate-all-auto', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const results = await pricingTierEvaluationService.evaluateAllAutoUsers({ source: 'admin_bulk' });
        res.json({ success: true, results });
    } catch (err) {
        console.error('[admin/pricing-tiers/evaluate-all-auto]', err);
        res.status(500).json({ error: err.message || 'Bulk evaluation failed' });
    }
});

app.get('/api/admin/owner/overview', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const data = await ownerCockpitService.getOverviewSnapshot();
        res.json(data);
    } catch (err) {
        console.error('[admin/owner/overview]', err);
        res.status(500).json({ error: err.message || 'Overview failed' });
    }
});

/** Commerce / operations metrics for admin Overview (bounded queries; see payload.meta). */
app.get('/api/admin/operations/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const data = await adminOperationsDashboardService.getOperationsDashboard();
        res.json(data);
    } catch (err) {
        console.error('[admin/operations/dashboard]', err);
        res.status(500).json({ error: err.message || 'Operations dashboard failed' });
    }
});

app.get('/api/admin/owner/companies-directory', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const rows = await ownerCockpitService.getCompaniesDirectory();
        res.json({ companies: rows });
    } catch (err) {
        console.error('[admin/owner/companies-directory]', err);
        res.status(500).json({ error: err.message || 'Failed to load directory' });
    }
});

app.get('/api/admin/owner/pricing', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const data = await ownerCockpitService.getPricingWorkspace();
        res.json(data);
    } catch (err) {
        console.error('[admin/owner/pricing]', err);
        res.status(500).json({ error: err.message || 'Failed to load pricing' });
    }
});

app.get('/api/admin/owner/stripe', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const data = await ownerCockpitService.getStripeVisibility();
        res.json(data);
    } catch (err) {
        console.error('[admin/owner/stripe]', err);
        res.status(500).json({ error: err.message || 'Failed to load Stripe snapshot' });
    }
});

app.get('/api/admin/owner/inventory-panel', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(800, Math.max(50, parseInt(req.query.limit, 10) || 400));
        const data = await ownerCockpitService.getInventoryIntegrityPanel(limit);
        res.json(data);
    } catch (err) {
        console.error('[admin/owner/inventory-panel]', err);
        res.status(500).json({ error: err.message || 'Failed to load inventory' });
    }
});

app.get('/api/admin/owner/admins-users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [cockpitAdmins, allUsers] = await Promise.all([
            usersService.listAppAdminsForCockpit(),
            usersService.getAllUsers()
        ]);
        const usersPublic = allUsers.map((u) => ({
            id: u.id,
            email: u.email,
            contact_name: u.contact_name,
            company_name: u.company_name,
            company_id: u.company_id,
            is_approved: u.is_approved,
            created_at: u.created_at,
            record_type: 'public.users'
        }));
        const pending = usersPublic.filter((u) => Number(u.is_approved) !== 1);
        const approved = usersPublic.filter((u) => Number(u.is_approved) === 1);
        res.json({
            app_admins_roster: cockpitAdmins.roster,
            owner_emails_from_env: cockpitAdmins.owner_emails_from_env,
            users_approved: approved.length,
            users_pending_approval: pending.length,
            pending_queue: pending.slice(0, 100),
            users_total: usersPublic.length,
            note: 'public.users.id matches auth.users (UUID); profile holds B2B fields and bcrypt for Express login. Admin UI requires app_admins.auth_user_id.'
        });
    } catch (err) {
        console.error('[admin/owner/admins-users]', err);
        res.status(500).json({ error: err.message || 'Failed to load admins/users' });
    }
});

app.get('/api/admin/manufacturers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const list = await dataService.getManufacturers();
        res.json(list || []);
    } catch (err) {
        console.error('[admin/manufacturers]', err);
        res.status(500).json({ error: err.message || 'Failed to load manufacturers' });
    }
});

app.patch('/api/admin/manufacturers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await dataService.updateManufacturer(req.params.id, { vendor_email: req.body.vendor_email, po_email: req.body.po_email });
        const list = await dataService.getManufacturers();
        const mfr = (list || []).find((m) => m.id == req.params.id);
        res.json(mfr || {});
    } catch (err) {
        console.error('[admin/manufacturers PATCH]', err);
        res.status(500).json({ error: err.message || 'Failed to update manufacturer' });
    }
});

// ---------- Inventory (in-app fishbowl) ----------
app.get('/api/admin/inventory', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const { products: rawProducts } = await productsService.getProducts({ limit: 10000 });
        const products = rawProducts || [];
        const invList = await dataService.getInventory();
        const byCanon = inventoryRowsByCanonicalProductId(invList);
        const rows = products.map((p) => {
            const canonKey = normalizeCanonicalUuidInput(p.catalog_v2_product_id);
            const inv = canonKey ? byCanon.get(canonKey) : null;
            const onHand = inv ? (inv.quantity_on_hand ?? 0) : (p.quantity_on_hand ?? 0);
            const reserved = inv ? (inv.quantity_reserved ?? 0) : 0;
            const available = Math.max(0, onHand - reserved);
            return {
                product_id: p.id,
                canonical_product_id: inv?.canonical_product_id ?? canonKey ?? null,
                sku: p.sku,
                name: p.name,
                brand: p.brand,
                quantity_on_hand: onHand,
                quantity_reserved: reserved,
                available_stock: available,
                reorder_point: inv ? (inv.reorder_point ?? 0) : (p.reorder_point ?? 0),
                bin_location: inv ? (inv.bin_location || '') : (p.bin_location || ''),
                last_count_at: inv ? inv.last_count_at : null
            };
        });
        res.json(rows);
    } catch (err) {
        console.error('[admin/inventory]', err.message);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: err.message || 'Failed to load inventory' });
    }
});

app.put('/api/admin/inventory/:product_id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const listingId = normalizeCanonicalUuidInput(req.params.product_id);
        if (!listingId) return res.status(400).json({ error: 'product_id must be a catalog listing UUID' });
        const product = await productsService.getProductById(listingId);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const v2 = normalizeCanonicalUuidInput(product.catalog_v2_product_id);

        let bodyCanon = null;
        if (req.body.canonical_product_id != null && String(req.body.canonical_product_id).trim() !== '') {
            bodyCanon = normalizeCanonicalUuidInput(req.body.canonical_product_id);
            if (!bodyCanon) return res.status(400).json({ error: 'Invalid canonical_product_id' });
        }
        const lookupKey = bodyCanon || v2;
        const existing = lookupKey ? await dataService.getInventoryByProductId(lookupKey) : null;
        const existingRowCanon = existing ? normalizeCanonicalUuidInput(existing.canonical_product_id) : null;
        const resolvedCanon = bodyCanon || v2 || existingRowCanon;

        if (!resolvedCanon) {
            return res.status(422).json({
                error:
                    'Could not resolve catalog_v2 id for this listing; set canonical_product_id on the request body or fix listing→v2 mapping.',
                code: 'INVENTORY_CANONICAL_REQUIRED',
            });
        }

        if (req.body.quantity_on_hand !== undefined) {
            const newQ = Math.max(0, parseInt(req.body.quantity_on_hand, 10) || 0);
            const reserved = existing ? (existing.quantity_reserved ?? 0) : 0;
            if (newQ < reserved) {
                return res.status(400).json({
                    error: `quantity_on_hand (${newQ}) cannot be less than quantity_reserved (${reserved}).`,
                    code: 'ON_HAND_BELOW_RESERVED',
                });
            }
            const current = existing ? (existing.quantity_on_hand ?? 0) : 0;
            const delta = newQ - current;
            if (delta !== 0) {
                await inventory.adjustStock(resolvedCanon, delta, 'Admin inventory PUT', { type: 'admin_put' }, req.user.id);
            }
            const supabase = getSupabaseAdmin();
            await supabase
                .from('inventory')
                .update({ last_count_at: new Date().toISOString() })
                .eq('canonical_product_id', resolvedCanon);
        }

        const fresh = resolvedCanon ? await dataService.getInventoryByProductId(resolvedCanon) : null;
        const payload = {
            quantity_on_hand: fresh ? (fresh.quantity_on_hand ?? 0) : 0,
            reorder_point:
                req.body.reorder_point !== undefined
                    ? Math.max(0, parseInt(req.body.reorder_point, 10) || 0)
                    : fresh
                      ? (fresh.reorder_point ?? 0)
                      : (product.reorder_point ?? 0),
            bin_location:
                req.body.bin_location !== undefined
                    ? String(req.body.bin_location || '').trim()
                    : fresh
                      ? (fresh.bin_location || '')
                      : '',
        };
        if (fresh && fresh.quantity_reserved != null) payload.quantity_reserved = fresh.quantity_reserved;
        if (bodyCanon) payload.canonical_product_id = bodyCanon;
        else if (v2) payload.canonical_product_id = v2;
        else if (existingRowCanon) payload.canonical_product_id = existingRowCanon;

        await dataService.upsertInventory(resolvedCanon, payload);
        const inv = await dataService.getInventoryByProductId(resolvedCanon);
        res.json(inv || { product_id: listingId, quantity_on_hand: 0, quantity_reserved: 0, reorder_point: 0, bin_location: '' });
    } catch (err) {
        console.error('[admin/inventory PUT]', err);
        res.status(500).json({ error: err.message || 'Failed to update inventory' });
    }
});

app.post('/api/admin/inventory/adjust', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { product_id, delta, reason } = req.body;
        const listingId = normalizeCanonicalUuidInput(product_id);
        if (!listingId) return res.status(400).json({ error: 'product_id must be a catalog listing UUID' });
        const product = await productsService.getProductById(listingId);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const d = parseInt(delta, 10);
        if (isNaN(d) || d === 0) return res.status(400).json({ error: 'delta must be a non-zero integer (positive to add, negative to subtract)' });
        const v2 = normalizeCanonicalUuidInput(product.catalog_v2_product_id);
        if (!v2) {
            return res.status(422).json({
                error: 'Product must resolve to catalog_v2 (listing → v2) before stock adjustments.',
                code: 'INVENTORY_CANONICAL_REQUIRED',
            });
        }
        await inventory.adjustStock(v2, d, reason || 'Admin adjustment', { type: 'admin' }, req.user.id);
        const stock = await inventory.getStock(v2);
        res.json({ success: true, stock: stock || { stock_on_hand: 0, stock_reserved: 0, available_stock: 0 } });
    } catch (err) {
        console.error('[admin/inventory/adjust]', err);
        res.status(500).json({ error: err.message || 'Failed to adjust inventory' });
    }
});

app.get('/api/admin/inventory/history', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
        const rawCanon = req.query.canonical_product_id;
        let canon = null;
        if (rawCanon != null && String(rawCanon).trim() !== '') {
            canon = normalizeCanonicalUuidInput(rawCanon);
            if (!canon) return res.status(400).json({ error: 'Invalid canonical_product_id' });
        }
        let productId = undefined;
        if (!canon && req.query.product_id != null && String(req.query.product_id).trim() !== '') {
            const listing = normalizeCanonicalUuidInput(req.query.product_id);
            if (!listing) return res.status(400).json({ error: 'Invalid product_id' });
            const prod = await productsService.getProductById(listing);
            canon = prod ? normalizeCanonicalUuidInput(prod.catalog_v2_product_id) : null;
            if (!canon) return res.status(400).json({ error: 'Could not resolve catalog_v2 for listing product_id' });
        }
        const history = await inventory.getStockHistory(productId, limit, { canonical_product_id: canon });
        res.json(history);
    } catch (err) {
        console.error('[admin/inventory/history]', err);
        res.status(500).json({ error: err.message || 'Failed to load stock history' });
    }
});

app.post('/api/admin/inventory/cycle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const counts = Array.isArray(req.body.counts) ? req.body.counts : [];
        const updated = [];
        const skipped = [];
        const rowErrors = [];
        for (const row of counts) {
            const listingId = normalizeCanonicalUuidInput(row.product_id);
            if (!listingId) {
                skipped.push({ reason: 'invalid_product_id' });
                continue;
            }
            const product = await productsService.getProductById(listingId);
            if (!product) {
                skipped.push({ product_id: listingId, reason: 'product_not_found' });
                continue;
            }
            const rowCanon =
                row.canonical_product_id != null && String(row.canonical_product_id).trim() !== ''
                    ? normalizeCanonicalUuidInput(row.canonical_product_id)
                    : null;
            if (row.canonical_product_id != null && String(row.canonical_product_id).trim() !== '' && !rowCanon) {
                skipped.push({ product_id: listingId, reason: 'invalid_canonical_product_id' });
                continue;
            }
            const v2 = normalizeCanonicalUuidInput(product.catalog_v2_product_id);
            const resolvedCanon = rowCanon || v2;
            if (!resolvedCanon) {
                skipped.push({ product_id: listingId, reason: 'missing_canonical_product_id' });
                continue;
            }
            const existing = await dataService.getInventoryByProductId(resolvedCanon);
            const target = Math.max(0, parseInt(row.quantity_on_hand, 10) || 0);
            const reserved = existing ? (existing.quantity_reserved ?? 0) : 0;
            if (target < reserved) {
                rowErrors.push({
                    product_id: listingId,
                    code: 'count_below_reserved',
                    quantity_reserved: reserved,
                    quantity_on_hand_requested: target,
                });
                continue;
            }
            const current = existing ? (existing.quantity_on_hand ?? 0) : 0;
            const delta = target - current;
            if (delta !== 0) {
                await inventory.adjustStock(resolvedCanon, delta, 'Cycle count', { type: 'cycle_count' }, req.user.id);
            }
            const supabase = getSupabaseAdmin();
            await supabase
                .from('inventory')
                .update({ last_count_at: new Date().toISOString() })
                .eq('canonical_product_id', resolvedCanon);
            updated.push(listingId);
        }
        res.json({
            success: true,
            updated_product_ids: updated,
            skipped,
            errors: rowErrors,
            counts_submitted: counts.length,
        });
    } catch (err) {
        console.error('[admin/inventory/cycle]', err);
        res.status(500).json({ error: err.message || 'Failed to cycle count' });
    }
});

// ============ STALE ORDER CLEANUP ============

// View stale pending_payment orders
app.get('/api/admin/orders/stale', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const minutes = parseInt(req.query.minutes, 10) || 60;
        const staleOrders = await dataService.getStalePendingPaymentOrders(minutes);
        res.json({ stale_orders: staleOrders, count: staleOrders.length, threshold_minutes: minutes });
    } catch (err) {
        console.error('[admin/orders/stale]', err);
        res.status(500).json({ error: err.message || 'Failed to fetch stale orders' });
    }
});

// Manually trigger cleanup of stale pending_payment orders
app.post('/api/admin/orders/cleanup-stale', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const minutes = parseInt(req.body.minutes, 10) || 60;
        const staleOrders = await dataService.getStalePendingPaymentOrders(minutes);
        
        if (staleOrders.length === 0) {
            return res.json({ success: true, cleaned: 0, message: 'No stale orders found' });
        }
        
        let cleaned = 0;
        let errors = [];
        
        for (const order of staleOrders) {
            try {
                const full = await dataService.getOrderByIdAdmin(order.id);
                const needRelease =
                    full &&
                    full.inventory_reserved_at &&
                    !full.inventory_released_at &&
                    !full.inventory_deducted_at;
                if (needRelease) {
                    try {
                        await inventory.tryReleaseReservedStockForNonFulfillment(order.id);
                        paymentLog.inventoryReleased(order.id, 'stale_pending_payment_cleanup');
                    } catch (releaseErr) {
                        paymentLog.logError('inventory.release_failed_stale_cleanup', releaseErr, {
                            order_id: order.id,
                        });
                        errors.push({ order_id: order.id, error: releaseErr.message, phase: 'release' });
                        continue;
                    }
                }
                await dataService.updateOrderStatus(order.id, 'expired');
                cleaned++;
            } catch (orderErr) {
                errors.push({ order_id: order.id, error: orderErr.message });
            }
        }
        
        res.json({ success: true, cleaned, errors: errors.length > 0 ? errors : undefined, total: staleOrders.length });
    } catch (err) {
        console.error('[admin/orders/cleanup-stale]', err);
        res.status(500).json({ error: err.message || 'Failed to cleanup stale orders' });
    }
});

// Reorder suggestions from historical order usage (last 90 days).
app.get('/api/admin/inventory/reorder-suggestions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const { products: rawProducts } = await productsService.getProducts({ limit: 10000 });
        const products = rawProducts || [];
        const invList = await dataService.getInventory();
        const byCanon = inventoryRowsByCanonicalProductId(invList);
        const allOrders = await dataService.getAllOrdersAdmin();
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const orders = allOrders.filter((o) => (o.created_at ? new Date(o.created_at).getTime() : 0) >= ninetyDaysAgo);
        const usageByProduct = new Map();
        orders.forEach((order) => {
            (order.items || []).forEach((item) => {
                const pid =
                    normalizeCanonicalUuidInput(item.canonical_product_id) ||
                    normalizeCanonicalUuidInput(item.product_id);
                if (pid == null) return;
                const qty = Math.max(0, parseInt(item.quantity, 10) || 0);
                const cur = usageByProduct.get(pid) || { units: 0, orders: 0 };
                cur.units += qty;
                cur.orders += 1;
                usageByProduct.set(pid, cur);
            });
        });
        const suggestions = products.map((p) => {
            const canonKey = normalizeCanonicalUuidInput(p.catalog_v2_product_id);
            const inv = canonKey ? byCanon.get(canonKey) : null;
            const qoh = inv ? (inv.quantity_on_hand ?? 0) : (p.quantity_on_hand ?? 0);
            const reorderPt = inv ? (inv.reorder_point ?? 0) : (p.reorder_point ?? 0);
            const usage = (canonKey && usageByProduct.get(canonKey)) || { units: 0, orders: 0 };
            const unitsSold90 = usage.units;
            const ordersCount90 = usage.orders;
            const weeklyAvg = unitsSold90 / 13;
            const suggestedNeed = Math.ceil(weeklyAvg * 4);
            const suggestedOrderQty = Math.max(0, Math.max(reorderPt, suggestedNeed) - qoh);
            return { product_id: p.id, sku: p.sku, name: p.name, brand: p.brand, quantity_on_hand: qoh, reorder_point: reorderPt, units_sold_90d: unitsSold90, orders_count_90d: ordersCount90, suggested_order_qty: suggestedOrderQty };
        }).filter((s) => s.suggested_order_qty > 0 || s.quantity_on_hand <= s.reorder_point).sort((a, b) => (b.suggested_order_qty || 0) - (a.suggested_order_qty || 0));
        res.json(suggestions);
    } catch (err) {
        console.error('[admin/inventory/reorder-suggestions]', err.message);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: err.message || 'Failed to load reorder suggestions' });
    }
});

// AI summary for restock suggestions (uses OpenAI if configured).
app.get('/api/admin/inventory/ai-reorder-summary', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.setHeader('Content-Type', 'application/json');
        const { products: rawProducts } = await productsService.getProducts({ limit: 10000 });
        const products = rawProducts || [];
        const invList = await dataService.getInventory();
        const byCanon = inventoryRowsByCanonicalProductId(invList);
        const allOrders = await dataService.getAllOrdersAdmin();
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const orders = allOrders.filter((o) => (o.created_at ? new Date(o.created_at).getTime() : 0) >= ninetyDaysAgo);
        const usageByProduct = new Map();
        orders.forEach((order) => {
            (order.items || []).forEach((item) => {
                const pid =
                    normalizeCanonicalUuidInput(item.canonical_product_id) ||
                    normalizeCanonicalUuidInput(item.product_id);
                if (pid == null) return;
                const qty = Math.max(0, parseInt(item.quantity, 10) || 0);
                const cur = usageByProduct.get(pid) || { units: 0, orders: 0 };
                cur.units += qty;
                cur.orders += 1;
                usageByProduct.set(pid, cur);
            });
        });
        const suggestions = products.map((p) => {
            const canonKey = normalizeCanonicalUuidInput(p.catalog_v2_product_id);
            const inv = canonKey ? byCanon.get(canonKey) : null;
            const qoh = inv ? (inv.quantity_on_hand ?? 0) : (p.quantity_on_hand ?? 0);
            const reorderPt = inv ? (inv.reorder_point ?? 0) : (p.reorder_point ?? 0);
            const usage = (canonKey && usageByProduct.get(canonKey)) || { units: 0, orders: 0 };
            const unitsSold90 = usage.units;
            const weeklyAvg = unitsSold90 / 13;
            const suggestedOrderQty = Math.max(0, Math.max(reorderPt, Math.ceil(weeklyAvg * 4)) - qoh);
            return { product_id: p.id, sku: p.sku, name: p.name, brand: p.brand, quantity_on_hand: qoh, reorder_point: reorderPt, units_sold_90d: unitsSold90, suggested_order_qty: suggestedOrderQty };
        }).filter((s) => s.suggested_order_qty > 0 || s.quantity_on_hand <= s.reorder_point).sort((a, b) => (b.suggested_order_qty || 0) - (a.suggested_order_qty || 0));
        const top = suggestions.slice(0, 25).map((s) => `${s.sku}: ${s.name} (${s.brand || '—'}) — on hand ${s.quantity_on_hand}, reorder pt ${s.reorder_point}, sold ${s.units_sold_90d} in 90d → suggest order ${s.suggested_order_qty}`).join('\n');
        if (!top) return res.json({ summary: 'No restock suggestions right now. Set reorder points and use historical orders to see AI suggestions.' });
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return res.json({ summary: 'Restock suggestions (from history):\n\n' + top.replace(/\n/g, '\n• ') + '\n\nSet OPENAI_API_KEY for an AI-written summary.' });
        const openai = require('openai');
        const client = new openai.OpenAI({ apiKey: openaiKey });
        const completion = await client.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a brief inventory restock advisor. In 2–4 sentences, summarize which products to reorder and why, based on current stock and recent sales. Be concise and actionable.' },
                { role: 'user', content: 'Suggest restock quantities for these products (stock to keep vs drop-ship):\n\n' + top }
            ],
            max_tokens: 300
        });
        const summary = (completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content) ? completion.choices[0].message.content.trim() : 'Unable to generate summary.';
        res.json({ summary });
    } catch (err) {
        console.error('[admin/inventory/ai-reorder-summary]', err.message);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: err.message || 'Failed to get AI summary' });
    }
});

// Inventory verification - check for data issues
app.get('/api/admin/inventory/verify', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const issues = await inventory.getInventoryIssues();
        res.json({
            ok: issues.length === 0,
            issue_count: issues.length,
            issues: issues.slice(0, 100) // Limit to first 100
        });
    } catch (err) {
        console.error('[admin/inventory/verify]', err);
        res.status(500).json({ error: err.message || 'Failed to verify inventory' });
    }
});

// Verify specific product inventory (catalogos.products UUID in URL)
app.get('/api/admin/inventory/:product_id/verify', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const canon = normalizeCanonicalUuidInput(req.params.product_id);
        if (!canon) return res.status(400).json({ error: 'Invalid catalog product id (UUID required)' });
        const product = await productsService.getProductById(canon);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const result = await inventory.verifyInventoryConsistency(canon);
        res.json(result);
    } catch (err) {
        console.error('[admin/inventory/verify/:id]', err);
        res.status(500).json({ error: err.message || 'Failed to verify inventory' });
    }
});

// ---------- Purchase Orders ----------
app.get('/api/admin/purchase-orders', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const list = await dataService.getPurchaseOrders();
        const manufacturers = await dataService.getManufacturers();
        const orders = await dataService.getAllOrdersAdmin();
        const mfrMap = new Map((manufacturers || []).map((m) => [m.id, m]));
        const orderMap = new Map((orders || []).map((o) => [o.id, o]));
        const out = (list || []).map((po) => ({
            ...po,
            manufacturer_name: mfrMap.get(po.manufacturer_id)?.name || '',
            order_number: po.order_id != null ? orderMap.get(po.order_id)?.order_number : null
        }));
        res.json(out);
    } catch (err) {
        console.error('[admin/purchase-orders GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load POs' });
    }
});

app.get('/api/admin/purchase-orders/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const po = await dataService.getPurchaseOrderById(req.params.id);
        if (!po) return res.status(404).json({ error: 'Purchase order not found' });
        const manufacturers = await dataService.getManufacturers();
        const mfr = (manufacturers || []).find((m) => m.id === po.manufacturer_id);
        const order = po.order_id != null ? await dataService.getOrderByIdAdmin(po.order_id) : null;
        res.json({ ...po, manufacturer_name: mfr ? mfr.name : '', order, order_number: order ? order.order_number : null });
    } catch (err) {
        console.error('[admin/purchase-orders/:id GET]', err);
        res.status(500).json({ error: err.message || 'Failed to load PO' });
    }
});

app.post('/api/admin/purchase-orders', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { manufacturer_id, order_id, lines, shipping_address, customer_order_number } = req.body;
        const mid = manufacturer_id != null ? parseInt(manufacturer_id, 10) : null;
        if (mid == null || isNaN(mid)) return res.status(400).json({ error: 'manufacturer_id required' });
        const manufacturers = await dataService.getManufacturers();
        const mfr = (manufacturers || []).find((m) => m.id === mid);
        if (!mfr) return res.status(400).json({ error: 'Manufacturer not found' });
        const lineItems = Array.isArray(lines) ? lines.map((l) => ({ product_id: l.product_id, sku: l.sku || '', name: l.name || '', quantity: Math.max(1, parseInt(l.quantity, 10) || 1), unit_cost: parseFloat(l.unit_cost) || 0 })) : [];
        const poNumber = await dataService.nextPoNumber();
        const subtotal = lineItems.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
        const po = await dataService.createPurchaseOrder({
            po_number: poNumber,
            manufacturer_id: mid,
            order_id: order_id != null ? parseInt(order_id, 10) : null,
            status: 'draft',
            lines: lineItems,
            shipping_address: shipping_address || null,
            customer_order_number: customer_order_number || null
        });
        res.json({ ...po, manufacturer_name: mfr.name, subtotal });
    } catch (err) {
        console.error('[admin/purchase-orders POST]', err);
        res.status(500).json({ error: err.message || 'Failed to create PO' });
    }
});

app.put('/api/admin/purchase-orders/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const po = await dataService.getPurchaseOrderById(req.params.id);
        if (!po) return res.status(404).json({ error: 'Purchase order not found' });
        const updates = {};
        if (req.body.lines !== undefined && Array.isArray(req.body.lines)) {
            updates.lines = req.body.lines.map((l) => ({
                product_id: l.product_id,
                sku: l.sku || '',
                name: l.name || '',
                quantity: Math.max(1, parseInt(l.quantity, 10) || 1),
                unit_cost: parseFloat(l.unit_cost) || 0
            }));
        }
        if (req.body.shipping_address !== undefined) updates.shipping_address = req.body.shipping_address;
        if (req.body.customer_order_number !== undefined) updates.customer_order_number = req.body.customer_order_number;
        await dataService.updatePurchaseOrder(req.params.id, updates);
        const updated = await dataService.getPurchaseOrderById(req.params.id);
        res.json(updated);
    } catch (err) {
        console.error('[admin/purchase-orders PUT]', err);
        res.status(500).json({ error: err.message || 'Failed to update PO' });
    }
});

app.post('/api/admin/purchase-orders/:id/send', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const po = await dataService.getPurchaseOrderById(req.params.id);
        if (!po) return res.status(404).json({ error: 'Purchase order not found' });
        const manufacturers = await dataService.getManufacturers();
        const mfr = (manufacturers || []).find((m) => m.id === po.manufacturer_id);
        if (!mfr) return res.status(400).json({ error: 'Manufacturer not found' });
        const toEmail = (mfr.po_email || mfr.vendor_email || '').toString().trim();
        if (!toEmail) return res.status(400).json({ error: 'Manufacturer has no PO/vendor email. Add it in Vendors.' });
        const lineText = (po.lines || []).map((l) => `  ${l.sku || l.name} - ${l.name || ''} x ${l.quantity} @ $${(l.unit_cost || 0).toFixed(2)}`).join('\n');
        const bodyText = `GloveCubs Purchase Order\n\nPO#: ${po.po_number}\nDate: ${(po.created_at || '').slice(0, 10)}\n\nShip to (drop-ship):\n${(po.shipping_address || 'See order').replace(/\n/g, '\n')}\n\nCustomer Order: ${po.customer_order_number || 'N/A'}\n\nLine items:\n${lineText}\n\nSubtotal: $${(po.subtotal || 0).toFixed(2)}\n\nPlease confirm and ship to the address above.\n\n— GloveCubs`;
        const result = await dispatchEmail({
            to: toEmail,
            subject: `Purchase Order ${po.po_number} - GloveCubs`,
            text: bodyText,
            html: bodyText.replace(/\n/g, '<br>'),
            emailType: 'purchase_order_vendor',
            orderId: po.order_id || null,
            orderNumber: po.customer_order_number || null,
            metadata: { po_id: po.id, po_number: po.po_number },
        });
        if (!result.sent) return res.status(500).json({ error: result.error || 'Failed to send email' });
        await dataService.updatePurchaseOrder(req.params.id, { status: 'sent', sent_at: new Date().toISOString() });
        res.json({ success: true, sent: true, po_number: po.po_number });
    } catch (err) {
        console.error('[admin/purchase-orders/:id/send]', err);
        res.status(500).json({ error: err.message || 'Failed to send PO' });
    }
});

app.post('/api/admin/purchase-orders/:id/receive', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const poId = parseInt(req.params.id, 10);
        if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });
        const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
        if (lines.length === 0) {
            return res.status(400).json({
                error: 'lines array required: [{ canonical_product_id (UUID), quantity_received }]',
            });
        }
        await inventory.receivePurchaseOrder(poId, lines);
        const updated = await dataService.getPurchaseOrderById(poId);
        res.json({ success: true, po: updated });
    } catch (err) {
        console.error('[admin/purchase-orders/:id/receive]', err);
        res.status(500).json({ error: err.message || 'Failed to receive PO' });
    }
});

// Create PO from customer order and send to vendor (drop-ship)
app.post('/api/admin/orders/:id/create-po', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const order = await dataService.getOrderByIdAdmin(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.payment_integrity_hold === true || order.payment_integrity_hold === 1) {
            return res.status(409).json({
                error: 'Order is on payment integrity hold; resolve Stripe vs order total before creating a PO.',
                code: 'PAYMENT_INTEGRITY_HOLD',
            });
        }
        if (order.status === 'pending_payment') {
            return res.status(409).json({
                error: 'Order has not completed payment; do not create a purchase order yet.',
                code: 'ORDER_AWAITING_PAYMENT',
            });
        }
        if (orderRequiresOnlinePaymentConfirmation(order) && !order.payment_confirmed_at) {
            return res.status(409).json({
                error: 'Payment must be confirmed before creating a PO for card/ACH (Stripe) orders.',
                code: 'PAYMENT_NOT_CONFIRMED',
            });
        }
        const manufacturers = await dataService.getManufacturers();
        const resolution = await buildPurchaseOrderLinesFromOrder(order, { orderId: order.id });
        if (!resolution.ok) {
            const summary = (resolution.blocked_lines || [])
                .map((b) => {
                    const li = b.order_line_index != null ? b.order_line_index + 1 : '?';
                    const pid = b.canonical_product_id != null ? b.canonical_product_id : '?';
                    return `Line ${li} (catalog ${pid}): ${b.code}`;
                })
                .join('; ');
            return res.status(422).json({
                error: `Cannot build purchase order — ${resolution.blocked_lines.length} line(s) blocked. ${summary}`,
                code: resolution.code || 'PO_LINE_VALIDATION_FAILED',
                blocked_lines: resolution.blocked_lines,
            });
        }
        const byMfr = resolution.byManufacturer;
        const mfrId =
            req.body.manufacturer_id != null ? parseInt(req.body.manufacturer_id, 10) : byMfr.size === 1 ? [...byMfr.keys()][0] : null;
        if (mfrId == null || isNaN(mfrId)) {
            const mfrSummaries = [...byMfr.keys()].map((id) => {
                const m = (manufacturers || []).find((x) => x.id === id);
                return { id, name: m ? m.name : '', line_count: (byMfr.get(id) || []).length };
            });
            return res.status(400).json({
                error:
                    'Order has line items for multiple manufacturers. Create one PO per manufacturer by passing manufacturer_id in the request body.',
                code: 'MULTI_MANUFACTURER_ORDER',
                manufacturers: mfrSummaries,
            });
        }
        const mfr = (manufacturers || []).find((m) => m.id === mfrId);
        if (!mfr) return res.status(400).json({ error: 'Manufacturer not found' });
        const lines = byMfr.get(mfrId) || [];
        if (lines.length === 0) {
            return res.status(400).json({
                error: 'No validated line items for the selected manufacturer.',
                code: 'NO_LINES_FOR_MANUFACTURER',
                manufacturer_id: mfrId,
            });
        }
        const poNumber = await dataService.nextPoNumber();
        const shippingDisplay = order.shipping_address && typeof order.shipping_address === 'object' && order.shipping_address.display ? order.shipping_address.display : (order.shipping_address || null);
        const po = await dataService.createPurchaseOrder({
            po_number: poNumber,
            manufacturer_id: mfrId,
            order_id: order.id,
            status: 'draft',
            lines,
            shipping_address: shippingDisplay,
            customer_order_number: order.order_number || null
        });
        const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
        const toEmail = (mfr.po_email || mfr.vendor_email || '').toString().trim();
        if (!toEmail) return res.json({ success: true, po: { ...po, manufacturer_name: mfr.name, subtotal }, message: 'PO created. Add vendor email in Vendors and send from Purchase Orders.' });
        const lineText = lines.map((l) => `  ${l.sku || l.name} - ${l.name || ''} x ${l.quantity} @ $${(l.unit_cost || 0).toFixed(2)}`).join('\n');
        const bodyText = `GloveCubs Purchase Order\n\nPO#: ${poNumber}\nDate: ${(po.created_at || '').slice(0, 10)}\n\nShip to (drop-ship):\n${(shippingDisplay || '').replace(/\n/g, '\n')}\n\nCustomer Order: ${order.order_number || 'N/A'}\n\nLine items:\n${lineText}\n\nSubtotal: $${subtotal.toFixed(2)}\n\nPlease confirm and ship to the address above.\n\n— GloveCubs`;
        const result = await dispatchEmail({
            to: toEmail,
            subject: `Purchase Order ${poNumber} - GloveCubs`,
            text: bodyText,
            html: bodyText.replace(/\n/g, '<br>'),
            emailType: 'purchase_order_vendor',
            orderId: order.id,
            orderNumber: order.order_number || null,
            metadata: { po_number: poNumber, po_id: po.id },
        });
        if (result.sent) {
            await dataService.updatePurchaseOrder(po.id, { status: 'sent', sent_at: new Date().toISOString() });
            return res.json({ success: true, po: { ...po, manufacturer_name: mfr.name, subtotal }, sent: true, message: 'PO created and sent to vendor.' });
        }
        res.json({ success: true, po: { ...po, manufacturer_name: mfr.name, subtotal }, sent: false, message: 'PO created. Email failed: ' + (result.error || 'unknown') });
    } catch (err) {
        console.error('[admin/orders/:id/create-po]', err);
        res.status(500).json({ error: err.message || 'Failed to create PO' });
    }
});

app.get('/api/admin/companies/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!companiesService.isGcCompanyUuid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid company id (UUID required)' });
        }
        const company = await companiesService.getCompanyById(req.params.id);
        if (!company) return res.status(404).json({ error: 'Company not found' });
        const overrides = await dataService.getOverridesByCompanyId(req.params.id);
        let ar_aging = null;
        try {
            ar_aging = await arAgingService.getCompanyArAging(req.params.id);
        } catch (ageErr) {
            console.error('[admin/companies/:id] ar_aging', ageErr);
        }
        res.json({ ...company, overrides, ar_aging });
    } catch (err) {
        console.error('[admin/companies/:id]', err);
        res.status(500).json({ error: err.message || 'Failed to load company' });
    }
});

app.post('/api/admin/companies/:id/default-margin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!companiesService.isGcCompanyUuid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid company id (UUID required)' });
        }
        let percent = req.body.default_gross_margin_percent != null ? Number(req.body.default_gross_margin_percent) : (req.body.margin_percent != null ? Number(req.body.margin_percent) : null);
        if (percent == null || isNaN(percent)) return res.status(400).json({ error: 'default_gross_margin_percent or margin_percent required' });
        if (percent < 0 || percent >= 100) return res.status(400).json({ error: 'Margin must be 0 <= margin < 100' });
        const company = await companiesService.updateCompany(req.params.id, { default_gross_margin_percent: percent });
        if (!company) return res.status(404).json({ error: 'Company not found' });
        res.json({ success: true, company });
    } catch (err) {
        console.error('[admin/companies default-margin]', err);
        res.status(500).json({ error: err.message || 'Failed to update margin' });
    }
});

app.post('/api/admin/companies/:id/overrides', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const companyId = req.params.id;
        if (!companiesService.isGcCompanyUuid(companyId)) {
            return res.status(400).json({ error: 'Invalid company id (UUID required)' });
        }
        const company = await companiesService.getCompanyById(companyId);
        if (!company) return res.status(404).json({ error: 'Company not found' });
        const manufacturer_id = req.body.manufacturer_id != null ? Number(req.body.manufacturer_id) : null;
        let gross_margin_percent = req.body.gross_margin_percent != null ? Number(req.body.gross_margin_percent) : (req.body.margin_percent != null ? Number(req.body.margin_percent) : null);
        if (manufacturer_id == null || isNaN(manufacturer_id)) return res.status(400).json({ error: 'manufacturer_id required' });
        if (gross_margin_percent == null || isNaN(gross_margin_percent) || gross_margin_percent < 0 || gross_margin_percent >= 100) return res.status(400).json({ error: 'gross_margin_percent (or margin_percent) required and must be 0 <= value < 100' });
        await dataService.upsertCustomerManufacturerPricing(companyId, manufacturer_id, gross_margin_percent);
        const overrides = await dataService.getOverridesByCompanyId(companyId);
        const override = overrides.find((o) => o.manufacturer_id === manufacturer_id);
        res.json({ success: true, override: override || { id: null, manufacturer_id, manufacturer_name: '', gross_margin_percent, margin_percent: gross_margin_percent } });
    } catch (err) {
        console.error('[admin/companies overrides]', err);
        res.status(500).json({ error: err.message || 'Failed to save override' });
    }
});

app.delete('/api/admin/companies/:id/overrides/:overrideId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (!companiesService.isGcCompanyUuid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid company id (UUID required)' });
        }
        const company = await companiesService.getCompanyById(req.params.id);
        if (!company) return res.status(404).json({ error: 'Company not found' });
        await dataService.deleteCustomerManufacturerPricingOverride(req.params.overrideId, req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[admin/companies delete override]', err);
        res.status(404).json({ error: 'Override not found' });
    }
});

app.get('/api/pricing/effective-margin', authenticateToken, async (req, res) => {
    try {
        const user = await usersService.getUserById(req.user.id);
        const companyId = user ? await companiesService.getCompanyIdForUser(user) : null;
        if (companyId == null) return res.status(400).json({ error: 'User has no associated company' });
        const manufacturerId = req.query.manufacturerId != null ? Number(req.query.manufacturerId) : null;
        const ctx = await getPricingContext();
        const margin = getEffectiveMargin(ctx, companyId, manufacturerId);
        res.json({ margin_percent: margin });
    } catch (err) {
        console.error('[pricing/effective-margin]', err);
        res.status(500).json({ error: err.message || 'Failed to get margin' });
    }
});

app.get('/api/pricing/sell-price', (req, res) => {
    const cost = req.query.cost != null ? Number(req.query.cost) : NaN;
    const margin = req.query.margin != null ? Number(req.query.margin) : NaN;
    if (isNaN(cost) || isNaN(margin)) {
        return res.status(400).json({ error: 'cost and margin query params required' });
    }
    const sell = computeSellPrice(cost, margin);
    if (Number.isNaN(sell)) {
        return res.status(400).json({ error: 'Invalid margin (must be 0 <= margin < 100)' });
    }
    res.json({ cost, margin_percent: margin, sell_price: sell });
});

// ============ SERVE FRONTEND ============
// Static files (CSS, JS, images) - after all API routes so /api/* is never served as static
app.use(express.static(path.join(__dirname, 'public')));

const INDEX_HTML_PATH = path.join(__dirname, 'public', 'index.html');
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found', path: req.path });
    }
    // Prefer the request's own origin so www/apex and reverse-proxy hosts match fetch() (avoid cross-origin /api when DOMAIN is apex-only).
    const fromRequest = `${req.protocol}://${req.get('host') || 'localhost'}`.replace(/\/$/, '');
    const mainApiUrl = (
        process.env.GLOVECUBS_MAIN_API_URL ||
        fromRequest ||
        process.env.DOMAIN ||
        process.env.BASE_URL ||
        ''
    ).replace(/\/$/, '');
    try {
        let html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
        html = html.replace('<!-- GLOVECUBS_API_URL_INJECT -->', '<meta name="glovecubs-api-url" content="' + mainApiUrl.replace(/"/g, '&quot;') + '">');
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.sendFile(INDEX_HTML_PATH);
    }
});

// If default port is in use, try next ports (e.g. previous instance still running)
function startServer(tryPort) {
    const port = Number(tryPort);
    if (port < 0 || port > 65535) {
        console.error('Server error: no valid port available (tried up to', tryPort, ')');
        process.exit(1);
    }
    const server = app.listen(port, () => {
        const actualPort = server.address().port;
        console.log(`\n🧤 Glovecubs server running at http://localhost:${actualPort}\n`);
        if (actualPort !== PORT) {
            console.log(`   (Port ${PORT} was in use; using ${actualPort} instead.)\n`);
        }
        setTimeout(() => writeFishbowlCustomersExport(), 2000);
        setInterval(writeFishbowlCustomersExport, FISHBOWL_EXPORT_INTERVAL_MS);
        console.log('[Fishbowl] Customer export scheduled every 30 min -> data/fishbowl-customers.csv');
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && port < 65535 && port < PORT + 20) {
            console.log(`Port ${port} in use, trying ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err.message);
            process.exit(1);
        }
    });
}
startServer(PORT);

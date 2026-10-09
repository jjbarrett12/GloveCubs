'use strict';

/**
 * Drain legacy Express anonymous browser-write duplicates.
 * Canonical Next routes own these flows (BotID + public-write/AI rate limits).
 */
const LEGACY_PUBLIC_WRITE_DRAINED_CODE = 'LEGACY_PUBLIC_WRITE_DRAINED';

function sendLegacyPublicWriteGone(res, opts) {
  const route = opts && opts.route ? String(opts.route) : null;
  const nextRoute = opts && opts.nextRoute ? String(opts.nextRoute) : null;
  res.status(410).json({
    error: 'This endpoint has been removed. Use the storefront origin.',
    code: LEGACY_PUBLIC_WRITE_DRAINED_CODE,
    route,
    next_route: nextRoute,
  });
}

module.exports = {
  LEGACY_PUBLIC_WRITE_DRAINED_CODE,
  sendLegacyPublicWriteGone,
};

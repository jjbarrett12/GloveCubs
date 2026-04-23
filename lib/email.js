/**
 * Email helper - sends via SMTP when configured. No-op when SMTP env vars are not set.
 * 
 * Required environment variables:
 *   SMTP_HOST     - SMTP server hostname (e.g., smtp.gmail.com)
 *   SMTP_USER     - SMTP username/email
 *   SMTP_PASS     - SMTP password or app password
 * 
 * Optional environment variables:
 *   SMTP_PORT     - SMTP port (default: 587)
 *   SMTP_SECURE   - Use TLS (default: false, uses STARTTLS)
 *   SMTP_FROM     - From address (default: SMTP_USER)
 */
const nodemailer = require('nodemailer');

/**
 * Check if SMTP is configured with all required variables.
 */
function isConfigured() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Get detailed configuration status for debugging/admin display.
 */
function getConfigStatus() {
    const hasHost = !!process.env.SMTP_HOST;
    const hasUser = !!process.env.SMTP_USER;
    const hasPass = !!process.env.SMTP_PASS;
    
    return {
        configured: hasHost && hasUser && hasPass,
        host: hasHost ? process.env.SMTP_HOST : null,
        port: process.env.SMTP_PORT || '587',
        secure: process.env.SMTP_SECURE === 'true',
        from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
        missing: [
            !hasHost && 'SMTP_HOST',
            !hasUser && 'SMTP_USER',
            !hasPass && 'SMTP_PASS'
        ].filter(Boolean)
    };
}

let transporter = null;
function getTransporter() {
    if (!isConfigured()) return null;
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }
    return transporter;
}

/**
 * Reset transporter (useful for testing or config changes)
 */
function resetTransporter() {
    transporter = null;
}

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@glovecubs.com';

/**
 * Send an email. Resolves to { sent: true } or { sent: false, error }.
 * 
 * @param {object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body (auto-generated from text if not provided)
 * @returns {Promise<{sent: boolean, error?: string, messageId?: string}>}
 */
async function sendMail({ to, subject, text, html }) {
    if (!isConfigured()) {
        console.log('[Email] SMTP not configured, skipping send:', subject, 'to', to);
        return { sent: false, error: 'Email not configured' };
    }
    
    if (!to) {
        console.error('[Email] No recipient specified');
        return { sent: false, error: 'No recipient specified' };
    }
    
    try {
        const transport = getTransporter();
        const result = await transport.sendMail({
            from: FROM,
            to: Array.isArray(to) ? to.join(', ') : to,
            subject: subject || 'Glovecubs',
            text: text || '',
            html: html || (text ? text.replace(/\n/g, '<br>') : '')
        });
        console.log('[Email] Sent:', subject, 'to', to, 'messageId:', result.messageId);
        return { sent: true, messageId: result.messageId };
    } catch (err) {
        const msg = err.message || String(err);
        console.error('[Email] Send failed:', msg);
        console.error(
            '[EmailTransportFailure]',
            JSON.stringify({
                ts: new Date().toISOString(),
                subject_preview: String(subject || '').slice(0, 120),
                error_message: msg,
            })
        );
        return { sent: false, error: msg };
    }
}

/**
 * Verify SMTP connection without sending an email.
 * Useful for testing configuration.
 * 
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function verifyConnection() {
    if (!isConfigured()) {
        return { ok: false, error: 'SMTP not configured' };
    }
    
    try {
        const transport = getTransporter();
        await transport.verify();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

module.exports = { 
    isConfigured, 
    getConfigStatus,
    sendMail, 
    verifyConnection,
    resetTransporter
};

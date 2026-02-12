/**
 * Email helper - sends via SMTP when configured. No-op when SMTP env vars are not set.
 */
const nodemailer = require('nodemailer');

function isConfigured() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@glovecubs.com';

/**
 * Send an email. Resolves to { sent: true } or { sent: false, error }.
 */
async function sendMail({ to, subject, text, html }) {
    if (!isConfigured()) {
        console.log('[Email] SMTP not configured, skipping send:', subject, 'to', to);
        return { sent: false, error: 'Email not configured' };
    }
    try {
        const transport = getTransporter();
        await transport.sendMail({
            from: FROM,
            to: Array.isArray(to) ? to.join(', ') : to,
            subject: subject || 'Glovecubs',
            text: text || '',
            html: html || (text ? text.replace(/\n/g, '<br>') : '')
        });
        return { sent: true };
    } catch (err) {
        console.error('[Email] Send failed:', err.message);
        return { sent: false, error: err.message };
    }
}

module.exports = { isConfigured, sendMail };

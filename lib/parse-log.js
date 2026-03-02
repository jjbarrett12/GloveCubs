/**
 * Optional parse log for Add Product by URL debugging.
 * Set PARSE_LOG_PATH in .env (e.g. data/parse-logs.jsonl) to append one JSON line per event.
 */

const fs = require('fs');
const path = require('path');

function getLogPath() {
    const p = process.env.PARSE_LOG_PATH;
    if (!p || typeof p !== 'string' || !p.trim()) return null;
    return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function logParseEvent(event) {
    const logPath = getLogPath();
    if (!logPath) return;
    try {
        const line = JSON.stringify({
            ts: new Date().toISOString(),
            ...event
        }) + '\n';
        fs.appendFileSync(logPath, line, 'utf8');
    } catch (err) {
        console.error('[parse-log] write failed:', err.message);
    }
}

module.exports = { logParseEvent, getLogPath };

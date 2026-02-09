/**
 * Fishbowl Inventory REST API client for Glovecubs.
 * Connects to Fishbowl Advanced REST API (default port 2456).
 * @see https://help.fishbowlinventory.com/advanced/s/apidocs/connecting.html
 */

const https = require('https');
const http = require('http');

const APP_NAME = process.env.FISHBOWL_APP_NAME || 'Glovecubs';
const APP_DESCRIPTION = process.env.FISHBOWL_APP_DESCRIPTION || 'B2B glove e-commerce - inventory sync';
const APP_ID = parseInt(process.env.FISHBOWL_APP_ID || '9001', 10);
const BASE_URL = (process.env.FISHBOWL_BASE_URL || '').replace(/\/$/, '');
const USERNAME = process.env.FISHBOWL_USERNAME || '';
const PASSWORD = process.env.FISHBOWL_PASSWORD || '';
const MFA_CODE = process.env.FISHBOWL_MFA_CODE || ''; // optional, for MFA login

let cachedToken = null;
let tokenExpiresAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 minutes

function isConfigured() {
    return !!(BASE_URL && USERNAME && PASSWORD);
}

function parseUrl(url) {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return {
        protocol: u.protocol,
        host: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname || '/',
        search: u.search
    };
}

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        if (!BASE_URL) {
            return reject(new Error('FISHBOWL_BASE_URL is not set'));
        }
        const parsed = parseUrl(BASE_URL);
        const pathWithQuery = (path.startsWith('/') ? path : '/' + path) + (parsed.search || '');
        const basePath = (parsed.path || '/') === '/' ? '' : parsed.path.replace(/\/$/, '');
        const fullPath = basePath + pathWithQuery;
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;
        const opts = {
            hostname: parsed.host,
            port: parsed.port,
            path: fullPath,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        if (token) {
            opts.headers['Authorization'] = `Bearer ${token}`;
        }
        const req = lib.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let json = null;
                try {
                    if (data) json = JSON.parse(data);
                } catch (_) {}
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ statusCode: res.statusCode, data: json, headers: res.headers });
                } else {
                    const err = new Error(data || `HTTP ${res.statusCode}`);
                    err.statusCode = res.statusCode;
                    err.response = data;
                    err.json = json;
                    err.mfaRequired = res.headers['mfa'] === 'Required';
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        if (body != null) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Log in to Fishbowl and return a session token.
 * Call this first; token is cached and reused.
 */
async function login(mfaCode = MFA_CODE) {
    const body = {
        appName: APP_NAME,
        appDescription: APP_DESCRIPTION,
        appId: APP_ID,
        username: USERNAME,
        password: PASSWORD
    };
    if (mfaCode) body.mfaCode = mfaCode;
    const res = await request('POST', '/api/login', body);
    const token = res.data && res.data.token;
    if (!token) {
        throw new Error('Fishbowl login did not return a token');
    }
    cachedToken = token;
    tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    return { token, user: res.data.user };
}

/**
 * Get a valid token (login if needed).
 */
async function getToken(forceRefresh = false) {
    if (forceRefresh || !cachedToken || Date.now() >= tokenExpiresAt) {
        await login();
    }
    return cachedToken;
}

/**
 * Log out (invalidates session).
 */
async function logout() {
    if (!cachedToken) return;
    try {
        await request('POST', '/api/logout', null, cachedToken);
    } catch (_) {}
    cachedToken = null;
    tokenExpiresAt = 0;
}

/**
 * Fetch inventory from Fishbowl (parts with quantities).
 * GET /api/parts/inventory
 * @param {Object} options - pageNumber, pageSize, number (part number), includeZeroQuantities, active
 */
async function getPartsInventory(options = {}) {
    const token = await getToken();
    const params = new URLSearchParams();
    if (options.pageNumber != null) params.set('pageNumber', options.pageNumber);
    if (options.pageSize != null) params.set('pageSize', options.pageSize);
    if (options.number) params.set('number', options.number);
    if (options.includeZeroQuantities === true) params.set('includeZeroQuantities', 'true');
    if (options.active !== undefined) params.set('active', options.active);
    const qs = params.toString();
    const path = '/api/parts/inventory' + (qs ? '?' + qs : '');
    const res = await request('GET', path, null, token);
    return res.data;
}

/**
 * Search parts (part numbers, descriptions).
 * GET /api/parts
 */
async function getParts(options = {}) {
    const token = await getToken();
    const params = new URLSearchParams();
    if (options.pageNumber != null) params.set('pageNumber', options.pageNumber);
    if (options.pageSize != null) params.set('pageSize', options.pageSize);
    if (options.number) params.set('number', options.number);
    if (options.description) params.set('description', options.description);
    if (options.active !== undefined) params.set('active', options.active);
    const qs = params.toString();
    const path = '/api/parts' + (qs ? '?' + qs : '');
    const res = await request('GET', path, null, token);
    return res.data;
}

/**
 * Fetch all inventory pages and return a flat list of { partNumber, quantity, partDescription }.
 */
async function getAllInventory(includeZeroQuantities = true) {
    const list = [];
    let page = 1;
    const pageSize = 100;
    while (true) {
        const data = await getPartsInventory({
            pageNumber: page,
            pageSize,
            includeZeroQuantities
        });
        if (!data || !data.results || data.results.length === 0) break;
        for (const row of data.results) {
            list.push({
                partNumber: row.partNumber || row.number,
                quantity: parseInt(row.quantity, 10) || 0,
                partDescription: row.partDescription || row.description || ''
            });
        }
        if (page >= (data.totalPages || 1)) break;
        page++;
    }
    return list;
}

module.exports = {
    isConfigured,
    login,
    logout,
    getToken,
    getPartsInventory,
    getParts,
    getAllInventory,
    request
};

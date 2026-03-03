require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const fishbowl = require('./fishbowl');
const rateLimit = require('express-rate-limit');
const { sendMail, isConfigured: emailConfigured } = require('./lib/email');
const productStore = require('./lib/product-store');
const { getEffectiveMargin, computeSellPrice } = require('./lib/pricing');
const { importCsvToSupabase } = require('./lib/import-csv-supabase');
const supabaseLib = require('./lib/supabase');
const { parseProductUrl } = require('./lib/parse-product-url');
const { aiNormalizeProduct, normalizeFromExtracted, isConfigured: aiNormalizeConfigured } = require('./lib/ai-normalize-product');
const { validateImageUrls, validateImageUrlsWithVerification } = require('./lib/validate-image-urls');
const { getSupabase, isConfigured: supabaseConfigured } = require('./lib/supabase');
const { logParseEvent } = require('./lib/parse-log');
const { aiGenerate, aiExtractInvoice, aiRecommendFromInvoice, isConfigured: aiConfigured } = require('./lib/ai/provider');
const { validateGloveFinderRequest, validateGloveFinderResponse, validateInvoiceExtractResponse, validateInvoiceRecommendResponse } = require('./lib/ai/schemas');
const { hashIp, logConversation, logInvoiceUpload, logInvoiceLines, logRecommendations } = require('./lib/ai/ai-log');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3004;
const JWT_SECRET = process.env.JWT_SECRET || 'glovecubs-secret-key-2024';

// Simple JSON file database. In serverless (Vercel/Lambda) the app dir is read-only;
// we use os.tmpdir() when a write fails with EROFS so CSV import and other writes succeed.
const DB_PATH_BUNDLED = path.join(__dirname, 'database.json');
const DB_PATH_TMP = path.join(os.tmpdir(), 'glovecubs-database.json');
let dbPathActive = DB_PATH_BUNDLED; // switched to DB_PATH_TMP on first EROFS

// Fishbowl customer export: file path and schedule (every 30 min)
const FISHBOWL_EXPORT_DIR = path.join(__dirname, 'data');
const FISHBOWL_EXPORT_FILE = path.join(FISHBOWL_EXPORT_DIR, 'fishbowl-customers.csv');
const FISHBOWL_EXPORT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function loadDB() {
    try {
        // If we've already switched to temp dir but it's empty (e.g. new instance), seed from bundled
        if (dbPathActive === DB_PATH_TMP && !fs.existsSync(DB_PATH_TMP) && fs.existsSync(DB_PATH_BUNDLED)) {
            try {
                const bundled = fs.readFileSync(DB_PATH_BUNDLED, 'utf8');
                fs.writeFileSync(DB_PATH_TMP, bundled, 'utf8');
            } catch (e) { /* ignore */ }
        }
        const pathToRead = dbPathActive;
        if (fs.existsSync(pathToRead)) {
            const db = JSON.parse(fs.readFileSync(pathToRead, 'utf8'));
            let changed = false;
            if (!db.rfqs) { db.rfqs = []; changed = true; }
            if (!db.saved_lists) { db.saved_lists = []; changed = true; }
            if (!db.ship_to_addresses) { db.ship_to_addresses = []; changed = true; }
            if (!db.contact_messages) { db.contact_messages = []; changed = true; }
            if (!db.password_reset_tokens) { db.password_reset_tokens = []; changed = true; }
            if (!db.uploaded_invoices) { db.uploaded_invoices = []; changed = true; }
            if (!db.companies) { db.companies = []; changed = true; }
            if (!db.manufacturers) { db.manufacturers = []; changed = true; }
            if (!db.customer_manufacturer_pricing) { db.customer_manufacturer_pricing = []; changed = true; }
            if (!db.app_admins) { db.app_admins = []; changed = true; }
            if (!db.inventory) { db.inventory = []; changed = true; }
            if (!db.purchase_orders) { db.purchase_orders = []; changed = true; }
            // Seed companies from users (unique company_name) if empty
            if (db.companies.length === 0 && (db.users || []).length > 0) {
                const seen = new Set();
                let nextId = 1;
                (db.users || []).forEach((u) => {
                    const name = (u.company_name || '').trim();
                    if (name && !seen.has(name.toLowerCase())) {
                        seen.add(name.toLowerCase());
                        db.companies.push({
                            id: nextId++,
                            name,
                            default_gross_margin_percent: 30,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                    }
                });
                changed = true;
            }
            // Seed manufacturers from products (unique brand) if empty
            if (db.manufacturers.length === 0 && (db.products || []).length > 0) {
                const seen = new Set();
                let nextId = 1;
                (db.products || []).forEach((p) => {
                    const name = (p.brand || '').trim();
                    if (name && !seen.has(name.toLowerCase())) {
                        seen.add(name.toLowerCase());
                        db.manufacturers.push({
                            id: nextId++,
                            name,
                            created_at: new Date().toISOString()
                        });
                    }
                });
                changed = true;
            }
            // Ensure companies have default_gross_margin_percent
            (db.companies || []).forEach((c) => {
                if (c.default_gross_margin_percent == null) {
                    c.default_gross_margin_percent = 30;
                    changed = true;
                }
            });
            // Ensure orders can have tracking
            (db.orders || []).forEach(o => {
                if (o.tracking_number === undefined) o.tracking_number = '';
                if (o.tracking_url === undefined) o.tracking_url = '';
            });
            // Ensure users can have budget and rep
            (db.users || []).forEach(u => {
                if (u.budget_amount === undefined) u.budget_amount = null;
                if (u.budget_period === undefined) u.budget_period = 'monthly';
                if (u.rep_name === undefined) u.rep_name = '';
                if (u.rep_email === undefined) u.rep_email = '';
                if (u.rep_phone === undefined) u.rep_phone = '';
            });
            // Ensure demo user exists so demo@company.com / demo123 always works
            const demoHash = '$2a$10$7nnjp9KcyS8aFsRkE1dvEumROrZEldTROMteztG3UZXZQqw8lWFFe';
            const hasDemo = (db.users || []).some(u => (u.email || '').toLowerCase() === 'demo@company.com');
            if (!hasDemo) {
                if (!db.users) db.users = [];
                db.users.push({
                    id: (db.users.length === 0) ? 1 : Math.max(...db.users.map(u => u.id)) + 1,
                    company_name: 'Demo Company Inc',
                    email: 'demo@company.com',
                    password: demoHash,
                    contact_name: 'John Demo',
                    phone: '555-123-4567',
                    address: '123 Demo Street',
                    city: 'Chicago',
                    state: 'IL',
                    zip: '60601',
                    is_approved: 1,
                    discount_tier: 'silver',
                    created_at: new Date().toISOString()
                });
                changed = true;
            }
            if (changed) saveDB(db);
            return db;
        }
    } catch (e) {
        console.log('Creating new database...');
    }
    let db = { users: [], products: [], orders: [], carts: {}, rfqs: [], saved_lists: [], ship_to_addresses: [], contact_messages: [], password_reset_tokens: [], uploaded_invoices: [], companies: [], manufacturers: [], customer_manufacturer_pricing: [], app_admins: [], inventory: [], purchase_orders: [] };
    // Ensure demo user exists so login works even when database.json is missing or empty (e.g. fresh Vercel deploy)
    const demoHash = '$2a$10$7nnjp9KcyS8aFsRkE1dvEumROrZEldTROMteztG3UZXZQqw8lWFFe'; // bcrypt hash of 'demo123'
    if (!db.users || db.users.length === 0) {
        db.users = [{
            id: 1,
            company_name: 'Demo Company Inc',
            email: 'demo@company.com',
            password: demoHash,
            contact_name: 'John Demo',
            phone: '555-123-4567',
            address: '123 Demo Street',
            city: 'Chicago',
            state: 'IL',
            zip: '60601',
            is_approved: 1,
            discount_tier: 'silver',
            created_at: new Date().toISOString()
        }];
        try { saveDB(db); } catch (err) { /* ignore on read-only (e.g. serverless) */ }
    } else {
        const hasDemo = db.users.some(u => (u.email || '').toLowerCase() === 'demo@company.com');
        if (!hasDemo) {
            db.users.push({
                id: Math.max(1, ...db.users.map(u => u.id)) + 1,
                company_name: 'Demo Company Inc',
                email: 'demo@company.com',
                password: demoHash,
                contact_name: 'John Demo',
                phone: '555-123-4567',
                address: '123 Demo Street',
                city: 'Chicago',
                state: 'IL',
                zip: '60601',
                is_approved: 1,
                discount_tier: 'silver',
                created_at: new Date().toISOString()
            });
            try { saveDB(db); } catch (err) { /* ignore */ }
        }
    }
    return db;
}

function saveDB(data) {
    const payload = JSON.stringify(data, null, 2);
    try {
        fs.writeFileSync(dbPathActive, payload);
    } catch (err) {
        if (err.code === 'EROFS' && dbPathActive === DB_PATH_BUNDLED) {
            dbPathActive = DB_PATH_TMP;
            fs.writeFileSync(dbPathActive, payload);
        } else {
            throw err;
        }
    }
}

let db = loadDB();

// Middleware (increase limit for large CSV imports)
const bodyLimit = '50mb';
app.use(cors());
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
app.use(express.static(path.join(__dirname, 'public')));

// API rate limit: 200 requests per 15 minutes per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', apiLimiter);

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
        const { company_name, email, password, contact_name, phone, address, city, state, zip, allow_free_upgrades } = req.body;
        
        db = loadDB();
        const existing = db.users.find(u => u.email === email);
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: Date.now(),
            company_name,
            email,
            password: hashedPassword,
            contact_name,
            phone: phone || '',
            address: address || '',
            city: city || '',
            state: state || '',
            zip: zip || '',
            allow_free_upgrades: !!allow_free_upgrades,
            payment_terms: 'credit_card',
            is_approved: 0,
            discount_tier: 'standard',
            created_at: new Date().toISOString()
        };

        db.users.push(newUser);
        saveDB(db);

        res.json({ 
            success: true, 
            message: 'Account created! Pending approval for B2B pricing.',
            userId: newUser.id 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', authContactLimiter, async (req, res) => {
    try {
        const email = (req.body.email || '').toString().trim();
        const password = (req.body.password != null && req.body.password !== '') ? String(req.body.password).trim() : '';
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Please enter email and password.' });
        }
        
        db = loadDB();
        const emailLower = email.toLowerCase();
        const user = db.users.find(u => (u.email || '').toString().trim().toLowerCase() === emailLower);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        let validPassword = await bcrypt.compare(password, user.password);
        // Always allow demo login; fix stored hash if it was from a different bcrypt/version
        if (!validPassword && emailLower === 'demo@company.com' && password === 'demo123') {
            const newHash = bcrypt.hashSync('demo123', 10);
            user.password = newHash;
            try { saveDB(db); } catch (e) { /* ignore on read-only */ }
            validPassword = true;
        }
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, company: user.company_name, approved: user.is_approved },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                company_name: user.company_name,
                email: user.email,
                contact_name: user.contact_name,
                is_approved: user.is_approved,
                discount_tier: user.discount_tier
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const { password, ...safeUser } = user;
    res.json(safeUser);
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
        db = loadDB();
        if (!db.contact_messages) db.contact_messages = [];
        const contactMsg = {
            id: Date.now(),
            name: nameTrim,
            email: emailTrim,
            company: companyTrim,
            message: messageTrim,
            created_at: new Date().toISOString()
        };
        db.contact_messages.push(contactMsg);
        saveDB(db);

        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'sales@glovecubs.com';
        const text = `New contact form submission from Glovecubs\n\nName: ${nameTrim}\nEmail: ${emailTrim}\nCompany: ${companyTrim}\n\nMessage:\n${messageTrim}`;
        await sendMail({
            to: adminEmail,
            subject: `[Glovecubs] Contact from ${nameTrim}`,
            text
        });
        await sendMail({
            to: emailTrim,
            subject: 'We received your message - Glovecubs',
            text: `Hi ${nameTrim},\n\nThank you for contacting Glovecubs. We have received your message and will get back to you soon.\n\nBest regards,\nGlovecubs Team`
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
        db = loadDB();
        const user = db.users.find(u => (u.email || '').toLowerCase() === email);
        if (!user) {
            // Don't reveal whether email exists
            return res.json({ success: true, message: 'If that email is on file, we sent a reset link.' });
        }
        if (!db.password_reset_tokens) db.password_reset_tokens = [];
        const token = require('crypto').randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString();
        db.password_reset_tokens.push({
            token,
            user_id: user.id,
            expires_at: expiresAt,
            created_at: new Date().toISOString()
        });
        // Remove old tokens for this user
        db.password_reset_tokens = db.password_reset_tokens.filter(
            t => t.user_id !== user.id || t.expires_at > new Date().toISOString()
        );
        saveDB(db);

        const baseUrl = process.env.DOMAIN || process.env.BASE_URL || 'http://localhost:3004';
        const resetLink = `${baseUrl}#reset-password?token=${token}`;
        const text = `Hi ${user.contact_name || 'there'},\n\nYou requested a password reset for your Glovecubs account. Click the link below to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.\n\nGlovecubs`;
        await sendMail({
            to: user.email,
            subject: 'Reset your Glovecubs password',
            text
        });
        return res.json({ success: true, message: 'If that email is on file, we sent a reset link.' });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Request failed.' });
    }
});

app.get('/api/auth/reset-check', (req, res) => {
    const token = (req.query.token || '').toString().trim();
    if (!token) return res.status(400).json({ error: 'Token required.', valid: false });
    db = loadDB();
    const row = (db.password_reset_tokens || []).find(
        t => t.token === token && new Date(t.expires_at) > new Date()
    );
    if (!row) return res.json({ valid: false, error: 'Invalid or expired link.' });
    return res.json({ valid: true });
});

app.post('/api/auth/reset-password', authContactLimiter, async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password || String(password).length < 6) {
            return res.status(400).json({ error: 'Valid token and password (min 6 characters) are required.' });
        }
        db = loadDB();
        const row = (db.password_reset_tokens || []).find(
            t => t.token === token && new Date(t.expires_at) > new Date()
        );
        if (!row) {
            return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
        }
        const user = db.users.find(u => u.id === row.user_id);
        if (!user) return res.status(400).json({ error: 'User not found.' });
        user.password = await bcrypt.hash(String(password).trim(), 10);
        db.password_reset_tokens = db.password_reset_tokens.filter(t => t.token !== token);
        saveDB(db);
        return res.json({ success: true, message: 'Password updated. You can log in now.' });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Reset failed.' });
    }
});

// ============ PRODUCT ROUTES ============
// When inventory table has a record, use quantity_on_hand for availability (in_stock = qty > 0).
function applyInventoryToProducts(products, inventoryList) {
    const byProduct = new Map((inventoryList || []).map((i) => [i.product_id, i]));
    return products.map((p) => {
        const inv = byProduct.get(p.id);
        if (inv == null) return p;
        const qty = inv.quantity_on_hand ?? 0;
        return { ...p, in_stock: qty > 0 ? 1 : 0, quantity_on_hand: qty };
    });
}

app.get('/api/products', optionalAuth, (req, res) => {
    db = loadDB();
    let products = Array.isArray(db.products) ? [...db.products] : [];

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

    products.sort((a, b) => {
        if (a.featured !== b.featured) return (b.featured || 0) - (a.featured || 0);
        return (a.name || '').localeCompare(b.name || '');
    });

    // Apply inventory (in-app fishbowl): in_stock and quantity_on_hand from inventory table when present
    products = applyInventoryToProducts(products, db.inventory);

    // Customer pricing: when user has a company, add sell_price using manufacturer_id (no brand string)
    const companyId = req.user ? getCompanyIdForUser(db, req.user) : null;
    if (companyId != null) {
        products = products.map(p => {
            const cost = p.cost != null && p.cost !== '' ? Number(p.cost) : (p.price != null ? Number(p.price) : 0);
            const margin = getEffectiveMargin(db, companyId, p.manufacturer_id);
            const sell = computeSellPrice(cost, margin);
            return { ...p, sell_price: Number.isNaN(sell) ? (p.price || 0) : sell };
        });
    }

    res.json(products);
});

// SEO: slug from product name (or stored slug)
function productSlug(p) {
    const raw = (p.slug || p.name || '').toString().trim();
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '';
}

app.get('/api/products/:id', optionalAuth, (req, res) => {
    db = loadDB();
    let product = db.products.find(p => p.id == req.params.id || p.sku === req.params.id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }
    const applied = applyInventoryToProducts([{ ...product }], db.inventory);
    product = applied[0] || product;
    const companyId = req.user ? getCompanyIdForUser(db, req.user) : null;
    if (companyId != null) {
        const cost = product.cost != null && product.cost !== '' ? Number(product.cost) : (product.price != null ? Number(product.price) : 0);
        const margin = getEffectiveMargin(db, companyId, product.manufacturer_id);
        const sell = computeSellPrice(cost, margin);
        product.sell_price = Number.isNaN(sell) ? (product.price || 0) : sell;
    }
    res.json(product);
});

// SEO: get product by URL slug (e.g. black-nitrile-exam-gloves). Optional category/material to disambiguate.
app.get('/api/products/by-slug', optionalAuth, (req, res) => {
    db = loadDB();
    const slug = (req.query.slug || '').toString().trim().toLowerCase();
    const categorySegment = (req.query.category || '').toString().trim().toLowerCase();
    if (!slug) {
        return res.status(400).json({ error: 'slug query parameter required' });
    }
    let products = db.products.filter(p => productSlug(p) === slug);
    if (products.length > 1 && categorySegment) {
        products = products.filter(p => {
            const mat = (p.material || '').toLowerCase().replace(/\s+/g, '-');
            const sub = (p.subcategory || '').toLowerCase().replace(/\s+/g, '-');
            const cat = (p.category || '').toLowerCase().replace(/\s+/g, '-');
            return mat === categorySegment || sub === categorySegment || cat === categorySegment;
        });
    }
    let product = products.length > 0 ? products[0] : null;
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }
    const applied = applyInventoryToProducts([{ ...product }], db.inventory);
    product = { ...(applied[0] || product), slug: productSlug(product) };
    const companyId = req.user ? getCompanyIdForUser(db, req.user) : null;
    if (companyId != null) {
        const cost = product.cost != null && product.cost !== '' ? Number(product.cost) : (product.price != null ? Number(product.price) : 0);
        const margin = getEffectiveMargin(db, companyId, product.manufacturer_id);
        const sell = computeSellPrice(cost, margin);
        product.sell_price = Number.isNaN(sell) ? (product.price || 0) : sell;
    }
    res.json(product);
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
app.get('/api/seo/industry/:slug', (req, res) => {
    db = loadDB();
    const slug = (req.params.slug || '').toString().trim().toLowerCase();
    const industry = SEO_INDUSTRIES.find(i => i.slug === slug);
    if (!industry) {
        return res.status(404).json({ error: 'Industry not found' });
    }
    const useCase = industry.useCase;
    let products = (db.products || []).filter(p => {
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
});

// SEO: sitemap URLs (for generating sitemap.xml or crawlers)
app.get('/api/seo/sitemap-urls', (req, res) => {
    db = loadDB();
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
    (db.products || []).forEach(p => {
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
});

// CSV import: Supabase (when configured) or JSON DB. Row-fault-tolerant; returns parsedRows, created, updated, failed, skipped, errorSamples.
app.post('/api/products/import-csv', authenticateToken, async (req, res) => {
    try {
        db = loadDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (!user || !user.is_approved) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        let csvContent = req.body.csvContent;
        if (!csvContent) {
            return res.status(400).json({ error: 'CSV content is required' });
        }
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            return res.status(400).json({ error: 'CSV must have at least a header row and one data row' });
        }

        let parsedRows, created, updated, failed, skipped, deleted, withImage, errorSamples;

        if (supabaseLib.isConfigured()) {
            const result = await importCsvToSupabase(csvContent);
            parsedRows = result.parsedRows;
            created = result.created;
            updated = result.updated;
            failed = result.failed;
            skipped = result.skipped;
            deleted = 0;
            withImage = 0;
            errorSamples = result.errorSamples || [];
        } else {
            const deleteNotInImport = !!req.body.deleteNotInImport;
            const result = productStore.upsertProductsFromCsv(db, csvContent, { deleteNotInImport });
            parsedRows = result.parsedRows ?? result.dataRowCount ?? 0;
            created = result.created;
            updated = result.updated;
            failed = result.failed;
            skipped = result.skipped;
            deleted = result.deleted || 0;
            withImage = result.withImage || 0;
            errorSamples = result.errorSamples || [];
            saveDB(db);
            // Sync manufacturers from products (distinct brand) and backfill manufacturer_id
            const manufacturers = db.manufacturers || [];
            let nextMfrId = manufacturers.length ? Math.max(...manufacturers.map(m => m.id)) + 1 : 1;
            const byName = new Map(manufacturers.map(m => [(m.name || '').trim().toLowerCase(), m]));
            (db.products || []).forEach((p) => {
                const brand = (p.brand || '').trim();
                if (!brand) return;
                const key = brand.toLowerCase();
                if (!byName.has(key)) {
                    manufacturers.push({ id: nextMfrId, name: brand, created_at: new Date().toISOString() });
                    byName.set(key, { id: nextMfrId, name: brand });
                    nextMfrId++;
                }
                const mfr = byName.get(key);
                if (mfr) p.manufacturer_id = mfr.id;
            });
            db.manufacturers = manufacturers;
            saveDB(db);
        }

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
app.post('/api/products/update-images-csv', authenticateToken, (req, res) => {
    try {
        db = loadDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (!user || !user.is_approved) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        let csvContent = req.body.csvContent;
        if (!csvContent) {
            return res.status(400).json({ error: 'CSV content is required' });
        }
        if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1);
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) {
            return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
        }
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
        const iImage = Math.max(
            headers.indexOf('image_url'),
            headers.indexOf('image url'),
            headers.indexOf('imageurl'),
            headers.indexOf('image'),
            headers.indexOf('url')
        );
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
            if (values.length > 2 && iImage >= 0) {
                imageUrl = values.slice(iImage).join(',').trim();
            }
            if (!imageUrl) continue;
            if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) imageUrl = '/' + imageUrl;
            const product = db.products.find(p => (p.sku || '').toString().trim().toLowerCase() === sku.toLowerCase());
            if (product) {
                product.image_url = imageUrl;
                updated++;
            }
        }
        saveDB(db);
        const resBody = { success: true, updated, message: `Updated images for ${updated} product(s).` };
        if (updated === 0 && lines.length > 1) {
            const firstValues = parseCSVLine(lines[1]).map(v => (v || '').replace(/^"|"$/g, '').trim());
            resBody.debug = {
                headers: parseCSVLine(lines[0]).map(h => (h || '').replace(/^"|"$/g, '').trim()),
                firstRowColumnCount: firstValues.length,
                firstRowSku: firstValues[iSku] || '(empty)',
                firstRowImageUrl: (firstValues[iImage] || '').substring(0, 60) + ((firstValues[iImage] || '').length > 60 ? '...' : ''),
                dbSkuSample: db.products.slice(0, 3).map(p => p.sku)
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

// AI normalization: input { kind, url, extracted, hints }. Output strict schema; image_urls only from extracted.meta, jsonld, hints.
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
        if (body.logParse) {
            console.log('[admin/products] ai-normalize', fromFallback ? 'fallback' : 'openai', body.url ? 'url=' + body.url.slice(0, 60) : '');
            logParseEvent({ event: 'ai-normalize', url: body.url || '', normalized, fromFallback });
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
// Do not drop unverified image URLs; store primary image_url always.
app.post('/api/admin/products/save', authenticateToken, requireAdmin, async (req, res) => {
    if (!supabaseConfigured()) {
        return res.status(503).json({ error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
    }
    const body = req.body || {};
    const sku = (body.sku || '').toString().trim();
    const name = (body.name || '').toString().trim();
    if (!sku || !name) {
        return res.status(400).json({ error: 'sku and name are required' });
    }
    const image_urls = Array.isArray(body.image_urls) ? body.image_urls : [];
    const primaryImage = image_urls[0] || body.image_url || '';
    const brand = (body.brand || '').toString().trim();
    const supabase = getSupabase();
    try {
        let manufacturer_id = null;
        if (brand) {
            const { data: existingMfr } = await supabase.from('manufacturers').select('id').eq('name', brand).limit(1).maybeSingle();
            if (existingMfr && existingMfr.id) {
                manufacturer_id = existingMfr.id;
            } else {
                const { data: inserted, error } = await supabase.from('manufacturers').insert({ name: brand }).select('id').single();
                if (!error && inserted) manufacturer_id = inserted.id;
            }
        }
        const productPayload = {
            sku,
            name,
            brand: brand || null,
            description: (body.description || '').toString().trim() || null,
            cost: body.cost != null && !Number.isNaN(Number(body.cost)) ? Number(body.cost) : 0,
            image_url: (primaryImage || '').toString().trim() || null,
            manufacturer_id,
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
            updated_at: new Date().toISOString()
        };
        const { data: existingProduct } = await supabase.from('products').select('id').eq('sku', sku).limit(1).maybeSingle();
        if (existingProduct) {
            const { error } = await supabase.from('products').update(productPayload).eq('id', existingProduct.id);
            if (error) throw error;
            logParseEvent({ event: 'save', action: 'updated', sku, name });
            if (req.body && req.body.logParse) {
                console.log('[admin/products] save updated', sku);
            }
            return res.json({ success: true, action: 'updated', sku });
        }
        productPayload.created_at = new Date().toISOString();
        const { error } = await supabase.from('products').insert(productPayload);
        if (error) throw error;
        logParseEvent({ event: 'save', action: 'created', sku, name });
        if (req.body && req.body.logParse) {
            console.log('[admin/products] save created', sku);
        }
        res.json({ success: true, action: 'created', sku });
    } catch (err) {
        console.error('Save product error:', err);
        res.status(500).json({ error: err.message || 'Save failed' });
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

app.post('/api/products', authenticateToken, (req, res) => {
    db = loadDB();
    
    // Check if user is admin/approved
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    // Prevent duplicates: reject if a product with this SKU already exists (case-insensitive)
    const skuRaw = (req.body.sku || '').toString().trim();
    if (!skuRaw) {
        return res.status(400).json({ error: 'Product SKU is required.' });
    }
    const skuLower = skuRaw.toLowerCase();
    const existingBySku = (db.products || []).find(p => (p.sku || '').toString().trim().toLowerCase() === skuLower);
    if (existingBySku) {
        return res.status(409).json({ error: 'A product with this SKU already exists. Use Edit to update it instead of adding a duplicate.' });
    }
    
    const images = Array.isArray(req.body.images) ? req.body.images.filter(u => typeof u === 'string' && u.trim()) : [];
    const thicknessVal = req.body.thickness;
    const thickness = thicknessVal !== undefined && thicknessVal !== null && thicknessVal !== ''
        ? (thicknessVal === '7+' || thicknessVal === 7 ? 7 : parseFloat(thicknessVal))
        : null;
    const newProduct = {
        id: db.products.length > 0 ? Math.max(...db.products.map(p => p.id)) + 1 : 1,
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
        images: images,
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
        cuffStyle: req.body.cuffStyle || '',
        case_weight: req.body.case_weight != null && req.body.case_weight !== '' ? parseFloat(req.body.case_weight) : null,
        case_length: req.body.case_length != null && req.body.case_length !== '' ? parseFloat(req.body.case_length) : null,
        case_width: req.body.case_width != null && req.body.case_width !== '' ? parseFloat(req.body.case_width) : null,
        case_height: req.body.case_height != null && req.body.case_height !== '' ? parseFloat(req.body.case_height) : null
    };
    
    db.products.push(newProduct);
    saveDB(db);
    
    res.json({ success: true, product: newProduct });
});

// Update product (admin only)
app.put('/api/products/:id', authenticateToken, (req, res) => {
    db = loadDB();
    
    // Check if user is admin/approved
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const product = db.products.find(p => p.id == req.params.id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }
    
    // Update product fields
    if (req.body.sku !== undefined) product.sku = req.body.sku;
    if (req.body.name !== undefined) product.name = req.body.name;
    if (req.body.brand !== undefined) product.brand = req.body.brand;
    if (req.body.category !== undefined) product.category = req.body.category;
    if (req.body.subcategory !== undefined) product.subcategory = req.body.subcategory;
    if (req.body.description !== undefined) product.description = req.body.description;
    if (req.body.material !== undefined) product.material = req.body.material;
    if (req.body.sizes !== undefined) product.sizes = req.body.sizes;
    if (req.body.color !== undefined) product.color = req.body.color;
    if (req.body.pack_qty !== undefined) product.pack_qty = parseInt(req.body.pack_qty);
    if (req.body.case_qty !== undefined) product.case_qty = parseInt(req.body.case_qty);
    if (req.body.price !== undefined) product.price = parseFloat(req.body.price);
    if (req.body.bulk_price !== undefined) product.bulk_price = parseFloat(req.body.bulk_price);
    if (req.body.image_url !== undefined) product.image_url = req.body.image_url;
    if (req.body.images !== undefined) product.images = Array.isArray(req.body.images) ? req.body.images.filter(u => typeof u === 'string' && u.trim()) : (product.images || []);
    if (req.body.video_url !== undefined) product.video_url = (req.body.video_url || '').trim() || '';
    if (req.body.in_stock !== undefined) product.in_stock = req.body.in_stock ? 1 : 0;
    if (req.body.featured !== undefined) product.featured = req.body.featured ? 1 : 0;
    if (req.body.powder !== undefined) product.powder = req.body.powder || '';
    if (req.body.thickness !== undefined) product.thickness = req.body.thickness ? parseFloat(req.body.thickness) : null;
    if (req.body.grade !== undefined) product.grade = req.body.grade || '';
    if (req.body.useCase !== undefined) product.useCase = req.body.useCase || '';
    if (req.body.certifications !== undefined) product.certifications = req.body.certifications || '';
    if (req.body.texture !== undefined) product.texture = req.body.texture || '';
    if (req.body.cuffStyle !== undefined) product.cuffStyle = req.body.cuffStyle || '';
    if (req.body.sterility !== undefined) product.sterility = req.body.sterility || '';
    if (req.body.case_weight !== undefined) product.case_weight = req.body.case_weight != null && req.body.case_weight !== '' ? parseFloat(req.body.case_weight) : null;
    if (req.body.case_length !== undefined) product.case_length = req.body.case_length != null && req.body.case_length !== '' ? parseFloat(req.body.case_length) : null;
    if (req.body.case_width !== undefined) product.case_width = req.body.case_width != null && req.body.case_width !== '' ? parseFloat(req.body.case_width) : null;
    if (req.body.case_height !== undefined) product.case_height = req.body.case_height != null && req.body.case_height !== '' ? parseFloat(req.body.case_height) : null;

    saveDB(db);
    res.json({ success: true, product });
});

// Delete product (admin only)
app.delete('/api/products/:id', authenticateToken, (req, res) => {
    db = loadDB();
    
    // Check if user is admin/approved
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const index = db.products.findIndex(p => p.id == req.params.id);
    if (index === -1) {
        return res.status(404).json({ error: 'Product not found' });
    }
    
    db.products.splice(index, 1);
    saveDB(db);
    res.json({ success: true });
});

// Batch delete products (admin only)
app.post('/api/products/batch-delete', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const idSet = new Set(ids.map(id => Number(id)).filter(n => !isNaN(n)));
    const before = db.products.length;
    db.products = db.products.filter(p => !idSet.has(Number(p.id)));
    const deleted = before - db.products.length;
    saveDB(db);
    res.json({ success: true, deleted });
});

app.get('/api/categories', (req, res) => {
    db = loadDB();
    const categories = [...new Set(db.products.map(p => p.category).filter(Boolean))].sort();
    res.json(categories);
});

app.get('/api/brands', (req, res) => {
    db = loadDB();
    const brands = [...new Set(db.products.map(p => p.brand).filter(Boolean))].sort();
    res.json(brands);
});

// Products CSV export: stream CSV for download (optionally save to disk when writable)
app.get('/api/products/export.csv', authenticateToken, (req, res) => {
    try {
        db = loadDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (!user || !user.is_approved) {
            return res.status(403).send('Admin access required');
        }
        let products = Array.isArray(db.products) ? [...db.products] : [];
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

        const manufacturers = Array.isArray(db.manufacturers) ? db.manufacturers : [];
        const { csvContent, filename } = productStore.productsToCsv(products, { manufacturers });
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
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required to sync inventory' });
    }
    if (!fishbowl.isConfigured()) {
        return res.status(400).json({ error: 'Fishbowl not configured. Set FISHBOWL_BASE_URL, FISHBOWL_USERNAME, FISHBOWL_PASSWORD in .env' });
    }
    try {
        const inventoryList = await fishbowl.getAllInventory(true);
        // Import from Fishbowl: only products that start with GLV- (gloves only), as requested
        const GLV_PREFIX = 'GLV-';
        const qtyByPartNumber = {};
        for (const row of inventoryList) {
            const num = (row.partNumber || row.number || '').toString().trim().toUpperCase();
            if (!num || !num.startsWith(GLV_PREFIX)) continue;
            const existing = qtyByPartNumber[num] || 0;
            qtyByPartNumber[num] = existing + (row.quantity || 0);
        }
        let updated = 0;
        for (const product of db.products) {
            const mainSku = (product.sku || '').toString().trim().toUpperCase();
            if (!mainSku) continue;
            let totalQty = qtyByPartNumber[mainSku] || 0;
            const sizes = (product.sizes || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
            for (const size of sizes) {
                const variantSku = mainSku + '-' + size.toUpperCase().replace(/\s+/g, '');
                totalQty += qtyByPartNumber[variantSku] || 0;
            }
            const inStock = totalQty > 0 ? 1 : 0;
            if (product.in_stock !== inStock || product.quantity_on_hand !== totalQty) {
                product.in_stock = inStock;
                product.quantity_on_hand = totalQty;
                updated++;
            }
        }
        saveDB(db);
        res.json({ success: true, updated, totalProducts: db.products.length, message: `Synced: ${updated} product(s) updated from Fishbowl (GLV- only)` });
    } catch (err) {
        console.error('Fishbowl sync error:', err);
        res.status(500).json({
            error: err.message || 'Fishbowl sync failed',
            mfaRequired: err.mfaRequired === true
        });
    }
});

/**
 * Export customers who have placed orders — for Fishbowl to create customers and fulfill orders.
 * Admin only. Returns customers with company, contact, address for Fishbowl import.
 */
function getCustomersForFishbowlExport(db) {
    const userIdsWithOrders = [...new Set((db.orders || []).map(o => o.user_id))];
    const customers = (db.users || [])
        .filter(u => userIdsWithOrders.includes(u.id))
        .map(u => {
            const orderCount = (db.orders || []).filter(o => o.user_id === u.id).length;
            const lastOrder = (db.orders || []).filter(o => o.user_id === u.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
            return {
                id: u.id,
                company_name: u.company_name || '',
                contact_name: u.contact_name || '',
                email: u.email || '',
                phone: (u.phone || '').replace(/\D/g, '').slice(0, 15) || '',
                address: u.address || '',
                city: u.city || '',
                state: u.state || '',
                zip: (u.zip || '').replace(/\D/g, '').slice(0, 10) || '',
                country: 'USA',
                order_count: orderCount,
                last_order_number: lastOrder ? lastOrder.order_number : '',
                last_order_date: lastOrder ? lastOrder.created_at : ''
            };
        })
        .sort((a, b) => (b.company_name || '').localeCompare(a.company_name || ''));
    return customers;
}

app.get('/api/fishbowl/export-customers', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const customers = getCustomersForFishbowlExport(db);
    res.json({ customers, count: customers.length });
});

app.get('/api/fishbowl/export-customers.csv', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).send('Admin access required');
    }
    // Create the CSV file on disk when exporting (so the file exists for Fishbowl)
    writeFishbowlCustomersExport();
    const customers = getCustomersForFishbowlExport(db);
    const escapeCsv = (v) => {
        const s = (v == null ? '' : String(v)).replace(/"/g, '""');
        return /[",\r\n]/.test(s) ? `"${s}"` : s;
    };
    const headers = ['id', 'company_name', 'contact_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'order_count', 'last_order_number', 'last_order_date'];
    const rows = [headers.join(',')].concat(
        customers.map(c => headers.map(h => escapeCsv(c[h])).join(','))
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fishbowl-customers.csv"');
    res.send(rows.join('\r\n'));
});

/**
 * Write customer export to file (for scheduled export every 30 min).
 * Fishbowl can read this file or poll GET /api/fishbowl/export-customers-file
 */
function writeFishbowlCustomersExport() {
    try {
        const data = loadDB();
        const customers = getCustomersForFishbowlExport(data);
        const escapeCsv = (v) => {
            const s = (v == null ? '' : String(v)).replace(/"/g, '""');
            return /[",\r\n]/.test(s) ? `"${s}"` : s;
        };
        const headers = ['id', 'company_name', 'contact_name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country', 'order_count', 'last_order_number', 'last_order_date'];
        const rows = [headers.join(',')].concat(
            customers.map(c => headers.map(h => escapeCsv(c[h])).join(','))
        );
        const csvContent = rows.join('\r\n');
        if (!fs.existsSync(FISHBOWL_EXPORT_DIR)) {
            fs.mkdirSync(FISHBOWL_EXPORT_DIR, { recursive: true });
        }
        fs.writeFileSync(FISHBOWL_EXPORT_FILE, csvContent, 'utf8');
        console.log(`[Fishbowl] Customer export written: ${customers.length} customers -> ${FISHBOWL_EXPORT_FILE}`);
    } catch (err) {
        console.error('[Fishbowl] Error writing customer export:', err.message);
    }
}

/**
 * Serve the scheduled Fishbowl customer export file.
 * Auth: admin JWT, or query param ?secret=FISHBOWL_EXPORT_SECRET for polling by Fishbowl.
 */
app.get('/api/fishbowl/export-customers-file', (req, res) => {
    const secret = process.env.FISHBOWL_EXPORT_SECRET;
    const useSecret = secret && req.query.secret === secret;
    if (!useSecret) {
        // Require admin auth
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Missing auth: use Authorization header or ?secret=FISHBOWL_EXPORT_SECRET' });
        }
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                const isExpired = err.name === 'TokenExpiredError';
                return res.status(isExpired ? 401 : 403).json({ error: isExpired ? 'Session expired' : 'Invalid token' });
            }
            const data = loadDB();
            const adminUser = data.users.find(u => u.id === user.id);
            if (!adminUser || !adminUser.is_approved) {
                return res.status(403).json({ error: 'Admin access required' });
            }
            serveExportFile(res);
        });
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

app.get('/api/cart', optionalAuth, (req, res) => {
    db = loadDB();
    const sessionId = req.headers['x-session-id'] || 'anonymous';
    const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
    const cartItems = db.carts[cartKey] || [];
    const companyId = req.user ? getCompanyIdForUser(db, req.user) : null;

    const enrichedCart = cartItems.map(item => {
        const product = db.products.find(p => p.id === item.product_id);
        let price = product?.price || 0;
        const bulk_price = product?.bulk_price ?? null;
        if (companyId != null && product) {
            const cost = product.cost != null && product.cost !== '' ? Number(product.cost) : (product.price != null ? Number(product.price) : 0);
            const margin = getEffectiveMargin(db, companyId, product.manufacturer_id);
            const sell = computeSellPrice(cost, margin);
            if (!Number.isNaN(sell)) price = sell;
        }

        let variantSku = product?.sku || '';
        if (item.size && variantSku) {
            const sizeSuffix = item.size.toUpperCase().replace(/\s+/g, '');
            variantSku = `${variantSku}-${sizeSuffix}`;
        }

        return {
            ...item,
            name: product?.name || 'Unknown',
            price,
            bulk_price: companyId != null ? price : bulk_price,
            image_url: product?.image_url || '',
            sku: product?.sku || '',
            variant_sku: variantSku
        };
    });

    res.json(enrichedCart);
});

app.post('/api/cart', optionalAuth, (req, res) => {
    const { product_id, size, quantity } = req.body;
    db = loadDB();
    
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const product = db.products && db.products.find(p => p.id == product_id);
    if (!product) {
        return res.status(404).json({ error: 'Product not found' });
    }
    
    const sessionId = req.headers['x-session-id'] || 'anonymous';
    const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
    if (!db.carts[cartKey]) db.carts[cartKey] = [];
    
    const existing = db.carts[cartKey].find(item => item.product_id === product_id && item.size === size);
    
    if (existing) {
        existing.quantity += qty;
    } else {
        db.carts[cartKey].push({
            id: Date.now(),
            product_id,
            size: size || null,
            quantity: qty
        });
    }
    
    saveDB(db);
    res.json({ success: true });
});

app.put('/api/cart/:id', optionalAuth, (req, res) => {
    const quantity = parseInt(req.body?.quantity, 10);
    db = loadDB();
    
    const sessionId = req.headers['x-session-id'] || 'anonymous';
    const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
    if (!db.carts[cartKey]) return res.json({ success: true });
    
    if (!Number.isInteger(quantity) || quantity <= 0) {
        db.carts[cartKey] = db.carts[cartKey].filter(item => item.id != req.params.id);
    } else {
        const item = db.carts[cartKey].find(item => item.id == req.params.id);
        if (item) item.quantity = quantity;
    }
    
    saveDB(db);
    res.json({ success: true });
});

app.delete('/api/cart/:id', optionalAuth, (req, res) => {
    db = loadDB();
    const sessionId = req.headers['x-session-id'] || 'anonymous';
    const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
    if (db.carts[cartKey]) {
        db.carts[cartKey] = db.carts[cartKey].filter(item => item.id != req.params.id);
        saveDB(db);
    }
    res.json({ success: true });
});

app.delete('/api/cart', optionalAuth, (req, res) => {
    db = loadDB();
    const sessionId = req.headers['x-session-id'] || 'anonymous';
    const cartKey = req.user?.id ? `user_${req.user.id}` : `session_${sessionId}`;
    db.carts[cartKey] = [];
    saveDB(db);
    res.json({ success: true });
});

// ============ ORDER ROUTES ============

app.post('/api/orders', authenticateToken, (req, res) => {
    const { shipping_address, notes, ship_to_id, payment_method } = req.body;
    db = loadDB();
    
    let finalShippingAddress = shipping_address;
    if (ship_to_id) {
        const shipTo = (db.ship_to_addresses || []).find(s => s.id == ship_to_id && s.user_id === req.user.id);
        if (shipTo) {
            finalShippingAddress = `${shipTo.label || 'Ship-to'}: ${shipTo.address}, ${shipTo.city}, ${shipTo.state} ${shipTo.zip}`;
        }
    }
    
    const cartKey = `user_${req.user.id}`;
    const cartItems = db.carts[cartKey] || [];

    if (cartItems.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }

    // Reject checkout if any cart item references a missing or out-of-stock product
    const missing = cartItems.filter(item => {
        const product = db.products.find(p => p.id === item.product_id);
        return !product || !product.in_stock;
    });
    if (missing.length > 0) {
        return res.status(400).json({
            error: 'Some items in your cart are no longer available. Please update your cart.',
            unavailable_product_ids: [...new Set(missing.map(m => m.product_id))]
        });
    }

    const user = db.users.find(u => u.id === req.user.id);
    
    // Get discount percent for tier
    let discountPercent = 0;
    if (user && user.is_approved) {
        switch (user.discount_tier) {
            case 'bronze': discountPercent = 5; break;
            case 'silver': discountPercent = 10; break;
            case 'gold': discountPercent = 15; break;
            case 'platinum': discountPercent = 20; break;
        }
    }
    
    let subtotal = 0;
    const orderItems = cartItems.map(item => {
        const product = db.products.find(p => p.id === item.product_id);
        let price = user && user.is_approved && product.bulk_price ? product.bulk_price : product.price;
        // Apply discount tier to price
        if (discountPercent > 0) {
            price = price * (1 - discountPercent / 100);
        }
        subtotal += price * item.quantity;
        
        // Generate variant SKU with size suffix (e.g., GLV-AMS-N400-M)
        let variantSku = product.sku || '';
        if (item.size && product.sku) {
            const sizeSuffix = item.size.toUpperCase().replace(/\s+/g, '');
            variantSku = `${product.sku}-${sizeSuffix}`;
        }
        
        return {
            product_id: item.product_id,
            sku: product.sku || '',
            variant_sku: variantSku,
            name: product.name || 'Unknown',
            size: item.size || null,
            quantity: item.quantity,
            price
        };
    });

    // Discount is already applied to prices, so discount amount is 0
    const discount = 0;
    const shipping = subtotal >= 500 ? 0 : 25;
    const tax = subtotal * 0.08;
    const total = subtotal + shipping + tax;

    const orderNumber = 'GC-' + Date.now().toString(36).toUpperCase();
    const userPaymentTerms = (user.payment_terms === 'net30') ? 'net30' : 'credit_card';
    const orderPaymentMethod = (payment_method === 'net30') ? 'net30' : (payment_method === 'credit_card' ? 'credit_card' : userPaymentTerms);

    const order = {
        id: Date.now(),
        user_id: req.user.id,
        order_number: orderNumber,
        status: 'pending',
        payment_method: orderPaymentMethod,
        subtotal,
        discount,
        shipping,
        tax,
        total,
        shipping_address: finalShippingAddress,
        ship_to_id: ship_to_id || null,
        notes,
        items: orderItems,
        tracking_number: '',
        tracking_url: '',
        created_at: new Date().toISOString()
    };

    db.orders.push(order);
    db.carts[cartKey] = [];
    saveDB(db);

    // Order confirmation email
    const orderUser = db.users.find(u => u.id === req.user.id);
    if (orderUser && orderUser.email) {
        const orderSummary = order.items.map(i => `  ${i.name} x${i.quantity} - $${(i.price * i.quantity).toFixed(2)}`).join('\n');
        const orderText = `Thank you for your order!\n\nOrder: ${orderNumber}\nTotal: $${order.total.toFixed(2)}\n\nItems:\n${orderSummary}\n\nShipping to: ${order.shipping_address}\n\nWe'll notify you when your order ships.\n\nGlovecubs`;
        sendMail({ to: orderUser.email, subject: `Order confirmed: ${orderNumber}`, text: orderText }).catch(() => {});
    }
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
    if (adminEmail) {
        const adminText = `New order ${orderNumber} from ${orderUser?.company_name || orderUser?.email} - Total: $${order.total.toFixed(2)}`;
        sendMail({ to: adminEmail, subject: `[Glovecubs] New order: ${orderNumber}`, text: adminText }).catch(() => {});
    }

    res.json({
        success: true,
        order_number: orderNumber,
        order_id: order.id,
        total
    });
});

app.get('/api/orders', authenticateToken, (req, res) => {
    db = loadDB();
    const orders = db.orders.filter(o => o.user_id === req.user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(orders);
});

app.get('/api/orders/:id', authenticateToken, (req, res) => {
    db = loadDB();
    const order = db.orders.find(o => o.id == req.params.id && o.user_id === req.user.id);
    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
});

// Reorder: add all items from an order back to cart
app.post('/api/orders/:id/reorder', authenticateToken, (req, res) => {
    db = loadDB();
    const order = db.orders.find(o => o.id == req.params.id && o.user_id === req.user.id);
    if (!order || !order.items || order.items.length === 0) {
        return res.status(404).json({ error: 'Order not found or has no items' });
    }
    const cartKey = `user_${req.user.id}`;
    if (!db.carts[cartKey]) db.carts[cartKey] = [];
    let added = 0;
    for (const item of order.items) {
        const product = db.products.find(p => p.id === item.product_id);
        if (!product || !product.in_stock) continue;
        const existing = db.carts[cartKey].find(c => c.product_id === item.product_id && (c.size || null) === (item.size || null));
        if (existing) {
            existing.quantity += item.quantity;
        } else {
            db.carts[cartKey].push({
                id: Date.now() + added,
                product_id: item.product_id,
                size: item.size || null,
                quantity: item.quantity
            });
        }
        added++;
    }
    saveDB(db);
    res.json({ success: true, added: order.items.length, message: 'Items added to cart' });
});

// Invoice data for an order (for display/print)
app.get('/api/orders/:id/invoice', authenticateToken, (req, res) => {
    db = loadDB();
    const order = db.orders.find(o => o.id == req.params.id && o.user_id === req.user.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const user = db.users.find(u => u.id === req.user.id);
    res.json({
        order,
        company: user ? { company_name: user.company_name, contact_name: user.contact_name, address: user.address, city: user.city, state: user.state, zip: user.zip, email: user.email, phone: user.phone } : null
    });
});

// ============ ACCOUNT: BUDGET, REP, TIER PROGRESS ============

// Tier progress (YTD spend and amount to next tier)
function getTierThresholds() {
    return { bronze: 1000, silver: 5000, gold: 15000, platinum: 50000 };
}
function getTierOrder() {
    return ['standard', 'bronze', 'silver', 'gold', 'platinum'];
}

app.get('/api/account/tier-progress', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const orders = (db.orders || []).filter(o => o.user_id === req.user.id && o.created_at >= yearStart);
    const ytdSpend = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const tiers = getTierThresholds();
    const order = getTierOrder();
    const currentTier = user.discount_tier || 'standard';
    const currentIdx = order.indexOf(currentTier);
    const nextTier = currentIdx < order.length - 1 ? order[currentIdx + 1] : null;
    const nextThreshold = nextTier ? (tiers[nextTier] || 0) : null;
    const amountToNextTier = nextThreshold != null ? Math.max(0, nextThreshold - ytdSpend) : 0;
    res.json({
        ytd_spend: ytdSpend,
        current_tier: currentTier,
        next_tier: nextTier,
        next_tier_threshold: nextThreshold,
        amount_to_next_tier: amountToNextTier
    });
});

app.get('/api/account/budget', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const budgetAmount = user.budget_amount != null ? user.budget_amount : null;
    const budgetPeriod = user.budget_period || 'monthly';
    const now = new Date();
    let periodStart;
    if (budgetPeriod === 'annual') {
        periodStart = new Date(now.getFullYear(), 0, 1).toISOString();
    } else {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }
    const orders = (db.orders || []).filter(o => o.user_id === req.user.id && o.created_at >= periodStart);
    const spent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    res.json({
        budget_amount: budgetAmount,
        budget_period: budgetPeriod,
        spent,
        remaining: budgetAmount != null ? Math.max(0, budgetAmount - spent) : null
    });
});

app.put('/api/account/budget', authenticateToken, (req, res) => {
    const { budget_amount, budget_period } = req.body;
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (budget_amount !== undefined) user.budget_amount = budget_amount == null || budget_amount === '' ? null : parseFloat(budget_amount);
    if (budget_period !== undefined) user.budget_period = budget_period === 'annual' ? 'annual' : 'monthly';
    saveDB(db);
    const { password, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// Spend, savings, and summary for dashboard (all-time, YTD, last 30 days; savings vs list price)
app.get('/api/account/summary', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const allOrders = (db.orders || []).filter(o => o.user_id === req.user.id);
    const ytdOrders = allOrders.filter(o => o.created_at >= yearStart);
    const last30Orders = allOrders.filter(o => o.created_at >= thirtyDaysAgo);
    const totalSpend = allOrders.reduce((s, o) => s + (o.total || 0), 0);
    const ytdSpend = ytdOrders.reduce((s, o) => s + (o.total || 0), 0);
    const last30Spend = last30Orders.reduce((s, o) => s + (o.total || 0), 0);
    let totalSavings = 0;
    let totalUnits = 0;
    for (const order of allOrders) {
        for (const item of order.items || []) {
            const product = db.products.find(p => p.id === item.product_id);
            const listPrice = product ? (product.price || 0) : item.price;
            const paid = (item.price || 0) * (item.quantity || 0);
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
});

// Default rep (from env or first approved user); per-user override in user record
app.get('/api/account/rep', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const rep = {
        name: user.rep_name || process.env.REP_NAME || 'Glovecubs Sales',
        email: user.rep_email || process.env.REP_EMAIL || 'sales@glovecubs.com',
        phone: user.rep_phone || process.env.REP_PHONE || '1-800-GLOVECUBS'
    };
    res.json(rep);
});

// ============ SHIP-TO ADDRESSES ============

app.get('/api/ship-to', authenticateToken, (req, res) => {
    db = loadDB();
    const list = (db.ship_to_addresses || []).filter(s => s.user_id === req.user.id);
    res.json(list);
});

app.post('/api/ship-to', authenticateToken, (req, res) => {
    const { label, address, city, state, zip, is_default } = req.body;
    if (!address || !city || !state || !zip) {
        return res.status(400).json({ error: 'Address, city, state, and zip are required' });
    }
    db = loadDB();
    const list = db.ship_to_addresses || [];
    if (list.some(s => s.user_id === req.user.id && (s.label || '').toLowerCase() === (label || '').toLowerCase())) {
        return res.status(400).json({ error: 'A ship-to address with this label already exists' });
    }
    const newShipTo = {
        id: Date.now(),
        user_id: req.user.id,
        label: label || 'Primary',
        address,
        city,
        state,
        zip,
        is_default: !!is_default
    };
    if (newShipTo.is_default) {
        list.filter(s => s.user_id === req.user.id).forEach(s => { s.is_default = false; });
    }
    list.push(newShipTo);
    db.ship_to_addresses = list;
    saveDB(db);
    res.json({ success: true, ship_to: newShipTo });
});

app.put('/api/ship-to/:id', authenticateToken, (req, res) => {
    const { label, address, city, state, zip, is_default } = req.body;
    db = loadDB();
    const shipTo = (db.ship_to_addresses || []).find(s => s.id == req.params.id && s.user_id === req.user.id);
    if (!shipTo) return res.status(404).json({ error: 'Ship-to address not found' });
    if (label !== undefined) shipTo.label = label;
    if (address !== undefined) shipTo.address = address;
    if (city !== undefined) shipTo.city = city;
    if (state !== undefined) shipTo.state = state;
    if (zip !== undefined) shipTo.zip = zip;
    if (is_default !== undefined) {
        shipTo.is_default = !!is_default;
        if (shipTo.is_default) {
            (db.ship_to_addresses || []).filter(s => s.user_id === req.user.id).forEach(s => { s.is_default = s.id === shipTo.id; });
        }
    }
    saveDB(db);
    res.json({ success: true, ship_to: shipTo });
});

app.delete('/api/ship-to/:id', authenticateToken, (req, res) => {
    db = loadDB();
    const list = db.ship_to_addresses || [];
    const idx = list.findIndex(s => s.id == req.params.id && s.user_id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Ship-to address not found' });
    list.splice(idx, 1);
    db.ship_to_addresses = list;
    saveDB(db);
    res.json({ success: true });
});

// ============ SAVED LISTS ============

app.get('/api/saved-lists', authenticateToken, (req, res) => {
    db = loadDB();
    const list = (db.saved_lists || []).filter(s => s.user_id === req.user.id);
    res.json(list);
});

app.post('/api/saved-lists', authenticateToken, (req, res) => {
    const { name, items } = req.body;
    if (!name || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Name and items (array of { product_id, size, quantity }) are required' });
    }
    db = loadDB();
    const newList = {
        id: Date.now(),
        user_id: req.user.id,
        name: name.trim(),
        items: items.map(i => ({ product_id: i.product_id, size: i.size || null, quantity: Math.max(1, parseInt(i.quantity, 10) || 1) })),
        created_at: new Date().toISOString()
    };
    if (!db.saved_lists) db.saved_lists = [];
    db.saved_lists.push(newList);
    saveDB(db);
    res.json({ success: true, list: newList });
});

app.put('/api/saved-lists/:id', authenticateToken, (req, res) => {
    const { name, items } = req.body;
    db = loadDB();
    const list = (db.saved_lists || []).find(s => s.id == req.params.id && s.user_id === req.user.id);
    if (!list) return res.status(404).json({ error: 'Saved list not found' });
    if (name !== undefined) list.name = name.trim();
    if (Array.isArray(items)) list.items = items.map(i => ({ product_id: i.product_id, size: i.size || null, quantity: Math.max(1, parseInt(i.quantity, 10) || 1) }));
    saveDB(db);
    res.json({ success: true, list });
});

app.delete('/api/saved-lists/:id', authenticateToken, (req, res) => {
    db = loadDB();
    const arr = db.saved_lists || [];
    const idx = arr.findIndex(s => s.id == req.params.id && s.user_id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Saved list not found' });
    arr.splice(idx, 1);
    db.saved_lists = arr;
    saveDB(db);
    res.json({ success: true });
});

// Add saved list items to cart
app.post('/api/saved-lists/:id/add-to-cart', authenticateToken, (req, res) => {
    db = loadDB();
    const list = (db.saved_lists || []).find(s => s.id == req.params.id && s.user_id === req.user.id);
    if (!list || !list.items || list.items.length === 0) {
        return res.status(404).json({ error: 'Saved list not found or empty' });
    }
    const cartKey = `user_${req.user.id}`;
    if (!db.carts[cartKey]) db.carts[cartKey] = [];
    for (const item of list.items) {
        const product = db.products.find(p => p.id === item.product_id);
        if (!product) continue;
        const existing = db.carts[cartKey].find(c => c.product_id === item.product_id && (c.size || null) === (item.size || null));
        if (existing) existing.quantity += item.quantity;
        else db.carts[cartKey].push({ id: Date.now() + Math.random(), product_id: item.product_id, size: item.size || null, quantity: item.quantity });
    }
    saveDB(db);
    res.json({ success: true, message: 'List items added to cart' });
});

// ============ UPLOADED INVOICES (for cost analysis) ============

app.get('/api/invoices', authenticateToken, (req, res) => {
    db = loadDB();
    const list = (db.uploaded_invoices || []).filter(inv => inv.user_id === req.user.id);
    res.json(list.sort((a, b) => new Date(b.invoice_date || b.created_at) - new Date(a.invoice_date || a.created_at)));
});

app.post('/api/invoices', authenticateToken, (req, res) => {
    const { vendor, invoice_date, total_amount, notes, line_items } = req.body;
    if (!total_amount || isNaN(parseFloat(total_amount))) {
        return res.status(400).json({ error: 'Total amount is required.' });
    }
    db = loadDB();
    if (!db.uploaded_invoices) db.uploaded_invoices = [];
    const inv = {
        id: Date.now(),
        user_id: req.user.id,
        vendor: (vendor || '').toString().trim() || 'Unknown',
        invoice_date: (invoice_date || '').toString().trim() || new Date().toISOString().split('T')[0],
        total_amount: parseFloat(total_amount),
        notes: (notes || '').toString().trim() || '',
        line_items: Array.isArray(line_items) ? line_items : [],
        created_at: new Date().toISOString()
    };
    db.uploaded_invoices.push(inv);
    saveDB(db);
    res.json({ success: true, invoice: inv });
});

app.delete('/api/invoices/:id', authenticateToken, (req, res) => {
    db = loadDB();
    const list = db.uploaded_invoices || [];
    const idx = list.findIndex(inv => inv.id == req.params.id && inv.user_id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
    list.splice(idx, 1);
    db.uploaded_invoices = list;
    saveDB(db);
    res.json({ success: true });
});

// ============ BULK ADD TO CART (CSV / SKU list) ============

app.post('/api/cart/bulk', authenticateToken, (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array required (e.g. [{ sku, quantity, size? }])' });
    }
    db = loadDB();
    const cartKey = `user_${req.user.id}`;
    if (!db.carts[cartKey]) db.carts[cartKey] = [];
    let added = 0, skipped = 0;
    for (const row of items) {
        const sku = (row.sku || row.SKU || '').toString().trim();
        const qty = Math.max(1, parseInt(row.quantity || row.qty || 1, 10));
        const size = row.size || null;
        if (!sku) { skipped++; continue; }
        const product = db.products.find(p => (p.sku || '').toString().trim().toLowerCase() === sku.toLowerCase());
        if (!product) { skipped++; continue; }
        const existing = db.carts[cartKey].find(c => c.product_id === product.id && (c.size || null) === (size || null));
        if (existing) existing.quantity += qty;
        else db.carts[cartKey].push({ id: Date.now() + added, product_id: product.id, size, quantity: qty });
        added++;
    }
    saveDB(db);
    res.json({ success: true, added, skipped });
});

// ============ RFQ ROUTES ============

app.post('/api/rfqs', (req, res) => {
    try {
        const { company_name, contact_name, email, phone, quantity, type, use_case, notes } = req.body;
        db = loadDB();
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        let userId = null;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.id;
            } catch (e) { /* ignore */ }
        }
        const user = userId ? db.users.find(u => u.id === userId) : null;
        const newRFQ = {
            id: Date.now(),
            user_id: userId || null,
            company_name: company_name || (user && user.company_name) || '',
            contact_name: contact_name || (user && user.contact_name) || '',
            email: email || (user && user.email) || '',
            phone: phone || (user && user.phone) || '',
            quantity: quantity || '',
            type: type || '',
            use_case: use_case || '',
            notes: notes || '',
            status: 'pending',
            created_at: new Date().toISOString()
        };
        db.rfqs.push(newRFQ);
        saveDB(db);

        const rfqEmail = newRFQ.email || (user && user.email);
        if (rfqEmail) {
            const custText = `Hi ${newRFQ.contact_name || 'there'},\n\nWe received your request for quote (${newRFQ.quantity} ${newRFQ.type || 'gloves'}). Our team will get back to you shortly.\n\nGlovecubs`;
            sendMail({ to: rfqEmail, subject: 'We received your RFQ - Glovecubs', text: custText }).catch(() => {});
        }
        const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
        if (adminEmail) {
            const adminText = `New RFQ #${newRFQ.id}\nCompany: ${newRFQ.company_name}\nContact: ${newRFQ.contact_name}\nEmail: ${newRFQ.email}\nQuantity: ${newRFQ.quantity}\nType: ${newRFQ.type}\nUse case: ${newRFQ.use_case}\nNotes: ${newRFQ.notes}`;
            sendMail({ to: adminEmail, subject: `[Glovecubs] New RFQ from ${newRFQ.company_name || newRFQ.email}`, text: adminText }).catch(() => {});
        }

        res.json({ success: true, message: 'RFQ submitted successfully', rfq_id: newRFQ.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/rfqs/mine', authenticateToken, (req, res) => {
    db = loadDB();
    const list = (db.rfqs || []).filter(r => r.user_id === req.user.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(list);
});

app.get('/api/rfqs', authenticateToken, (req, res) => {
    db = loadDB();
    
    // Check if user is admin
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const rfqs = db.rfqs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(rfqs);
});

app.put('/api/rfqs/:id', authenticateToken, (req, res) => {
    db = loadDB();
    
    // Check if user is admin
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    const rfq = db.rfqs.find(r => r.id == req.params.id);
    if (!rfq) {
        return res.status(404).json({ error: 'RFQ not found' });
    }
    
    if (req.body.status) {
        rfq.status = req.body.status;
    }
    if (req.body.notes !== undefined) {
        rfq.admin_notes = req.body.notes;
    }
    
    saveDB(db);
    res.json({ success: true, rfq });
});

// ============ ADMIN ROUTES ============

app.get('/api/admin/orders', authenticateToken, (req, res) => {
    db = loadDB();
    
    // Check if user is admin
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get all orders with user info
    const orders = db.orders.map(order => {
        const orderUser = db.users.find(u => u.id === order.user_id);
        return {
            ...order,
            user: orderUser ? {
                company_name: orderUser.company_name,
                email: orderUser.email,
                contact_name: orderUser.contact_name
            } : null
        };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json(orders);
});

app.put('/api/admin/orders/:id', authenticateToken, (req, res) => {
    db = loadDB();
    const adminUser = db.users.find(u => u.id === req.user.id);
    if (!adminUser || !adminUser.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const order = db.orders.find(o => o.id == req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.body.tracking_number !== undefined) order.tracking_number = String(req.body.tracking_number || '').trim();
    if (req.body.tracking_url !== undefined) order.tracking_url = String(req.body.tracking_url || '').trim();
    if (req.body.status !== undefined) order.status = req.body.status;
    saveDB(db);
    res.json({ success: true, order });
});

app.get('/api/admin/users', authenticateToken, (req, res) => {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user || !user.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const users = db.users.map(u => {
        const { password, ...safeUser } = u;
        return safeUser;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(users);
});

// Admin: create new customer (approved, with optional quicklist and payment terms)
app.post('/api/admin/users', authenticateToken, async (req, res) => {
    db = loadDB();
    const adminUser = db.users.find(u => u.id === req.user.id);
    if (!adminUser || !adminUser.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const { company_name, contact_name, email, password, phone, address, city, state, zip, payment_terms, allow_free_upgrades, quicklist } = req.body;
    if (!company_name || !contact_name || !email || !password) {
        return res.status(400).json({ error: 'Company name, contact name, email, and password are required' });
    }
    const emailTrim = (email || '').toString().trim().toLowerCase();
    const existing = db.users.find(u => (u.email || '').toString().trim().toLowerCase() === emailTrim);
    if (existing) {
        return res.status(400).json({ error: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: Date.now(),
        company_name: (company_name || '').trim(),
        contact_name: (contact_name || '').trim(),
        email: emailTrim,
        password: hashedPassword,
        phone: (phone || '').trim(),
        address: (address || '').trim(),
        city: (city || '').trim(),
        state: (state || '').trim(),
        zip: (zip || '').trim(),
        payment_terms: payment_terms === 'net30' ? 'net30' : 'credit_card',
        allow_free_upgrades: !!allow_free_upgrades,
        is_approved: 1,
        discount_tier: 'standard',
        created_at: new Date().toISOString(),
        budget_amount: null,
        budget_period: 'monthly',
        rep_name: '',
        rep_email: '',
        rep_phone: ''
    };
    db.users.push(newUser);
    if (quicklist && quicklist.name && Array.isArray(quicklist.items) && quicklist.items.length > 0) {
        if (!db.saved_lists) db.saved_lists = [];
        db.saved_lists.push({
            id: Date.now() + 1,
            user_id: newUser.id,
            name: (quicklist.name || 'Quicklist').trim(),
            items: quicklist.items.map(i => ({
                product_id: i.product_id,
                size: i.size || null,
                quantity: Math.max(1, parseInt(i.quantity, 10) || 1)
            })),
            created_at: new Date().toISOString()
        });
    }
    saveDB(db);
    const { password: _p, ...safeUser } = newUser;
    res.status(201).json({ success: true, user: safeUser, message: 'Customer created. They can sign in and place orders.' });
});

app.put('/api/admin/users/:id', authenticateToken, (req, res) => {
    db = loadDB();
    const adminUser = db.users.find(u => u.id === req.user.id);
    if (!adminUser || !adminUser.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const user = db.users.find(u => u.id == req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    if (req.body.is_approved !== undefined) {
        user.is_approved = req.body.is_approved ? 1 : 0;
    }
    if (req.body.discount_tier) {
        user.discount_tier = req.body.discount_tier;
    }
    if (req.body.payment_terms !== undefined) {
        user.payment_terms = req.body.payment_terms === 'net30' ? 'net30' : 'credit_card';
    }
    saveDB(db);
    const { password, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

app.get('/api/admin/contact-messages', authenticateToken, (req, res) => {
    db = loadDB();
    const adminUser = db.users.find(u => u.id === req.user.id);
    if (!adminUser || !adminUser.is_approved) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    const messages = (db.contact_messages || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(messages);
});

// ---------- Admin: customer pricing (companies, default margin, manufacturer overrides) ----------
/** Resolve company id for a logged-in user (match by company_name). Used for customer pricing. */
function getCompanyIdForUser(db, reqUser) {
    if (!db || !reqUser || reqUser.id == null) return null;
    const user = (db.users || []).find(u => u.id === reqUser.id);
    if (!user || !(user.company_name || '').trim()) return null;
    const name = (user.company_name || '').trim().toLowerCase();
    const company = (db.companies || []).find(c => (c.name || '').trim().toLowerCase() === name);
    return company ? company.id : null;
}

function requireAdmin(req, res, next) {
    db = loadDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(403).json({ error: 'Admin access required' });
    const admins = db.app_admins || [];
    const isAllowlisted = admins.length > 0 && (admins.includes(user.id) || admins.includes((user.email || '').toLowerCase()));
    if (!user.is_approved && !isAllowlisted) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

app.get('/api/admin/companies', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const list = (db.companies || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(list);
});

app.get('/api/admin/manufacturers', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const list = (db.manufacturers || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    res.json(list);
});

app.patch('/api/admin/manufacturers/:id', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const mfr = (db.manufacturers || []).find((m) => m.id == req.params.id);
    if (!mfr) return res.status(404).json({ error: 'Manufacturer not found' });
    if (req.body.vendor_email !== undefined) mfr.vendor_email = String(req.body.vendor_email || '').trim() || null;
    if (req.body.po_email !== undefined) mfr.po_email = String(req.body.po_email || '').trim() || null;
    saveDB(db);
    res.json(mfr);
});

// ---------- Inventory (in-app fishbowl) ----------
app.get('/api/admin/inventory', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const products = db.products || [];
    const invList = db.inventory || [];
    const byProduct = new Map(invList.map((i) => [i.product_id, i]));
    const rows = products.map((p) => {
        const inv = byProduct.get(p.id);
        return {
            product_id: p.id,
            sku: p.sku,
            name: p.name,
            brand: p.brand,
            quantity_on_hand: inv ? (inv.quantity_on_hand ?? 0) : (p.quantity_on_hand ?? 0),
            reorder_point: inv ? (inv.reorder_point ?? 0) : (p.reorder_point ?? 0),
            bin_location: inv ? (inv.bin_location || '') : (p.bin_location || ''),
            last_count_at: inv ? inv.last_count_at : null
        };
    });
    res.json(rows);
});

app.put('/api/admin/inventory/:product_id', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const productId = parseInt(req.params.product_id, 10);
    if (isNaN(productId)) return res.status(400).json({ error: 'Invalid product_id' });
    const product = (db.products || []).find((p) => p.id === productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    let inv = (db.inventory || []).find((i) => i.product_id === productId);
    if (!inv) {
        inv = { product_id: productId, quantity_on_hand: 0, reorder_point: 0, bin_location: '' };
        if (!db.inventory) db.inventory = [];
        db.inventory.push(inv);
    }
    if (req.body.quantity_on_hand !== undefined) {
        inv.quantity_on_hand = Math.max(0, parseInt(req.body.quantity_on_hand, 10) || 0);
        inv.last_count_at = new Date().toISOString();
    }
    if (req.body.reorder_point !== undefined) inv.reorder_point = Math.max(0, parseInt(req.body.reorder_point, 10) || 0);
    if (req.body.bin_location !== undefined) inv.bin_location = String(req.body.bin_location || '').trim();
    saveDB(db);
    res.json(inv);
});

app.post('/api/admin/inventory/cycle', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const counts = Array.isArray(req.body.counts) ? req.body.counts : [];
    const byProduct = new Map((db.inventory || []).map((i) => [i.product_id, i]));
    const products = db.products || [];
    for (const row of counts) {
        const pid = row.product_id != null ? parseInt(row.product_id, 10) : NaN;
        if (isNaN(pid)) continue;
        const product = products.find((p) => p.id === pid);
        if (!product) continue;
        let inv = byProduct.get(pid);
        if (!inv) {
            inv = { product_id: pid, quantity_on_hand: 0, reorder_point: 0, bin_location: '' };
            db.inventory = db.inventory || [];
            db.inventory.push(inv);
            byProduct.set(pid, inv);
        }
        inv.quantity_on_hand = Math.max(0, parseInt(row.quantity_on_hand, 10) || 0);
        inv.last_count_at = new Date().toISOString();
    }
    saveDB(db);
    res.json({ success: true, updated: counts.length });
});

// ---------- Purchase Orders ----------
function nextPoNumber(db) {
    const list = db.purchase_orders || [];
    const nums = list.map((po) => (po.po_number || '').replace(/^PO-/, '')).filter((n) => /^\d+$/.test(n));
    const max = nums.length ? Math.max(...nums.map((n) => parseInt(n, 10))) : 0;
    return 'PO-' + String(max + 1).padStart(5, '0');
}

app.get('/api/admin/purchase-orders', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const list = (db.purchase_orders || []).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const manufacturers = db.manufacturers || [];
    const orders = db.orders || [];
    const out = list.map((po) => {
        const mfr = manufacturers.find((m) => m.id === po.manufacturer_id);
        const order = po.order_id != null ? orders.find((o) => o.id === po.order_id) : null;
        return {
            ...po,
            manufacturer_name: mfr ? mfr.name : '',
            order_number: order ? order.order_number : null
        };
    });
    res.json(out);
});

app.get('/api/admin/purchase-orders/:id', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const po = (db.purchase_orders || []).find((p) => p.id == req.params.id);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    const mfr = (db.manufacturers || []).find((m) => m.id === po.manufacturer_id);
    const order = po.order_id != null ? (db.orders || []).find((o) => o.id === po.order_id) : null;
    res.json({ ...po, manufacturer_name: mfr ? mfr.name : '', order, order_number: order ? order.order_number : null });
});

app.post('/api/admin/purchase-orders', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const { manufacturer_id, order_id, lines, shipping_address, customer_order_number } = req.body;
    const mid = manufacturer_id != null ? parseInt(manufacturer_id, 10) : null;
    if (mid == null || isNaN(mid)) return res.status(400).json({ error: 'manufacturer_id required' });
    const mfr = (db.manufacturers || []).find((m) => m.id === mid);
    if (!mfr) return res.status(400).json({ error: 'Manufacturer not found' });
    const lineItems = Array.isArray(lines) ? lines : [];
    const poNumber = nextPoNumber(db);
    const id = Date.now();
    const po = {
        id,
        po_number: poNumber,
        manufacturer_id: mid,
        manufacturer_name: mfr.name,
        order_id: order_id != null ? parseInt(order_id, 10) : null,
        status: 'draft',
        lines: lineItems.map((l) => ({
            product_id: l.product_id,
            sku: l.sku || '',
            name: l.name || '',
            quantity: Math.max(1, parseInt(l.quantity, 10) || 1),
            unit_cost: parseFloat(l.unit_cost) || 0
        })),
        subtotal: 0,
        shipping_address: shipping_address || null,
        customer_order_number: customer_order_number || null,
        created_at: new Date().toISOString(),
        sent_at: null
    };
    po.subtotal = po.lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
    if (!db.purchase_orders) db.purchase_orders = [];
    db.purchase_orders.push(po);
    saveDB(db);
    res.json(po);
});

app.put('/api/admin/purchase-orders/:id', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const po = (db.purchase_orders || []).find((p) => p.id == req.params.id);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    if (req.body.lines !== undefined && Array.isArray(req.body.lines)) {
        po.lines = req.body.lines.map((l) => ({
            product_id: l.product_id,
            sku: l.sku || '',
            name: l.name || '',
            quantity: Math.max(1, parseInt(l.quantity, 10) || 1),
            unit_cost: parseFloat(l.unit_cost) || 0
        }));
        po.subtotal = po.lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
    }
    if (req.body.shipping_address !== undefined) po.shipping_address = req.body.shipping_address;
    if (req.body.customer_order_number !== undefined) po.customer_order_number = req.body.customer_order_number;
    saveDB(db);
    res.json(po);
});

app.post('/api/admin/purchase-orders/:id/send', authenticateToken, requireAdmin, async (req, res) => {
    db = loadDB();
    const po = (db.purchase_orders || []).find((p) => p.id == req.params.id);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    const mfr = (db.manufacturers || []).find((m) => m.id === po.manufacturer_id);
    if (!mfr) return res.status(400).json({ error: 'Manufacturer not found' });
    const toEmail = (mfr.po_email || mfr.vendor_email || '').toString().trim();
    if (!toEmail) return res.status(400).json({ error: 'Manufacturer has no PO/vendor email. Add it in Vendors.' });
    const lineText = (po.lines || []).map((l) => `  ${l.sku || l.name} - ${l.name || ''} x ${l.quantity} @ $${(l.unit_cost || 0).toFixed(2)}`).join('\n');
    const bodyText = `GloveCubs Purchase Order\n\nPO#: ${po.po_number}\nDate: ${(po.created_at || '').slice(0, 10)}\n\nShip to (drop-ship):\n${(po.shipping_address || 'See order').replace(/\n/g, '\n')}\n\nCustomer Order: ${po.customer_order_number || 'N/A'}\n\nLine items:\n${lineText}\n\nSubtotal: $${(po.subtotal || 0).toFixed(2)}\n\nPlease confirm and ship to the address above.\n\n— GloveCubs`;
    const bodyHtml = bodyText.replace(/\n/g, '<br>');
    const result = await sendMail({ to: toEmail, subject: `Purchase Order ${po.po_number} - GloveCubs`, text: bodyText, html: bodyHtml });
    if (!result.sent) return res.status(500).json({ error: result.error || 'Failed to send email' });
    po.status = 'sent';
    po.sent_at = new Date().toISOString();
    saveDB(db);
    res.json({ success: true, sent: true, po_number: po.po_number });
});

// Create PO from customer order and send to vendor (drop-ship)
app.post('/api/admin/orders/:id/create-po', authenticateToken, requireAdmin, async (req, res) => {
    db = loadDB();
    const order = (db.orders || []).find((o) => o.id == req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const manufacturers = db.manufacturers || [];
    const products = db.products || [];
    const byMfr = new Map();
    for (const item of order.items || []) {
        const product = products.find((p) => p.id === item.product_id);
        const mfrId = product ? (product.manufacturer_id || null) : null;
        if (!mfrId) continue;
        if (!byMfr.has(mfrId)) byMfr.set(mfrId, []);
        byMfr.get(mfrId).push({
            product_id: item.product_id,
            sku: item.sku || product?.sku,
            name: item.name || product?.name,
            quantity: item.quantity,
            unit_cost: product ? (product.cost || 0) : 0
        });
    }
    const mfrId = req.body.manufacturer_id != null ? parseInt(req.body.manufacturer_id, 10) : (byMfr.size === 1 ? [...byMfr.keys()][0] : null);
    if (mfrId == null || isNaN(mfrId)) return res.status(400).json({ error: 'Order has items from multiple or no manufacturers. Specify manufacturer_id.' });
    const mfr = manufacturers.find((m) => m.id === mfrId);
    if (!mfr) return res.status(400).json({ error: 'Manufacturer not found' });
    const lines = byMfr.get(mfrId) || [];
    if (lines.length === 0) return res.status(400).json({ error: 'No line items for this manufacturer' });
    const poNumber = nextPoNumber(db);
    const poId = Date.now();
    const po = {
        id: poId,
        po_number: poNumber,
        manufacturer_id: mfrId,
        manufacturer_name: mfr.name,
        order_id: order.id,
        status: 'draft',
        lines,
        subtotal: lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0),
        shipping_address: order.shipping_address || null,
        customer_order_number: order.order_number || null,
        created_at: new Date().toISOString(),
        sent_at: null
    };
    if (!db.purchase_orders) db.purchase_orders = [];
    db.purchase_orders.push(po);
    const toEmail = (mfr.po_email || mfr.vendor_email || '').toString().trim();
    if (!toEmail) {
        saveDB(db);
        return res.json({ success: true, po, message: 'PO created. Add vendor email in Vendors and send from Purchase Orders.' });
    }
    const lineText = po.lines.map((l) => `  ${l.sku || l.name} - ${l.name || ''} x ${l.quantity} @ $${(l.unit_cost || 0).toFixed(2)}`).join('\n');
    const bodyText = `GloveCubs Purchase Order\n\nPO#: ${poNumber}\nDate: ${po.created_at.slice(0, 10)}\n\nShip to (drop-ship):\n${(po.shipping_address || '').replace(/\n/g, '\n')}\n\nCustomer Order: ${po.customer_order_number || 'N/A'}\n\nLine items:\n${lineText}\n\nSubtotal: $${po.subtotal.toFixed(2)}\n\nPlease confirm and ship to the address above.\n\n— GloveCubs`;
    const result = await sendMail({ to: toEmail, subject: `Purchase Order ${poNumber} - GloveCubs`, text: bodyText, html: bodyText.replace(/\n/g, '<br>') });
    if (result.sent) {
        po.status = 'sent';
        po.sent_at = new Date().toISOString();
        saveDB(db);
        return res.json({ success: true, po, sent: true, message: 'PO created and sent to vendor.' });
    }
    saveDB(db);
    res.json({ success: true, po, sent: false, message: 'PO created. Email failed: ' + (result.error || 'unknown') });
});

app.get('/api/admin/companies/:id', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const company = (db.companies || []).find((c) => c.id == req.params.id);
    if (!company) {
        return res.status(404).json({ error: 'Company not found' });
    }
    const overrides = (db.customer_manufacturer_pricing || [])
        .filter((o) => o.company_id == req.params.id)
        .map((o) => {
            const mfr = (db.manufacturers || []).find((m) => m.id === o.manufacturer_id);
            const gross = o.gross_margin_percent != null ? o.gross_margin_percent : o.margin_percent;
            return {
                id: o.id,
                manufacturer_id: o.manufacturer_id,
                manufacturer_name: mfr ? mfr.name : '',
                gross_margin_percent: gross,
                margin_percent: gross
            };
        });
    res.json({ ...company, overrides });
});

app.post('/api/admin/companies/:id/default-margin', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const company = (db.companies || []).find((c) => c.id == req.params.id);
    if (!company) {
        return res.status(404).json({ error: 'Company not found' });
    }
    let percent = req.body.default_gross_margin_percent != null ? Number(req.body.default_gross_margin_percent) : null;
    if (percent == null) percent = req.body.margin_percent != null ? Number(req.body.margin_percent) : null;
    if (percent == null || isNaN(percent)) {
        return res.status(400).json({ error: 'default_gross_margin_percent or margin_percent required' });
    }
    if (percent < 0 || percent >= 100) {
        return res.status(400).json({ error: 'Margin must be 0 <= margin < 100' });
    }
    company.default_gross_margin_percent = percent;
    company.updated_at = new Date().toISOString();
    saveDB(db);
    res.json({ success: true, company });
});

app.post('/api/admin/companies/:id/overrides', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const company = (db.companies || []).find((c) => c.id == req.params.id);
    if (!company) {
        return res.status(404).json({ error: 'Company not found' });
    }
    const manufacturer_id = req.body.manufacturer_id != null ? Number(req.body.manufacturer_id) : null;
    let gross_margin_percent = req.body.gross_margin_percent != null ? Number(req.body.gross_margin_percent) : (req.body.margin_percent != null ? Number(req.body.margin_percent) : null);
    if (manufacturer_id == null || isNaN(manufacturer_id)) {
        return res.status(400).json({ error: 'manufacturer_id required' });
    }
    if (gross_margin_percent == null || isNaN(gross_margin_percent) || gross_margin_percent < 0 || gross_margin_percent >= 100) {
        return res.status(400).json({ error: 'gross_margin_percent (or margin_percent) required and must be 0 <= value < 100' });
    }
    const list = db.customer_manufacturer_pricing || [];
    const existing = list.find((o) => o.company_id == req.params.id && o.manufacturer_id === manufacturer_id);
    const companyId = Number(req.params.id);
    if (existing) {
        existing.gross_margin_percent = gross_margin_percent;
        existing.margin_percent = gross_margin_percent;
        existing.updated_at = new Date().toISOString();
    } else {
        const maxId = list.length ? Math.max(...list.map((o) => o.id)) : 0;
        list.push({
            id: maxId + 1,
            company_id: companyId,
            manufacturer_id,
            gross_margin_percent,
            margin_percent: gross_margin_percent,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
    }
    saveDB(db);
    const override = list.find((o) => o.company_id == companyId && o.manufacturer_id === manufacturer_id);
    const mfr = (db.manufacturers || []).find((m) => m.id === manufacturer_id);
    const gross = override.gross_margin_percent != null ? override.gross_margin_percent : override.margin_percent;
    res.json({
        success: true,
        override: {
            id: override.id,
            manufacturer_id: override.manufacturer_id,
            manufacturer_name: mfr ? mfr.name : '',
            gross_margin_percent: gross,
            margin_percent: gross
        }
    });
});

app.delete('/api/admin/companies/:id/overrides/:overrideId', authenticateToken, requireAdmin, (req, res) => {
    db = loadDB();
    const company = (db.companies || []).find((c) => c.id == req.params.id);
    if (!company) {
        return res.status(404).json({ error: 'Company not found' });
    }
    const list = db.customer_manufacturer_pricing || [];
    const idx = list.findIndex((o) => o.id == req.params.overrideId && o.company_id == req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Override not found' });
    }
    list.splice(idx, 1);
    saveDB(db);
    res.json({ success: true });
});

// Optional: get effective margin and sell price (for admin or storefront)
app.get('/api/pricing/effective-margin', authenticateToken, (req, res) => {
    db = loadDB();
    const companyId = req.query.companyId != null ? Number(req.query.companyId) : null;
    const manufacturerId = req.query.manufacturerId != null ? Number(req.query.manufacturerId) : null;
    if (companyId == null) {
        return res.status(400).json({ error: 'companyId required' });
    }
    const margin = getEffectiveMargin(db, companyId, manufacturerId);
    res.json({ margin_percent: margin });
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

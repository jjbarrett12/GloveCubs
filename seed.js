/**
 * Seed GloveCubs with demo products and demo user into Supabase.
 * No JSON file usage; all data written directly to Supabase.
 *
 * Usage:
 *   node seed.js
 *
 * Environment guard: Set SEED_ALLOW=1 to run in any environment.
 * Without it, seed only runs when NODE_ENV is 'development' or unset.
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or environment).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const { getSupabaseAdmin, isSupabaseAdminConfigured } = require('./lib/supabaseAdmin');
const usersService = require('./services/usersService');
const catalogService = require('./services/catalogService');

function requireSeedAllow() {
    const allow = process.env.SEED_ALLOW === '1' || process.env.SEED_ALLOW === 'true';
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
    if (!allow && !isDev) {
        console.error('\n❌ Seed blocked. Set SEED_ALLOW=1 to run in production/staging, or run with NODE_ENV=development.\n');
        process.exit(1);
    }
}

// Product data (same as legacy seed; mapped for Supabase)
const products = [
    { sku: 'GLV-GL-N105FX', name: 'ProWorks Nitrile Exam Gloves - Powder Free', brand: 'Hospeco', category: 'Disposable Gloves', subcategory: 'Nitrile', description: 'Premium quality nitrile exam gloves. Powder-free, latex-free formula provides excellent tactile sensitivity and durability.', material: 'Nitrile', sizes: 'S,M,L,XL', color: 'Blue', pack_qty: 100, case_qty: 1000, price: 12.99, bulk_price: 9.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Blue+Nitrile', in_stock: 1, featured: 1 },
    { sku: 'GLV-GL-N105FB', name: 'ProWorks Nitrile Gloves - Black', brand: 'Hospeco', category: 'Disposable Gloves', subcategory: 'Nitrile', description: 'Professional-grade black nitrile gloves. Powder-free and latex-free with superior puncture resistance.', material: 'Nitrile', sizes: 'S,M,L,XL,2XL', color: 'Black', pack_qty: 100, case_qty: 1000, price: 14.99, bulk_price: 11.49, image_url: 'https://via.placeholder.com/400x400/FFFFFF/333333?text=Black+Nitrile+Gloves', in_stock: 1, featured: 1 },
    { sku: 'GLV-GL-L101F', name: 'ProWorks Latex Exam Gloves - Powder Free', brand: 'Hospeco', category: 'Disposable Gloves', subcategory: 'Latex', description: 'High-quality latex exam gloves with excellent elasticity and comfort. Powder-free formula reduces allergic reactions.', material: 'Latex', sizes: 'S,M,L,XL', color: 'Natural', pack_qty: 100, case_qty: 1000, price: 10.99, bulk_price: 7.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/333333?text=Latex+Gloves', in_stock: 1, featured: 0 },
    { sku: 'GLV-GL-V104F', name: 'ProWorks Vinyl Gloves - Powder Free', brand: 'Hospeco', category: 'Disposable Gloves', subcategory: 'Vinyl', description: 'Economical vinyl gloves for light-duty applications. Latex-free and powder-free.', material: 'Vinyl', sizes: 'S,M,L,XL', color: 'Clear', pack_qty: 100, case_qty: 1000, price: 7.99, bulk_price: 5.49, image_url: 'https://via.placeholder.com/400x400/FFFFFF/333333?text=Vinyl+Gloves', in_stock: 1, featured: 0 },
    { sku: 'GLV-705PFE', name: 'Panther-Guard Nitrile Gloves - Industrial Grade', brand: 'Global Glove', category: 'Disposable Gloves', subcategory: 'Nitrile', description: 'Industrial grade nitrile gloves with exceptional chemical resistance. 5 mil thickness.', material: 'Nitrile', sizes: 'S,M,L,XL,2XL', color: 'Blue', pack_qty: 100, case_qty: 1000, price: 15.99, bulk_price: 12.49, image_url: 'https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Panther-Guard+Blue', in_stock: 1, featured: 1 },
    { sku: 'GLV-705BPF', name: 'Panther-Guard Nitrile Gloves - Black Industrial', brand: 'Global Glove', category: 'Disposable Gloves', subcategory: 'Nitrile', description: 'Heavy-duty black nitrile gloves for industrial applications. 6 mil thickness.', material: 'Nitrile', sizes: 'S,M,L,XL,2XL', color: 'Black', pack_qty: 100, case_qty: 1000, price: 17.99, bulk_price: 13.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/000000?text=Panther-Guard+Black', in_stock: 1, featured: 1 },
    { sku: 'GLV-805PF', name: 'Panther-Guard Nitrile - 8 Mil Heavy Duty', brand: 'Global Glove', category: 'Disposable Gloves', subcategory: 'Nitrile', description: 'Extra thick 8 mil nitrile gloves for maximum protection.', material: 'Nitrile', sizes: 'M,L,XL,2XL', color: 'Orange', pack_qty: 50, case_qty: 500, price: 19.99, bulk_price: 15.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/FF6B00?text=8+Mil+Nitrile+HD', in_stock: 1, featured: 1 },
    { sku: 'GLV-500G', name: 'Gripster Foam Nitrile Coated Work Gloves', brand: 'Global Glove', category: 'Work Gloves', subcategory: 'Coated', description: 'Lightweight nylon shell with foam nitrile palm coating.', material: 'Nylon/Nitrile', sizes: 'S,M,L,XL,2XL', color: 'Gray/Black', pack_qty: 12, case_qty: 144, price: 36.99, bulk_price: 28.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/333333?text=Gripster+Work+Gloves', in_stock: 1, featured: 1 },
    { sku: 'GLV-590MF', name: 'Samurai Glove - Cut Resistant A4', brand: 'Global Glove', category: 'Work Gloves', subcategory: 'Cut Resistant', description: 'ANSI A4 cut resistant gloves with micro-foam nitrile coating.', material: 'HPPE/Nitrile', sizes: 'S,M,L,XL,2XL', color: 'Green/Black', pack_qty: 12, case_qty: 72, price: 89.99, bulk_price: 69.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/00AA00?text=Samurai+Cut+A4', in_stock: 1, featured: 0 },
    { sku: 'GLV-CR509', name: 'CIA Global Impact Resistant Gloves', brand: 'Global Glove', category: 'Work Gloves', subcategory: 'Impact Resistant', description: 'Cut, impact, and abrasion resistant work gloves.', material: 'HPPE/TPR', sizes: 'M,L,XL,2XL', color: 'Black/Orange', pack_qty: 12, case_qty: 48, price: 149.99, bulk_price: 119.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/FF6B00?text=Impact+Resistant', in_stock: 1, featured: 1 },
    { sku: 'GLV-SAF-N100', name: 'Safeko Nitrile Exam Gloves - Premium', brand: 'Safeko', category: 'Disposable Gloves', subcategory: 'Nitrile', description: 'Premium nitrile exam gloves with superior fit and feel.', material: 'Nitrile', sizes: 'XS,S,M,L,XL', color: 'Blue', pack_qty: 100, case_qty: 1000, price: 13.49, bulk_price: 10.49, image_url: 'https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Safeko+Nitrile', in_stock: 1, featured: 0 },
    { sku: 'GLV-SAF-N200', name: 'Safeko Nitrile Gloves - Food Service', brand: 'Safeko', category: 'Disposable Gloves', subcategory: 'Nitrile', description: 'FDA compliant nitrile gloves for food handling.', material: 'Nitrile', sizes: 'S,M,L,XL', color: 'Blue', pack_qty: 100, case_qty: 1000, price: 11.99, bulk_price: 8.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Food+Service', in_stock: 1, featured: 0 },
    { sku: 'GLV-SAF-V100', name: 'Safeko Vinyl Gloves - Economy', brand: 'Safeko', category: 'Disposable Gloves', subcategory: 'Vinyl', description: 'Cost-effective vinyl gloves for general purpose use.', material: 'Vinyl', sizes: 'S,M,L,XL', color: 'Clear', pack_qty: 100, case_qty: 1000, price: 6.99, bulk_price: 4.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/333333?text=Safeko+Vinyl', in_stock: 1, featured: 0 },
    { sku: 'GLV-AMS-N300', name: 'Ambitex Nitrile Select - Blue', brand: 'Ambitex', category: 'Disposable Gloves', subcategory: 'Nitrile', description: 'High-quality nitrile gloves at an economical price point.', material: 'Nitrile', sizes: 'S,M,L,XL', color: 'Blue', pack_qty: 100, case_qty: 1000, price: 11.49, bulk_price: 8.49, image_url: 'https://via.placeholder.com/400x400/FFFFFF/0066CC?text=Ambitex+Nitrile', in_stock: 1, featured: 0 },
    { sku: 'GLV-PIP-34874', name: 'PIP MaxiFlex Ultimate Gloves', brand: 'PIP', category: 'Work Gloves', subcategory: 'Coated', description: 'Industry-leading coated work gloves with micro-foam nitrile.', material: 'Nylon/Nitrile', sizes: 'XS,S,M,L,XL,2XL,3XL', color: 'Gray/Black', pack_qty: 12, case_qty: 144, price: 48.99, bulk_price: 38.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/333333?text=MaxiFlex+Ultimate', in_stock: 1, featured: 1 },
    { sku: 'GLV-PIP-34876', name: 'PIP MaxiFlex Cut A3 Gloves', brand: 'PIP', category: 'Work Gloves', subcategory: 'Cut Resistant', description: 'ANSI A3 cut resistant gloves with micro-foam nitrile coating.', material: 'Engineered Yarn/Nitrile', sizes: 'XS,S,M,L,XL,2XL', color: 'Green/Black', pack_qty: 12, case_qty: 72, price: 64.99, bulk_price: 51.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/00AA00?text=MaxiFlex+Cut+A3', in_stock: 1, featured: 0 },
    { sku: 'GLV-MCR-9672', name: 'MCR Safety UltraTech Foam Nitrile', brand: 'MCR Safety', category: 'Work Gloves', subcategory: 'Coated', description: 'Premium foam nitrile coated work gloves.', material: 'Nylon/Nitrile', sizes: 'S,M,L,XL,2XL', color: 'Gray/Blue', pack_qty: 12, case_qty: 144, price: 42.99, bulk_price: 33.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/0066CC?text=UltraTech+Foam', in_stock: 1, featured: 0 },
    { sku: 'GLV-ANS-11800', name: 'Ansell HyFlex 11-800 Foam Nitrile', brand: 'Ansell', category: 'Work Gloves', subcategory: 'Coated', description: 'Ultra-lightweight foam nitrile coated gloves.', material: 'Nylon/Nitrile', sizes: 'S,M,L,XL', color: 'Gray', pack_qty: 12, case_qty: 144, price: 54.99, bulk_price: 43.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/666666?text=HyFlex+11-800', in_stock: 1, featured: 0 },
    { sku: 'GLV-SHW-370', name: 'SHOWA Atlas 370 Nitrile Gloves', brand: 'SHOWA', category: 'Work Gloves', subcategory: 'Coated', description: 'Original assembly grip gloves. Flat nitrile palm coating.', material: 'Nylon/Nitrile', sizes: 'XS,S,M,L,XL,2XL', color: 'Black', pack_qty: 12, case_qty: 144, price: 39.99, bulk_price: 31.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/000000?text=SHOWA+Atlas+370', in_stock: 1, featured: 0 },
    { sku: 'GLV-WSL-111', name: 'Wells Lamont Leather Work Gloves', brand: 'Wells Lamont', category: 'Work Gloves', subcategory: 'Leather', description: 'Premium grain leather work gloves with keystone thumb.', material: 'Cowhide Leather', sizes: 'S,M,L,XL', color: 'Tan', pack_qty: 12, case_qty: 72, price: 119.99, bulk_price: 94.99, image_url: 'https://via.placeholder.com/400x400/FFFFFF/D2B48C?text=Leather+Work+Gloves', in_stock: 1, featured: 0 }
];

async function seed() {
    requireSeedAllow();

    if (!isSupabaseAdminConfigured()) {
        console.error('\n❌ Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env\n');
        process.exit(1);
    }
    const supabase = getSupabaseAdmin();

    const brandSet = new Set(products.map((p) => (p.brand || '').trim()).filter(Boolean));
    const brandToId = {};
    for (const name of brandSet) {
        const { data: existing } = await supabase.from('manufacturers').select('id').eq('name', name).maybeSingle();
        if (existing) {
            brandToId[name] = existing.id;
        } else {
            const { data: inserted, error } = await supabase.from('manufacturers').insert({ name }).select('id').single();
            if (!error && inserted) brandToId[name] = inserted.id;
        }
    }

    let created = 0;
    let updated = 0;
    for (const p of products) {
        const mfrId = p.brand ? brandToId[p.brand] : null;
        const payload = {
            sku: p.sku,
            name: p.name,
            brand: p.brand || null,
            category: p.category || null,
            subcategory: p.subcategory || null,
            description: p.description || null,
            material: p.material || null,
            color: p.color || null,
            sizes: p.sizes || null,
            pack_qty: p.pack_qty ?? null,
            case_qty: p.case_qty ?? null,
            cost: p.price != null ? p.price : 0,
            bulk_price: p.bulk_price ?? null,
            image_url: p.image_url || null,
            in_stock: p.in_stock != null ? p.in_stock : 1,
            featured: p.featured != null ? p.featured : 0,
            manufacturer_id: mfrId ?? null
        };

        const existingBySku = await catalogService.getProductBySkuForWrite(p.sku);
        if (existingBySku && existingBySku.ambiguous) {
            console.warn('[seed] ambiguous SKU skipped:', p.sku);
            continue;
        }
        if (existingBySku && existingBySku.id) {
            await catalogService.updateProduct(existingBySku.id, payload);
            updated++;
        } else {
            await catalogService.createProduct(payload);
            created++;
        }
    }

    const demoEmail = 'demo@company.com';
    const { data: existingUser } = await supabase.from('users').select('id').ilike('email', demoEmail).maybeSingle();
    let userCreated = false;
    if (!existingUser) {
        const hashedPassword = bcrypt.hashSync('demo123', 10);
        try {
            await usersService.createUser({
                email: demoEmail,
                password_hash: hashedPassword,
                plain_password: 'demo123',
                company_name: 'Demo Company Inc',
                contact_name: 'John Demo',
                phone: '555-123-4567',
                address: '123 Demo Street',
                city: 'Chicago',
                state: 'IL',
                zip: '60601',
                is_approved: 1,
                discount_tier: 'silver',
                payment_terms: 'credit_card',
            });
            userCreated = true;
        } catch (e) {
            console.error('Demo user seed:', e.message || e);
        }
    }

    console.log('\n✅ Seed complete (Supabase)');
    console.log(`   Products: ${created} created, ${updated} updated`);
    console.log(`   Demo user: ${userCreated ? 'created' : 'already exists'}`);
    if (!existingUser && userCreated) console.log(`   Login: demo@company.com / demo123`);
    console.log('\n🚀 Run \'npm run dev\' to launch the server\n');
}

seed().catch((err) => {
    console.error('\n❌ Seed error:', err.message);
    process.exit(1);
});

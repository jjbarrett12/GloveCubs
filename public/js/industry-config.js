/**
 * Industry landing page config — single source for copy, assets, and filter defaults.
 * Drives IndustryLandingPage template. Slugs must match routes: medical, janitorial, food-service, industrial, automotive.
 */
window.industryConfig = {
    medical: {
        slug: 'medical',
        industryTag: 'Healthcare',
        heroHeadline: 'Medical & Healthcare Gloves',
        heroSubheadline: 'Exam-grade and medical gloves for clinics, hospitals, and care facilities. Nitrile, latex-free, and sterile options with B2B pricing.',
        heroImage: '/images/industries/medical-hero.jpg',
        heroImageAlt: 'Healthcare professional wearing nitrile gloves',
        ctaPrimary: { text: 'Shop Medical Gloves', href: '#shop', action: 'scroll' },
        ctaSecondary: { text: 'Bulk Pricing', href: '#bulk', action: 'scroll' },
        features: [
            { title: 'Exam & medical grade', description: 'Meets ASTM and FDA requirements for clinical use.' },
            { title: 'Latex-free options', description: 'Reduce allergy risk with nitrile and vinyl.' },
            { title: 'Sterile & non-sterile', description: 'Choose by procedure and compliance needs.' }
        ],
        complianceBadges: ['FDA Approved', 'ASTM D6319', 'Latex Free'],
        proofStats: [
            { value: '10M+', label: 'Gloves shipped' },
            { value: '500+', label: 'Healthcare accounts' },
            { value: '24/7', label: 'Reorder support' }
        ],
        faq: [
            { q: 'What glove material is best for healthcare?', a: 'Nitrile is the most common choice: latex-free, durable, and compliant. Vinyl and polyethylene are options for non-clinical tasks.' },
            { q: 'Do you offer sterile gloves?', a: 'Yes. We carry sterile and non-sterile options. Filter by “Sterility” on the shop page or ask our team for recommendations.' },
            { q: 'Can I get bulk pricing for my facility?', a: 'Yes. Request a quote or sign in for B2B pricing. We support net terms and recurring orders.' }
        ],
        filterDefaults: { materials: ['Nitrile'], thicknesses: [], certifications: ['FDA Approved', 'Latex Free'] }
    },
    janitorial: {
        slug: 'janitorial',
        industryTag: 'Janitorial',
        heroHeadline: 'Janitorial & Cleaning Gloves',
        heroSubheadline: 'Durable disposable and reusable gloves for custodial, housekeeping, and cleaning. Bulk cases, fast shipping.',
        heroImage: '/images/industries/janitorial-hero.jpg',
        heroImageAlt: 'Janitorial worker with cleaning gloves',
        ctaPrimary: { text: 'Shop Cleaning Gloves', href: '#shop', action: 'scroll' },
        ctaSecondary: { text: 'Bulk Pricing', href: '#bulk', action: 'scroll' },
        features: [
            { title: 'Heavy-duty options', description: 'Resist chemicals and abrasion for daily cleaning.' },
            { title: 'Comfortable fit', description: 'Textured grip and beaded cuffs for all-day wear.' },
            { title: 'Case pricing', description: 'Save with case quantities and auto-ship.' }
        ],
        complianceBadges: [],
        proofStats: [
            { value: '50K+', label: 'Cases/year' },
            { value: '2-day', label: 'Shipping available' }
        ],
        faq: [
            { q: 'What gloves are best for janitorial work?', a: 'Nitrile and vinyl are popular for general cleaning. For heavy chemicals, choose chemical-resistant or coated gloves.' },
            { q: 'Do you offer powder-free gloves?', a: 'Yes. Filter by “Powder-Free” on the shop section. Most of our cleaning gloves are powder-free.' }
        ],
        filterDefaults: { materials: ['Nitrile', 'Vinyl'], thicknesses: ['4', '5', '6'], certifications: [] }
    },
    'food-service': {
        slug: 'food-service',
        industryTag: 'Food Service',
        heroHeadline: 'Food Service Gloves',
        heroSubheadline: 'FDA-compliant gloves for restaurants, catering, and food service. Nitrile, vinyl, and polyethylene in bulk.',
        heroImage: '/images/industries/food-service-hero.jpg',
        heroImageAlt: 'Food service worker with disposable gloves',
        ctaPrimary: { text: 'Shop Food Service Gloves', href: '#shop', action: 'scroll' },
        ctaSecondary: { text: 'Bulk Pricing', href: '#bulk', action: 'scroll' },
        features: [
            { title: 'FDA compliant', description: 'Suitable for direct and indirect food contact.' },
            { title: 'Multiple materials', description: 'Nitrile, vinyl, and PE to match your needs.' },
            { title: 'Case quantities', description: 'Bulk pricing and delivery for high-volume use.' }
        ],
        complianceBadges: ['FDA Approved', 'Food Safe'],
        proofStats: [
            { value: '1M+', label: 'Boxes delivered' },
            { value: 'Next-day', label: 'Available in select regions' }
        ],
        faq: [
            { q: 'Are these gloves FDA approved?', a: 'Our food service gloves meet FDA requirements for food contact. Look for “FDA Approved” or “Food Safe” in the product details.' },
            { q: 'Nitrile vs vinyl for food service?', a: 'Nitrile is stronger and more puncture-resistant; vinyl is economical. Both are suitable for food handling when used correctly.' }
        ],
        filterDefaults: { materials: ['Nitrile', 'Vinyl', 'Polyethylene (PE)'], thicknesses: [], certifications: ['FDA Approved', 'Food Safe'] }
    },
    industrial: {
        slug: 'industrial',
        industryTag: 'Industrial',
        heroHeadline: 'Industrial & Manufacturing Gloves',
        heroSubheadline: 'Work gloves for manufacturing, assembly, and industrial applications. Cut-resistant, impact-resistant, and chemical options.',
        heroImage: '/images/industries/industrial-hero.jpg',
        heroImageAlt: 'Worker in industrial gloves',
        ctaPrimary: { text: 'Shop Industrial Gloves', href: '#shop', action: 'scroll' },
        ctaSecondary: { text: 'Bulk Pricing', href: '#bulk', action: 'scroll' },
        features: [
            { title: 'Cut & puncture resistance', description: 'ANSI/ISEA levels for hand protection.' },
            { title: 'Dexterity and grip', description: 'Designed for precision and durability.' },
            { title: 'B2B pricing', description: 'Volume discounts and net terms.' }
        ],
        complianceBadges: ['ANSI/ISEA 105', 'ASTM F2992'],
        proofStats: [
            { value: '100+', label: 'Plants supplied' },
            { value: 'A1–A9', label: 'Cut levels available' }
        ],
        faq: [
            { q: 'What cut level do I need?', a: 'Depends on the task. A1–A3 for light duty; A4–A6 for medium; A7–A9 for heavy. We can help you choose.' },
            { q: 'Do you offer chemical-resistant gloves?', a: 'Yes. Filter by “Chemical Resistant” or “Coated” in the shop section.' }
        ],
        filterDefaults: { materials: ['Nitrile'], thicknesses: ['5', '6', '7+'], certifications: [] }
    },
    automotive: {
        slug: 'automotive',
        industryTag: 'Automotive',
        heroHeadline: 'Automotive Gloves',
        heroSubheadline: 'Mechanic and automotive gloves. Nitrile, impact-resistant, and cut-resistant styles for shops and fleets.',
        heroImage: '/images/industries/automotive-hero.jpg',
        heroImageAlt: 'Mechanic wearing automotive gloves',
        ctaPrimary: { text: 'Shop Automotive Gloves', href: '#shop', action: 'scroll' },
        ctaSecondary: { text: 'Bulk Pricing', href: '#bulk', action: 'scroll' },
        features: [
            { title: 'Oil & grease resistance', description: 'Nitrile and coated options for shop use.' },
            { title: 'Impact & cut protection', description: 'ANSI-rated when you need extra protection.' },
            { title: 'Bulk for fleets', description: 'Case pricing and delivery for shops.' }
        ],
        complianceBadges: [],
        proofStats: [
            { value: '500+', label: 'Shops supplied' },
            { value: '2-day', label: 'Shipping' }
        ],
        faq: [
            { q: 'Best gloves for mechanics?', a: 'Nitrile disposable or reusable mechanics gloves are most common. For heavy duty, choose impact-resistant or cut-resistant.' },
            { q: 'Do you have fleet pricing?', a: 'Yes. Request a quote or sign in for B2B pricing. We support multi-location and recurring orders.' }
        ],
        filterDefaults: { materials: ['Nitrile'], thicknesses: ['5', '6', '7+'], certifications: [] }
    }
};

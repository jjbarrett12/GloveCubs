/**
 * Download manufacturer logos and save to public/images/logos.
 * Uses Clearbit Logo API (logo.clearbit.com) where available.
 * Run: node scripts/download-manufacturer-logos.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const OUT_DIR = path.join(__dirname, '..', 'public', 'images', 'logos');

// Manufacturer display name -> { domain for Clearbit, slug for filename }
const MANUFACTURERS = [
  { name: 'Hospeco', domain: 'hospecobrands.com', slug: 'hospeco' },
  { name: 'Global Glove', domain: 'globalglove.com', slug: 'global-glove' },
  { name: 'Safeko', domain: 'safeko.com', slug: 'safeko' },
  { name: 'Ambitex', domain: 'tradexgloves.com', slug: 'ambitex' },
  { name: 'PIP', domain: 'pipglobal.com', slug: 'pip' },
  { name: 'MCR Safety', domain: 'mcrsafety.com', slug: 'mcr-safety' },
  { name: 'Ansell', domain: 'ansell.com', slug: 'ansell' },
  { name: 'SHOWA', domain: 'showagroup.com', slug: 'showa' },
  { name: 'Wells Lamont', domain: 'wellslamont.com', slug: 'wells-lamont' },
  { name: 'Growl Gloves', domain: 'growlgloves.com', slug: 'growl-gloves' },
  { name: 'Semper Guard', domain: 'semperguard.com', slug: 'semper-guard' },
];

function download(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Glovecubs/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function getExtension(contentType) {
  if (!contentType) return '.png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('webp')) return '.webp';
  return '.png';
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log('Created', OUT_DIR);
  }

  for (const m of MANUFACTURERS) {
    const clearbitUrl = `https://logo.clearbit.com/${m.domain}`;
    const slug = m.slug;
    const filepath = path.join(OUT_DIR, `${slug}.png`);

    try {
      const buffer = await download(clearbitUrl);
      fs.writeFileSync(filepath, buffer);
      console.log('OK:', m.name, '->', `${slug}.png`);
    } catch (e) {
      console.warn('Skip:', m.name, '-', e.message);
    }
  }

  console.log('\nLogos saved to public/images/logos');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

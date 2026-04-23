#!/usr/bin/env node
/**
 * Setup products table schema in Supabase
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COLUMNS_SQL = `
-- Add missing columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_qty INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS case_qty INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS bulk_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS thickness TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS powder TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS use_case TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS certifications TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS texture TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cuff_style TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sterility TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS industry_tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;
`;

async function setup() {
  console.log('Setting up products table schema...\n');
  
  // Test connection first
  const { data: test, error: testErr } = await supabase.from('products').select('id').limit(1);
  if (testErr && testErr.code === '42P01') {
    console.log('Products table does not exist. Creating...');
    // Create the table
    const createSql = `
      CREATE TABLE IF NOT EXISTS products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        sku TEXT UNIQUE,
        name TEXT NOT NULL,
        brand TEXT,
        manufacturer_id UUID,
        cost DECIMAL(10,2),
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    console.log('Note: Need to run table creation in Supabase SQL Editor');
  }
  
  // For Supabase, we need to output SQL for manual execution
  console.log('Copy and paste this SQL into your Supabase SQL Editor:\n');
  console.log('═'.repeat(60));
  console.log(COLUMNS_SQL);
  console.log('═'.repeat(60));
  console.log('\nGo to: https://supabase.com/dashboard/project/kfrizyygvcjbomxdrdal/sql/new');
  console.log('Paste the SQL above and click "Run"\n');
}

setup().catch(console.error);

-- Find My Glove: glove_products, use cases, risk profiles, mapping, sessions
-- Run in Supabase SQL Editor or: supabase db push

-- 1) glove_products
CREATE TABLE IF NOT EXISTS glove_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  glove_type text NOT NULL CHECK (glove_type IN ('disposable', 'reusable')),
  material text,
  thickness_mil numeric,
  cut_level text,
  impact_rating boolean DEFAULT false,
  chemical_resistance jsonb DEFAULT '{}'::jsonb,
  heat_resistance_c numeric,
  cold_rating text,
  grip text,
  lining text,
  coating text,
  waterproof boolean DEFAULT false,
  food_safe boolean DEFAULT false,
  medical_grade boolean DEFAULT false,
  chemo_rated boolean DEFAULT false,
  powder_free boolean DEFAULT true,
  sterile boolean DEFAULT false,
  cuff_length_mm numeric,
  durability_score int DEFAULT 50,
  dexterity_score int DEFAULT 50,
  protection_score int DEFAULT 50,
  price_cents int NOT NULL,
  image_url text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_glove_products_active ON glove_products(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_glove_products_glove_type ON glove_products(glove_type);
CREATE INDEX IF NOT EXISTS idx_glove_products_material ON glove_products(material);

-- 2) glove_use_cases
CREATE TABLE IF NOT EXISTS glove_use_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  icon text,
  sort int DEFAULT 0
);

-- 3) glove_risk_profiles
CREATE TABLE IF NOT EXISTS glove_risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 4) glove_use_case_risks (join)
CREATE TABLE IF NOT EXISTS glove_use_case_risks (
  use_case_id uuid NOT NULL REFERENCES glove_use_cases(id) ON DELETE CASCADE,
  risk_profile_id uuid NOT NULL REFERENCES glove_risk_profiles(id) ON DELETE CASCADE,
  severity int NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3),
  PRIMARY KEY (use_case_id, risk_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_glove_uc_risks_use_case ON glove_use_case_risks(use_case_id);

-- 5) glove_reco_sessions (logging)
CREATE TABLE IF NOT EXISTS glove_reco_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  use_case_key text,
  answers jsonb,
  result jsonb,
  model_used text
);

-- RLS: public read for products, use cases, risks, mapping
ALTER TABLE glove_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE glove_use_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE glove_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE glove_use_case_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE glove_reco_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "glove_products_read" ON glove_products;
CREATE POLICY "glove_products_read" ON glove_products FOR SELECT USING (true);

DROP POLICY IF EXISTS "glove_use_cases_read" ON glove_use_cases;
CREATE POLICY "glove_use_cases_read" ON glove_use_cases FOR SELECT USING (true);

DROP POLICY IF EXISTS "glove_risk_profiles_read" ON glove_risk_profiles;
CREATE POLICY "glove_risk_profiles_read" ON glove_risk_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "glove_use_case_risks_read" ON glove_use_case_risks;
CREATE POLICY "glove_use_case_risks_read" ON glove_use_case_risks FOR SELECT USING (true);

-- glove_reco_sessions: insert only (anon/auth), no read for anon
DROP POLICY IF EXISTS "glove_reco_sessions_insert" ON glove_reco_sessions;
CREATE POLICY "glove_reco_sessions_insert" ON glove_reco_sessions FOR INSERT WITH CHECK (true);

-- Seed: use cases
INSERT INTO glove_use_cases (key, label, description, icon, sort) VALUES
  ('cleaning_disinfecting', 'Cleaning & Disinfecting', 'Custodial, sanitization, and surface cleaning.', 'sparkles', 1),
  ('food_preparation', 'Food Preparation', 'Kitchen, prep, and food handling.', 'utensils-crossed', 2),
  ('patient_care_exams', 'Patient Care & Exams', 'Clinical exams and patient contact.', 'stethoscope', 3),
  ('construction_work', 'Construction Work', 'General construction and building.', 'hard-hat', 4),
  ('plumbing_mechanical', 'Plumbing & Mechanical', 'Plumbing and mechanical repairs.', 'wrench', 5),
  ('electrical_work', 'Electrical Work', 'Electrical and wiring work.', 'zap', 6),
  ('automotive_repair', 'Automotive & Equipment Repair', 'Auto repair and equipment maintenance.', 'car', 7),
  ('warehouse_distribution', 'Warehouse & Distribution', 'Warehousing and distribution tasks.', 'package', 8),
  ('chemical_handling', 'Chemical Handling', 'Handling chemicals and harsh substances.', 'flask-conical', 9),
  ('cold_weather_work', 'Cold Weather Work', 'Cold storage and outdoor cold environments.', 'snowflake', 10),
  ('landscaping_grounds', 'Landscaping & Grounds', 'Landscaping and groundskeeping.', 'tree-deciduous', 11),
  ('painting_finishing', 'Painting & Finishing', 'Painting and surface finishing.', 'paintbrush', 12),
  ('waste_sanitation', 'Waste & Sanitation', 'Waste handling and sanitation.', 'trash-2', 13),
  ('high_volume_disposable', 'High-Volume Disposable Tasks', 'High-volume single-use glove tasks.', 'layers', 14)
ON CONFLICT (key) DO NOTHING;

-- Seed: risk profiles
INSERT INTO glove_risk_profiles (key, label, description, weights) VALUES
  ('cuts_abrasion_low', 'Cuts/Abrasion Low', 'Light cut or abrasion risk.', '{"protection": 0.3, "dexterity": 0.5, "durability": 0.4}'::jsonb),
  ('cuts_abrasion_med', 'Cuts/Abrasion Medium', 'Moderate cut or abrasion risk.', '{"protection": 0.5, "dexterity": 0.4, "durability": 0.5}'::jsonb),
  ('cuts_abrasion_high', 'Cuts/Abrasion High', 'High cut or abrasion risk.', '{"protection": 0.7, "dexterity": 0.3, "durability": 0.6}'::jsonb),
  ('chemicals_disinfectants_low', 'Chemicals/Disinfectants Low', 'Light chemical or disinfectant exposure.', '{"protection": 0.4, "chemical_resistance": 0.3}'::jsonb),
  ('chemicals_disinfectants_med', 'Chemicals/Disinfectants Medium', 'Moderate chemical or disinfectant exposure.', '{"protection": 0.5, "chemical_resistance": 0.5}'::jsonb),
  ('chemicals_disinfectants_high', 'Chemicals/Disinfectants High', 'Heavy chemical or disinfectant exposure.', '{"protection": 0.7, "chemical_resistance": 0.7}'::jsonb),
  ('oils_grease_high', 'Oils/Grease High', 'Oily or greasy environments.', '{"protection": 0.4, "grip_oily": 0.6}'::jsonb),
  ('biohazard_med', 'Biohazard Medium', 'Biological hazard exposure.', '{"protection": 0.6, "barrier": 0.6}'::jsonb),
  ('food_contact_low', 'Food Contact', 'Direct or indirect food contact.', '{"food_safe": 1, "dexterity": 0.4}'::jsonb),
  ('cold_exposure_med', 'Cold Exposure Medium', 'Moderate cold exposure.', '{"cold": 0.4}'::jsonb),
  ('cold_exposure_high', 'Cold Exposure High', 'Severe cold or freezer work.', '{"cold": 0.7, "waterproof": 0.3}'::jsonb),
  ('dexterity_high', 'Dexterity / Fine Work', 'Fine motor tasks required.', '{"dexterity": 0.8, "protection": 0.2}'::jsonb),
  ('impact_med', 'Impact Medium', 'Moderate impact risk.', '{"protection": 0.5, "impact": 0.5}'::jsonb),
  ('impact_high', 'Impact High', 'High impact risk.', '{"protection": 0.7, "impact": 0.7}'::jsonb),
  ('heat_med', 'Heat Medium', 'Moderate heat exposure.', '{"heat": 0.4}'::jsonb),
  ('heat_high', 'Heat High', 'High heat exposure.', '{"heat": 0.7}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Seed: use_case -> risk mapping (use_case_id, risk_profile_id, severity)
-- Resolve IDs by key (run after use_cases and risk_profiles exist)
DO $$
DECLARE
  uc_cleaning uuid; uc_food uuid; uc_patient uuid; uc_construction uuid;
  uc_plumbing uuid; uc_electrical uuid; uc_auto uuid; uc_warehouse uuid;
  uc_chemical uuid; uc_cold uuid; uc_landscape uuid; uc_painting uuid;
  uc_waste uuid; uc_highvol uuid;
  r_chem_med uuid; r_chem_high uuid; r_chem_low uuid; r_bio uuid; r_food uuid;
  r_cuts_high uuid; r_cuts_med uuid; r_cuts_low uuid; r_oils uuid;
  r_dex uuid; r_impact_med uuid; r_impact_high uuid; r_cold_high uuid; r_cold_med uuid;
  r_heat_med uuid; r_heat_high uuid;
BEGIN
  SELECT id INTO uc_cleaning FROM glove_use_cases WHERE key = 'cleaning_disinfecting';
  SELECT id INTO uc_food FROM glove_use_cases WHERE key = 'food_preparation';
  SELECT id INTO uc_patient FROM glove_use_cases WHERE key = 'patient_care_exams';
  SELECT id INTO uc_construction FROM glove_use_cases WHERE key = 'construction_work';
  SELECT id INTO uc_plumbing FROM glove_use_cases WHERE key = 'plumbing_mechanical';
  SELECT id INTO uc_electrical FROM glove_use_cases WHERE key = 'electrical_work';
  SELECT id INTO uc_auto FROM glove_use_cases WHERE key = 'automotive_repair';
  SELECT id INTO uc_warehouse FROM glove_use_cases WHERE key = 'warehouse_distribution';
  SELECT id INTO uc_chemical FROM glove_use_cases WHERE key = 'chemical_handling';
  SELECT id INTO uc_cold FROM glove_use_cases WHERE key = 'cold_weather_work';
  SELECT id INTO uc_landscape FROM glove_use_cases WHERE key = 'landscaping_grounds';
  SELECT id INTO uc_painting FROM glove_use_cases WHERE key = 'painting_finishing';
  SELECT id INTO uc_waste FROM glove_use_cases WHERE key = 'waste_sanitation';
  SELECT id INTO uc_highvol FROM glove_use_cases WHERE key = 'high_volume_disposable';

  SELECT id INTO r_chem_med FROM glove_risk_profiles WHERE key = 'chemicals_disinfectants_med';
  SELECT id INTO r_chem_high FROM glove_risk_profiles WHERE key = 'chemicals_disinfectants_high';
  SELECT id INTO r_chem_low FROM glove_risk_profiles WHERE key = 'chemicals_disinfectants_low';
  SELECT id INTO r_bio FROM glove_risk_profiles WHERE key = 'biohazard_med';
  SELECT id INTO r_food FROM glove_risk_profiles WHERE key = 'food_contact_low';
  SELECT id INTO r_cuts_high FROM glove_risk_profiles WHERE key = 'cuts_abrasion_high';
  SELECT id INTO r_cuts_med FROM glove_risk_profiles WHERE key = 'cuts_abrasion_med';
  SELECT id INTO r_cuts_low FROM glove_risk_profiles WHERE key = 'cuts_abrasion_low';
  SELECT id INTO r_oils FROM glove_risk_profiles WHERE key = 'oils_grease_high';
  SELECT id INTO r_dex FROM glove_risk_profiles WHERE key = 'dexterity_high';
  SELECT id INTO r_impact_med FROM glove_risk_profiles WHERE key = 'impact_med';
  SELECT id INTO r_impact_high FROM glove_risk_profiles WHERE key = 'impact_high';
  SELECT id INTO r_cold_high FROM glove_risk_profiles WHERE key = 'cold_exposure_high';
  SELECT id INTO r_cold_med FROM glove_risk_profiles WHERE key = 'cold_exposure_med';
  SELECT id INTO r_heat_med FROM glove_risk_profiles WHERE key = 'heat_med';
  SELECT id INTO r_heat_high FROM glove_risk_profiles WHERE key = 'heat_high';

  INSERT INTO glove_use_case_risks (use_case_id, risk_profile_id, severity) VALUES
    (uc_cleaning, r_chem_med, 3), (uc_cleaning, r_bio, 2),
    (uc_food, r_food, 3), (uc_food, r_dex, 2),
    (uc_patient, r_bio, 3), (uc_patient, r_dex, 2),
    (uc_construction, r_cuts_high, 3), (uc_construction, r_impact_med, 2),
    (uc_plumbing, r_oils, 2), (uc_plumbing, r_chem_low, 1), (uc_plumbing, r_cuts_med, 2),
    (uc_electrical, r_dex, 3), (uc_electrical, r_cuts_med, 2),
    (uc_auto, r_oils, 3), (uc_auto, r_chem_low, 1), (uc_auto, r_cuts_med, 2),
    (uc_warehouse, r_cuts_med, 2), (uc_warehouse, r_impact_med, 1),
    (uc_chemical, r_chem_high, 3), (uc_chemical, r_dex, 1),
    (uc_cold, r_cold_high, 3), (uc_cold, r_cold_med, 2),
    (uc_landscape, r_cuts_med, 2), (uc_landscape, r_cold_med, 1),
    (uc_painting, r_chem_med, 2), (uc_painting, r_dex, 2),
    (uc_waste, r_bio, 3), (uc_waste, r_chem_med, 2),
    (uc_highvol, r_dex, 2)
  ON CONFLICT (use_case_id, risk_profile_id) DO UPDATE SET severity = EXCLUDED.severity;
END $$;

-- Seed: sample glove_products (optional; add more via Supabase dashboard or API)
INSERT INTO glove_products (
  sku, name, description, glove_type, material, thickness_mil, cut_level, impact_rating,
  chemical_resistance, food_safe, medical_grade, powder_free, durability_score, dexterity_score, protection_score, price_cents, active
) VALUES
  ('NIT-5-100', 'Nitrile Exam Gloves 5mil Box 100', 'Powder-free nitrile, 5 mil, textured grip.', 'disposable', 'nitrile', 5, null, false, '{"disinfectants":"med"}'::jsonb, true, true, true, 40, 85, 60, 1899, true),
  ('NIT-8-100', 'Nitrile Chemical-Resist 8mil Box 100', 'Heavy-duty nitrile, 8 mil, extended cuff.', 'disposable', 'nitrile', 8, null, false, '{"disinfectants":"high","acids":"med"}'::jsonb, false, false, true, 55, 70, 75, 3499, true),
  ('CUT-A5-PAIR', 'Cut-Resistant Glove A5 Pair', 'HPPE cut-resistant, ANSI A5, machine washable.', 'reusable', 'hppe', null, 'A5', true, '{}'::jsonb, false, false, true, 80, 60, 85, 2499, true),
  ('VIN-3-100', 'Vinyl Gloves 3mil Box 100', 'Economy vinyl, food-safe, powder-free.', 'disposable', 'vinyl', 3, null, false, '{}'::jsonb, true, false, true, 25, 90, 35, 899, true),
  ('LEATHER-M', 'Leather Work Gloves Medium', 'Driving leather, palm coating, abrasion resistant.', 'reusable', 'leather', null, null, false, '{}'::jsonb, false, false, true, 75, 50, 65, 1599, true)
ON CONFLICT (sku) DO NOTHING;

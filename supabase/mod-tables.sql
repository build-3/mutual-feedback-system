-- Run this once in the Supabase SQL editor for the homeland/feedback-app
-- project (ref jduvfznwahcupuxtywkl) to create the tables backing /mod.
-- Idempotent: safe to re-run. Mirrors the block in schema.sql.

CREATE TABLE IF NOT EXISTS mod_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department TEXT NOT NULL,
  employee_name TEXT,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  period TEXT,
  topic TEXT,
  review TEXT,
  severity NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mod_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mod_reviews_department ON mod_reviews(department);
CREATE INDEX IF NOT EXISTS idx_mod_reviews_severity ON mod_reviews(severity);

CREATE TABLE IF NOT EXISTS mod_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_name TEXT,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  policy_clarity TEXT,
  tools_resources TEXT,
  trust_battery NUMERIC,
  trust_battery_details TEXT,
  nps_score NUMERIC,
  comments TEXT,
  source_row INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mod_responses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mod_responses_name ON mod_responses(employee_name);

-- ────────────────────────────────────────────────────────────────────
-- Probation alerts and joining dates.
--
-- 1. sponsor_alerts: one row per feedback submission that has been escalated to
--    the candidate's sponsor. The unique index IS the "never twice" guarantee;
--    the app inserts the row before sending and deletes it if the send fails.
--
-- 2. probation_date_changes: an audit trail for every hand-corrected joining
--    date, so a date is never overwritten silently. Who, when, from what, to
--    what, and where the new value came from.
--
-- 3. sponsor_alerts_enabled: OFF. Sponsor alerts reach people unprompted and the
--    definition of "negative" is a starting line, not yet a decision. Flip it to
--    'true' after previewing with /api/cron/notify-retry?dry=true.
--
-- Apply once in the Supabase SQL editor. Safe to re-run.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sponsor_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  -- NULL when there was no sponsor on record and the reviewers were told instead.
  sponsor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'no_sponsor')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sponsor_alerts_submission
  ON sponsor_alerts(submission_id);

ALTER TABLE sponsor_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS probation_date_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  probation_id UUID NOT NULL REFERENCES probation_tracking(id) ON DELETE CASCADE,
  old_start_date DATE NOT NULL,
  new_start_date DATE NOT NULL,
  old_end_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  -- Free text naming where the new date came from: "admin", "backfill: <file>".
  source TEXT NOT NULL,
  changed_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_probation_date_changes_probation
  ON probation_date_changes(probation_id, created_at DESC);

ALTER TABLE probation_date_changes ENABLE ROW LEVEL SECURITY;

INSERT INTO site_settings (key, value)
VALUES ('sponsor_alerts_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

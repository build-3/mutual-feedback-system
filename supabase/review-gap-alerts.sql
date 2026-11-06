-- ────────────────────────────────────────────────────────────────────
-- "Too few reviews" alert log.
--
-- One row per probation per day an alert was sent. The unique index stops a
-- double run on the same day from messaging twice; the app also skips anyone
-- alerted within the last 7 days. Uses the same on/off switch as the sponsor
-- alerts (site_settings.sponsor_alerts_enabled), which stays 'false' until
-- someone turns it on.
--
-- Apply once. Safe to re-run.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_gap_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  probation_id UUID NOT NULL REFERENCES probation_tracking(id) ON DELETE CASCADE,
  sent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  full_time_reviewers INTEGER NOT NULL,
  -- NULL when there was no sponsor and the reviewers were told instead.
  sponsor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_gap_alerts_probation_day
  ON review_gap_alerts(probation_id, sent_on);

ALTER TABLE review_gap_alerts ENABLE ROW LEVEL SECURITY;

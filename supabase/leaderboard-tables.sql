-- ────────────────────────────────────────────────────────────────────
-- Feedback leaderboard.
--
-- The board itself needs no tables: it is computed from feedback_submissions,
-- feedback_answers and employees over a cycle window. Only the nudge needs
-- state, and only to keep its promise of at most one message per person per
-- cycle. See docs/LEADERBOARD-SPEC.md.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leaderboard_nudges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_key DATE NOT NULL,
  -- RESTRICT like every other employee FK here: the roster is soft-deleted via
  -- is_active, never row-deleted.
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- The guarantee itself, not just the lookup: one nudge per person per cycle
-- even if the cron runs twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_nudges_cycle_employee
  ON leaderboard_nudges(cycle_key, employee_id);

ALTER TABLE leaderboard_nudges ENABLE ROW LEVEL SECURITY;

-- Off by default. The nudge is the only part of this feature that reaches
-- people unprompted, so it stays behind an explicit switch rather than being
-- turned on by registering a schedule.
INSERT INTO site_settings (key, value)
VALUES ('leaderboard_nudge_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

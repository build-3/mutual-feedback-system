-- ────────────────────────────────────────────────────────────────────
-- Pulse: the recurring pass that turns collected feedback into buckets,
-- a leadership report, and a drafted note per person.
--
-- See docs/PULSE-SPEC.md. Three tables plus two site_settings rows.
--
-- Nothing here is computed at read time. Each run stores the config it ran
-- under and the per-component breakdown behind every score, so a bucket that
-- gets questioned months later can be replayed exactly — without that, moving
-- a weight silently rewrites the history of every past run.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pulse_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- The 2nd-Tuesday key of the cycle being REPORTED (the one that closed),
  -- not the day the run happened. Shares a key space with
  -- feedback_sessions.session_date and cycles.ts CycleKey.
  cycle_key DATE NOT NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  config JSONB NOT NULL,
  report_sent_at TIMESTAMPTZ,
  report_recipients TEXT[],
  status TEXT NOT NULL DEFAULT 'built'
    CHECK (status IN ('built', 'reported', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One run per cycle. Re-hitting the cron on the same day must reuse the run
-- rather than produce a second report and a second set of draft notes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pulse_runs_cycle ON pulse_runs(cycle_key);

ALTER TABLE pulse_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pulse_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES pulse_runs(id) ON DELETE CASCADE,
  -- RESTRICT, matching every other employee FK here: the roster is soft-deleted
  -- via is_active, never row-deleted, so a cascade would be a silent history loss.
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  cohort TEXT NOT NULL CHECK (cohort IN ('full_timer', 'probation')),
  bucket TEXT NOT NULL CHECK (bucket IN (
    'doing_well', 'on_the_fence', 'needs_conversation', 'not_enough_signal'
  )),
  -- NULL when the person had no usable reviews in the window.
  composite NUMERIC,
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_count INTEGER NOT NULL DEFAULT 0,
  -- review_count counts submissions. Over a multi-cycle window one reviewer can
  -- file several, so the bucket gate and the coverage denominator both count
  -- PEOPLE instead: three reviews from one teammate is one opinion.
  distinct_reviewers INTEGER NOT NULL DEFAULT 0,
  review_scores INTEGER[] NOT NULL DEFAULT '{}',
  -- The worst single review. A healthy mean hides it completely, and someone
  -- with eighteen reviews can carry one at 36 and still sit in 'doing_well'.
  lowest_review INTEGER,
  coverage_expected INTEGER NOT NULL DEFAULT 0,
  coverage_received INTEGER NOT NULL DEFAULT 0,
  self_review_filed BOOLEAN NOT NULL DEFAULT false,
  probation_end_date DATE,
  probation_overdue BOOLEAN NOT NULL DEFAULT false,
  -- Carried forward from the previous run so movement survives a config change.
  prev_composite NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pulse_scores_run_employee
  ON pulse_scores(run_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_pulse_scores_employee ON pulse_scores(employee_id);
CREATE INDEX IF NOT EXISTS idx_pulse_scores_bucket ON pulse_scores(run_id, bucket);

ALTER TABLE pulse_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS pulse_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES pulse_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  bucket TEXT NOT NULL,
  draft_text TEXT NOT NULL,
  -- What the approver actually sent, when they changed it. NULL means the
  -- draft went out unedited.
  edited_text TEXT,
  source TEXT NOT NULL DEFAULT 'template' CHECK (source IN ('llm', 'template')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'skipped', 'failed')),
  approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pulse_notes_run_employee
  ON pulse_notes(run_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_pulse_notes_status ON pulse_notes(run_id, status);

ALTER TABLE pulse_notes ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────
-- Config lives in site_settings, the same key/value table the Google Chat
-- kill switch uses.
--
-- pulse_recipients is seeded EMPTY on purpose. A report naming people's
-- performance should fail closed: it goes nowhere until someone sets the list
-- in the admin UI, unlike the notification switch beside it which fails open.
-- ────────────────────────────────────────────────────────────────────

INSERT INTO site_settings (key, value)
VALUES ('pulse_recipients', '[]')
ON CONFLICT (key) DO NOTHING;

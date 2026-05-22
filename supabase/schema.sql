-- build3 Feedback Management System Schema

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('intern', 'full_timer', 'admin')),
  email TEXT,
  birthday TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  buddy_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  sponsor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_buddy_sponsor_different
    CHECK (buddy_id IS NULL OR sponsor_id IS NULL OR buddy_id <> sponsor_id)
);

CREATE UNIQUE INDEX idx_employees_name_unique
  ON employees (LOWER(BTRIM(name)));

-- Feedback submissions table
CREATE TABLE feedback_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submitted_by_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  feedback_for_id UUID REFERENCES employees(id) ON DELETE RESTRICT,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('intern', 'build3', 'full_timer', 'self', 'adhoc')),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback answers table
CREATE TABLE feedback_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback responses table (threaded replies on text answers)
CREATE TABLE feedback_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  answer_id UUID NOT NULL REFERENCES feedback_answers(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  response_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lock tables down by default. The Next.js server uses the service role key
-- for all reads and writes, so anon/authenticated clients should not have
-- direct table access.
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_responses ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_feedback_submissions_submitted_by ON feedback_submissions(submitted_by_id);
CREATE INDEX idx_feedback_submissions_feedback_for ON feedback_submissions(feedback_for_id);
CREATE INDEX idx_feedback_submissions_type ON feedback_submissions(feedback_type);
CREATE INDEX idx_feedback_answers_submission ON feedback_answers(submission_id);
CREATE INDEX idx_feedback_submissions_type_for ON feedback_submissions(feedback_type, feedback_for_id, created_at);
CREATE INDEX idx_feedback_responses_answer ON feedback_responses(answer_id);
CREATE INDEX idx_feedback_responses_responder ON feedback_responses(responder_id);

-- Feedback sessions (one row per 2nd-Tuesday session)
CREATE TABLE feedback_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feedback_sessions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_session_date ON feedback_sessions(session_date);
CREATE INDEX idx_session_status ON feedback_sessions(status);

-- Session assignments (who should submit feedback for whom)
CREATE TABLE session_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES feedback_sessions(id) ON DELETE CASCADE,
  intern_id UUID NOT NULL REFERENCES employees(id),
  reviewer_id UUID NOT NULL REFERENCES employees(id),
  submission_id UUID REFERENCES feedback_submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE session_assignments ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_assignment_unique ON session_assignments(session_id, intern_id, reviewer_id);
CREATE INDEX idx_session_assignments_session ON session_assignments(session_id);

-- Probation tracking table
CREATE TABLE probation_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_months INTEGER NOT NULL DEFAULT 3 CHECK (duration_months IN (3, 6)),
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'extended', 'promoted')),
  extended_at TIMESTAMPTZ,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE probation_tracking ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_probation_employee ON probation_tracking(employee_id);
CREATE INDEX idx_probation_status ON probation_tracking(status);
CREATE INDEX idx_probation_end_date ON probation_tracking(end_date);
CREATE UNIQUE INDEX idx_probation_active_per_employee
  ON probation_tracking(employee_id) WHERE status IN ('active', 'extended');

-- Probation reviews (reviewer feedback on interns)
CREATE TABLE probation_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  probation_id UUID NOT NULL REFERENCES probation_tracking(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contribution_level TEXT NOT NULL
    CHECK (contribution_level IN ('independent_contributor', 'leader')),
  backing_score INTEGER NOT NULL CHECK (backing_score >= 1 AND backing_score <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(probation_id, reviewer_id)
);

ALTER TABLE probation_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_probation_reviews_probation ON probation_reviews(probation_id);

-- Probation reviewer group (who gets notified about new probations)
CREATE TABLE probation_reviewers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE probation_reviewers ENABLE ROW LEVEL SECURITY;
INSERT INTO probation_reviewers (email) VALUES ('at@build3.org');

-- ────────────────────────────────────────────────────────────────────
-- Kudos: peer recognition posted to a Google Chat space, with persistence
-- so we can show a leaderboard and "X others have also given kudos" footer.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE kudos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  gif_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;

CREATE TABLE kudos_recipients (
  kudos_id UUID NOT NULL REFERENCES kudos(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  PRIMARY KEY (kudos_id, recipient_id)
);

ALTER TABLE kudos_recipients ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_kudos_sender ON kudos(sender_id);
CREATE INDEX idx_kudos_created_at ON kudos(created_at DESC);
CREATE INDEX idx_kudos_recipients_recipient ON kudos_recipients(recipient_id);

-- One-click "Kudos ++" boosts from teammates clicking the button on a kudos
-- card in Google Chat. Stored separately from the originating kudos so
-- duplicate-boost from the same person is enforced via PK (kudos_id,
-- booster_email).
CREATE TABLE kudos_boosts (
  kudos_id UUID NOT NULL REFERENCES kudos(id) ON DELETE CASCADE,
  booster_email TEXT NOT NULL,
  booster_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (kudos_id, booster_email)
);

ALTER TABLE kudos_boosts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_kudos_boosts_kudos ON kudos_boosts(kudos_id);
CREATE INDEX idx_kudos_boosts_booster ON kudos_boosts(booster_email);

-- Birthday notification log (for idempotency + admin visibility)
CREATE TABLE birthday_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('monthly_roundup', 'eve_reminder', 'day_of')),
  target_month TEXT,
  employee_ids UUID[] NOT NULL DEFAULT '{}',
  employee_names TEXT[] NOT NULL DEFAULT '{}',
  chat_message_name TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE birthday_notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_birthday_notifications_type ON birthday_notifications(notification_type);
CREATE INDEX idx_birthday_notifications_sent_at ON birthday_notifications(sent_at DESC);

-- Seed data: Full timers
INSERT INTO employees (name, role, email) VALUES
  ('Varun Chawla', 'full_timer', 'varun@build3.org'),
  ('Charlez Kurian John', 'full_timer', 'charlez@build3.org'),
  ('Girish Sampath', 'full_timer', 'girish@build3.org'),
  ('Ashwini Kaskar', 'full_timer', 'ashwini@build3.org'),
  ('Umair Tariq', 'full_timer', 'umair@build3.org'),
  ('Allya Srivastava', 'full_timer', 'allya@build3.org'),
  ('Omprakash Muddaiah', 'full_timer', 'omprakash@build3.org'),
  ('Aniket Kislay', 'full_timer', 'aniket@build3.org'),
  ('Shyamal Majumdar', 'full_timer', 'shyamal@build3.org'),
  ('Kaustubh Mankar', 'full_timer', 'kaustubh@build3.org'),
  ('Arjun', 'full_timer', 'at@build3.org'),
  ('Vijay Relwani', 'full_timer', 'vijay@build3.org'),
  ('Sanya', 'full_timer', 'investors@build3.org');

-- Seed data: Interns
INSERT INTO employees (name, role, email) VALUES
  ('Prajwal', 'intern', 'prajwal@build3.org'),
  ('Nadim G', 'intern', 'nadim@build3.org'),
  ('Neha', 'intern', 'neha@build3.org'),
  ('Sarthak', 'intern', 'sarthak@build3.org'),
  ('Naman', 'intern', 'naman@build3.org');

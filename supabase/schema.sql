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
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  join_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  probation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (probation_status IN ('active', 'extended', 'completed', 'concluded')),
  probation_end_date TIMESTAMPTZ NOT NULL,
  extended_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,
  decision_note TEXT,
  rules_last_sent_at TIMESTAMPTZ,
  ceo_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE probation_tracking ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_probation_employee ON probation_tracking(employee_id);
CREATE INDEX idx_probation_status ON probation_tracking(probation_status);
CREATE INDEX idx_probation_end_date ON probation_tracking(probation_end_date);
CREATE UNIQUE INDEX idx_probation_active_per_employee
  ON probation_tracking(employee_id) WHERE probation_status IN ('active', 'extended');

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

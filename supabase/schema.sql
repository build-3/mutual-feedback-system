-- build3 Feedback Management System Schema

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('intern', 'full_timer', 'admin')),
  email TEXT,
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

-- Seed data: Full timers
INSERT INTO employees (name, role, email) VALUES
  ('Varun Chawla', 'full_timer', 'vc@build3.org'),
  ('Charlez Kurian John', 'full_timer', 'ckj@build3.org'),
  ('Girish Sampath', 'full_timer', 'gs@build3.org'),
  ('Ashwini Kaskar', 'full_timer', 'ak1@build3.org'),
  ('Umair Tariq', 'full_timer', 'ut@build3.org'),
  ('Allya Srivastava', 'full_timer', 'as@build3.org'),
  ('Omprakash Muddaiah', 'full_timer', 'om@build3.org'),
  ('Aniket Kislay', 'full_timer', 'ak@build3.org'),
  ('Shyamal Majumdar', 'full_timer', 'sm@build3.org'),
  ('Kaustubh Mankar', 'full_timer', 'km@build3.org'),
  ('Arjun T', 'full_timer', 'at@build3.org'),
  ('Vijay Relwani', 'full_timer', 'vr@build3.org'),
  ('Sanya Kalani', 'full_timer', 'sk@build3.org');

-- Seed data: Interns
INSERT INTO employees (name, role, email) VALUES
  ('Nadim G', 'intern', 'ng@build3.org'),
  ('Neha Bansil', 'intern', 'nb@build3.org'),
  ('Sarthak Agarwal', 'intern', 'sa@build3.org'),
  ('Naman Pandey', 'intern', 'np@build3.org');

-- New recruits (not in original seed — added from Google Workspace roster)
INSERT INTO employees (name, role, email) VALUES
  ('Anand Johnson', 'intern', 'ajj@build3.org'),
  ('Anurag Gupta', 'intern', 'ag@build3.org'),
  ('Arvind Gaurishankar', 'intern', 'i4x@build3.org'),
  ('Ashish Airon', 'intern', 'aa@build3.org'),
  ('Astha Goyal', 'intern', 'astha@build3.org'),
  ('Bikram Jha', 'intern', 'bj@build3.org'),
  ('Devi Sree KS', 'intern', 'dk@build3.org'),
  ('Karan Murada', 'intern', 'murada@build3.org'),
  ('Manya Tuli', 'intern', 'mt@build3.org'),
  ('Mohan Kamath', 'intern', 'mk@build3.org'),
  ('Prajakta Ughade', 'intern', 'pu@build3.org'),
  ('Pranav Khanna', 'intern', 'pk@build3.org'),
  ('Ronak Vora', 'intern', 'rv@build3.org'),
  ('Shubhaam Chandak', 'intern', 'sh@build3.org');

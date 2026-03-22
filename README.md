# build3 Feedback Management System

A full-stack feedback management system built with Next.js 14, Supabase, and Tailwind CSS.

## Features

- **Typeform-style Feedback Form** — One question at a time with smooth animations, progress bar, and keyboard support
- **4 Feedback Paths**: Intern feedback, build3 feedback, Full Timer feedback, Self feedback
- **Responses Viewer** — Browse feedback by employee with searchable sidebar and admin view
- **Employee Management** — Add/remove employees with role assignments

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Backend/DB**: Supabase (Postgres)
- **Language**: TypeScript

## Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project.

### 2. Run the schema

Copy the contents of `supabase/schema.sql` and run it in the Supabase SQL Editor. This creates the tables and seeds employee data.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the server-side credentials:

```bash
cp .env.example .env.local
```

Required values:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_BASIC_AUTH_USER=admin
APP_BASIC_AUTH_PASSWORD=replace-me
```

Optional Google Chat notification values:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CHAT_SENDER_EMAIL=foundation@example.org
```

Keep `.env.local` out of version control. If any real keys were previously committed or shared, rotate them before deploying.

### 4. Install dependencies and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Pages

| Route | Description |
|-------|-------------|
| `/feedback` | Typeform-style feedback form |
| `/insights` | Team view — org overview and per-employee insights (basic-auth protected) |
| `/employees` | Manage employees (add/delete, basic-auth protected) |
| `/responses` | Redirects to `/insights` |

## Database Schema

- **employees** — id, name, role (intern/full_timer/admin), created_at
- **feedback_submissions** — id, submitted_by_id, feedback_for_id, feedback_type, created_at
- **feedback_answers** — id, submission_id, question_key, question_text, answer_value, created_at

## Security Notes

- Privileged reads and writes now go through server routes backed by the Supabase service role key.
- `/employees`, `/insights`, `/responses`, and admin APIs are protected with HTTP basic auth using `APP_BASIC_AUTH_USER` and `APP_BASIC_AUTH_PASSWORD`.
- Public feedback submission and employee lookup use constrained server endpoints instead of exposing direct browser access to Supabase.
- The bootstrap schema enables row level security so direct anon access is denied by default.

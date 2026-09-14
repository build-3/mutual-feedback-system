# build3 Pulse — engineering spec

**Status:** built (phases 1-4 shipped; schedule not yet registered) · **Owner:** Arjun · **Reviewers:** Bhavesh, engineering
**Target:** `mutualfeedback.build3.online` (this repo)

---

## 1. Problem

The feedback system collects reliably and concludes nothing.

Every cycle the platform gathers trust-battery scores, teal principle ratings, purpose alignment, contribution levels, and written feedback across every full-timer and every teammate in their probation period. All of it lands in `feedback_answers` and is visible on `/insights` and `/admin`. None of it produces a statement, a decision, or a message to anyone.

The consequence is that acting on the data requires someone to remember to look, know what to look for, and reach a judgement unaided. In practice that does not happen between sessions, so the data accumulates without changing anything.

**What's missing is the judgement layer**: a recurring, automatic pass that reads the collected data, sorts people into a small number of actionable groups, tells leadership who needs attention, and tells each person where they stand and what to do about it.

---

## 2. Goals

- **G1** Every cycle, automatically classify every active full-timer and every teammate in their probation period into one of three states: *doing well*, *on the fence*, *needs a conversation*.
- **G2** Deliver that classification to Arjun and Bhavesh as a report they receive, not a page they must remember to visit.
- **G3** Give each person a note telling them where they stand and, where relevant, one concrete thing to do before the next session.
- **G4** Make the classification explainable and tunable — anyone should be able to see why a person landed where they did, and adjust the thresholds without a code change.
- **G5** Keep a human between the system's judgement and the employee's inbox.

### Non-goals

- Replacing the feedback session itself, or the conversation that follows a red flag. The report is the trigger for that conversation, not a substitute.
- Automating promotion, extension, or probation decisions. Those flows already exist in `src/lib/server/probation.ts` and are untouched.
- Performance ratings, compensation input, or anything that persists as a formal record against a person.
- Email. The platform has no mail transport and this spec does not add one; delivery is Google Chat.

### Terminology

Teammates in their probation period are referred to as **"on probation"** or **"in their probation period"** in all user-facing copy — reports, notes, and admin UI. The database `employees.role` value remains `'intern'` because of the schema `CHECK` constraint, but no rendered string uses that word. This includes relabelling the existing role toggle in `RiskScan.tsx`, which currently reads "intern".

---

## 3. Requirements

| # | Requirement |
| --- | --- |
| R1 | Three buckets: doing well, on the fence, needs a conversation. |
| R2 | Covers both cohorts: full-timers and teammates on probation. |
| R3 | Runs automatically every cycle. No manual trigger required for the report. |
| R4 | The report reaches Arjun and Bhavesh by personal Google Chat DM. |
| R5 | All three buckets produce a note to the individual — including *doing well*, which is recognition and carries no ask. |
| R6 | The *needs a conversation* note is a heads-up, not a verdict; the substance is the conversation with Arjun or Bhavesh that follows. |
| R7 | Notes are actionable: a concrete next step, e.g. "collect two more pieces of feedback before the next session". |
| R8 | No note reaches an employee without a human reviewing and approving it. |
| R9 | Thresholds, weights, and recipients are editable in the admin UI, not hardcoded. |
| R10 | Notes must not identify individual reviewers. |

### Added during implementation

| # | Requirement | Why |
| --- | --- | --- |
| R11 | Non-person accounts on the roster are never scored or notified. | The studio's own Chat sender sits on `employees` as an `intern` with an active probation record, and was being bucketed. |
| R12 | The report flags probations whose end date has passed while the record is still open. | The first real run surfaced ten, some three months over — a decision nobody made, invisible everywhere else in the product. |
| R13 | Bulk send takes two clicks and states that it cannot be undone. | During testing a single stray click on the bulk button sent a real note. A send is irreversible and the button sits directly above the rows it fires for. |

---

## 4. Design overview

```
day after each 2nd Tuesday, 09:00 IST
  │
  ├─ score every active full-timer and probation teammate over a rolling window
  ├─ sort into 4 buckets (the 3 above, plus "not enough signal")
  ├─ persist the run  →  pulse_runs / pulse_scores
  ├─ draft one note per person  →  pulse_notes (status: draft)
  │
  ├─ AUTOMATIC: DM the report to the configured recipients, with a link to the run
  │
  └─ HUMAN: open /admin?tab=pulse&run=<id>
       ├─ review each bucket — scores, components, review counts, movement
       ├─ read and edit each draft note
       └─ Send / Skip per person, or "send all" within a bucket
             └─ DMs go out · pulse_notes → sent
```

The report is what makes a human open the page. The page is where anything reaches an employee. Those are deliberately two separate steps (R8).

### Cadence

The run fires the **day after** each session (the 2nd Tuesday), and reports on the **cycle that just closed**.

`src/lib/cycles.ts` defines a cycle as `[2nd Tuesday of month M, 2nd Tuesday of month M+1)` in IST — a cycle opens on its session and fills up over the following month. Running the day after a session therefore reports on a window that is complete and settled, and lands the "collect two more pieces of feedback" nudges at the *start* of the new cycle, when there is a full month left to act on them.

---

## 5. Scoring model

### 5.1 Inputs

All inputs already exist. From `feedback_answers` joined to `feedback_submissions` where `feedback_type IN ('intern','full_timer')` and `feedback_for_id` is the subject:

| `question_key` | Raw scale | Normalised to 0–100 |
| --- | --- | --- |
| `trust_battery` | 0–100 slider | as-is |
| `teal_self_management`, `teal_wholeness`, `teal_evolutionary_purpose` | 1–5 each | mean of the three, then `(m − 1) / 4 × 100` |
| `purpose_alignment` | 1–5 stars | `(v − 1) / 4 × 100` |
| `contribution_level` | A/B/C/D | `(n − 1) / 3 × 100`, via the existing `contributionToNumber()` |
| `recommend_rating` | 1–5 | `(v − 1) / 4 × 100` — probation lane only |

Plus `probation_reviews.backing_score` (1–5) where a probation record exists. It takes precedence over `recommend_rating` when both are present, being the more deliberate signal.

### 5.2 Weights

Defaults, all stored in config and tunable:

```
trust_battery        0.35
teal average         0.25
contribution_level   0.20
purpose_alignment    0.10
backing / recommend  0.10    (probation cohort only)
```

`trust_battery` carries the largest weight because it is the one signal the form already treats as load-bearing: `TRUST_DETAIL_REQUIRED_BELOW = 85` makes a written explanation mandatory below 85, so a low trust score always arrives with stated reasons attached.

**Missing components renormalise, they do not score zero.** Full-timers have no backing component, so the remaining four weights renormalise to sum to 1 (0.389 / 0.278 / 0.222 / 0.111). The same rule applies to any component absent from a given submission — treating a skipped question as a zero would punish an incomplete form rather than measure the person.

### 5.3 Aggregation

Score each **submission** first, then average across submissions in the window, weighting each reviewer equally.

Carry `count`, `min`, and `max` alongside the mean. The report prints the individual review scores (`3 reviews: 82, 79, 41`) rather than the mean alone, so a single outlier review is visible as disagreement between reviewers instead of being silently averaged into a middling number.

De-duplicate to the latest submission per `(reviewer, subject, cycle)` before aggregating. `submitFeedback()` has no period check (documented in `period-gate.ts`), so a double POST can otherwise count one reviewer twice.

### 5.4 Window

A rolling **3 closed cycles** (config `window_cycles`, default 3), ending at the cycle that closed on the session just past.

A single cycle is too thin to bucket on. With roughly twelve full-timers and five teammates on probation, not everyone receives a review every month, so single-cycle buckets would flip on the arrival or absence of one submission. Three cycles gives a stable read while still moving within a quarter.

Movement is reported separately: each run stores its composite scores, and the next run reports the delta against them (`↑4`, `↓7`, `→`, or `new to this bucket`).

### 5.5 Calibration

| Profile | Composite | Bucket |
| --- | --- | --- |
| trust 85, teal 4.0, contribution C, purpose 4 | 77 | doing well |
| trust 72, teal 3.3, contribution C, purpose 3.5 | 66 | on the fence |
| trust 55, teal 2.5, contribution B, purpose 3 | 45 | needs a conversation |

These defaults are a starting calibration, not a finding. §11 covers tuning them against real data before anything sends.

---

## 6. Buckets and gates

### 6.1 Cut lines

Two cut lines, held **separately per cohort**:

| Cohort | doing well | on the fence | needs a conversation |
| --- | --- | --- | --- |
| Full-timers | ≥ 70 | 55 – 69 | < 55 |
| On probation | ≥ 65 | 50 – 64 | < 50 |

Separate lines are necessary, not a courtesy. The contribution ladder runs *finding their feet → reliable support → independent contributor → leader*; someone eight weeks into their probation period sitting at "reliable support" is on track, while a full-timer at the same level is not. A single shared line would place most of the probation cohort in the bottom bucket by construction — an artifact of the scale, not a finding about the people.

### 6.2 Gates, applied before bucketing

**Roster gate.** `is_active = true` only. Departed teammates are never scored, never notified, and never counted in anyone's coverage denominator. This matches the `.eq("is_active", true)` correction currently in the working tree for `session-reminder/route.ts` and `session-utils.ts`.

**`min_reviews` gate (default 2).** Fewer reviews than this and the person is held out in a fourth bucket, **not enough signal**, rather than being bucketed on one data point.

This fourth bucket is a feature, not an exception path. It is the clearest actionable output the system produces: it tells leadership exactly who is invisible to the feedback process, and it generates the most concrete possible note — *collect two more pieces of feedback before the next session*. Someone with one review is not doing well or badly; they are unmeasured, and that is the thing to fix.

### 6.3 Excluded entirely

Addresses in `exclude_emails` (default: `foundation@build3.org`) are never scored
and never notified. Scoring a shared or service account produces a meaningless
bucket and, worse, a note addressed to an inbox several people read.

### 6.4 Reported but not scored

Two participation measures appear in the report and inform the notes, but stay out of the composite, because they measure a person's engagement with the process rather than colleagues' assessment of them:

- **Coverage** — reviews received ÷ active reviewers who could have reviewed them.
- **Self-review filed?** — whether they submitted their `self` and `build3` responses this cycle (reuse `submittersInCycle()` from `period-gate.ts`).

---

## 7. The report

Plain-text Google Chat DM, following the formatting convention the existing crons established: `*bold*`, `_italic_`, and **bare URLs only** — `<url|label>` renders literally in a DM rather than as a link.

Full-timers and the probation cohort appear as separate sections when both are non-empty, with each probation teammate's end date shown, since that is the clock leadership is managing against.

The report names names. Leadership is the audience; that is its purpose. The notes in §8 follow the opposite rule.

<details>
<summary>Illustrative output — synthetic data, not real teammates</summary>

```
📊 *build3 pulse — cycle 12 aug – 8 sep*
17 teammates scored · window: last 3 cycles · 41 reviews

*🔴 needs a conversation — 2*
• A. Menon — 48 (was 55, ↓7) · 4 reviews: 61, 52, 44, 35
  weakest: trust battery 51 · contribution: reliable support
  3 of 4 reviewers flagged the same value: Collaboration
• B. Iyer — 44 (new to this bucket) · 2 reviews: 47, 41
  weakest: self-management 2.0/5 · trust battery 49

*🟠 on the fence — 3*
• C. Rao — 62 (was 58, ↑4) · 5 reviews
• D. Bose — 59 (was 64, ↓5) · 3 reviews
• E. Nair — 57 (was 57, →) · 3 reviews   [probation, ends 14 oct]

*🟢 doing well — 9*
F. Shah, G. Pillai, H. Desai, I. Kulkarni, J. Reddy, K. Banerjee,
L. Varma, M. Joshi, N. Gupta

*⚪ not enough signal — 3*
• O. Chandra — 1 review (needs 1 more)
• P. Mehta — 0 reviews in window
• Q. Dutta — 1 review   [probation, ends 2 nov]

5 notes are drafted and waiting for you.
Read, edit, and send them here:
https://mutualfeedback.build3.online/admin?tab=pulse&run=<uuid>
```
</details>

---

## 8. The notes

One note per person, drafted automatically, **reviewed by a human before it sends** (R8).

### 8.1 Drafting

Notes are LLM-drafted with a strict separation of responsibility: **the model decides nothing.** The bucket, the composite, the weakest components, the coverage gap, and the repeated themes are all computed deterministically in `pulse-scoring.ts` first. The model receives that structured result and only turns it into a few sentences in build3's voice.

- Reuses the pattern in `src/app/api/transcribe/route.ts` — raw `fetch` to `api.openai.com`, `AbortController` timeout, no SDK dependency added. `OPENAI_API_KEY` is already configured.
- Output constrained with `response_format: json_schema` to `{ subject, body }`, capped at ~120 words, and validated on receipt.
- **Deterministic template fallback** on any failure — API error, timeout, or schema mismatch. A run never blocks on an external service, and never produces a note the reviewer cannot see.
- Cost is bounded: one short completion per person per cycle, on the order of 17 calls a month.

### 8.2 What each bucket's note says

**🟢 Doing well.** Recognition, and nothing else. Names the specific strongest signal ("your trust battery across four teammates is 91"), reflects back one or two things colleagues actually praised, and makes no ask. This bucket exists because silence is the current default for people doing well, and silence is not neutral.

**🟠 On the fence.** Where they stand and what to work on. States the position qualitatively rather than as a numeric grade, names the one or two weakest components in plain language plus the most-repeated improvement theme, and closes with one concrete thing to do before the next session — including "collect two more pieces of feedback" where coverage is thin.

**🔴 Needs a conversation.** Deliberately **softer than the report**. Says there is a gap, names at most two areas, and says Arjun or Bhavesh will be in touch. It does not itemise and does not argue the case. Its only job is to ensure the person is not blindsided when the conversation happens; the conversation carries the substance (R6).

**⚪ Not enough signal.** No judgement at all. States that there isn't enough feedback to say anything yet, and asks for two more pieces before the next session, with the link.

### 8.3 Reviewer anonymity — enforced in code, not in the prompt

With roughly twelve full-timers, quoting one reviewer's sentence to its subject identifies the reviewer. Four rules, implemented as filters in `pulse-notes.ts` and applied to the model's output as well as its input:

1. Notes never contain reviewer names.
2. A theme reaches the subject only when **two or more reviewers** raised the same value or theme. A single reviewer's point never does.
3. Verbatim sentences from `constructive_feedback` are never passed through to the subject — only the computed theme label. Raw text may be sent to the model for summarisation, behind config flag `send_verbatim_to_llm` (default on). **Stated plainly for the reviewers of this spec: when that flag is on, employees' written feedback leaves our infrastructure for OpenAI.** The schema-constrained output plus the two-reviewer gate is what prevents it from coming back out the other side.
4. The leadership report may name names. A note to its subject may not.

---

## 9. Data model

Four new tables. RLS enabled as on every other table in this schema; all access goes through `getSupabaseAdmin()` with the service-role key.

```sql
pulse_runs       id, cycle_key, run_date, window_start, window_end,
                 config jsonb, report_sent_at, status, created_at
                 UNIQUE(cycle_key)                     -- makes re-runs idempotent

pulse_scores     id, run_id→pulse_runs, employee_id→employees,
                 cohort ('full_timer' | 'probation'), bucket,
                 composite numeric, components jsonb,
                 review_count, review_scores numeric[],
                 coverage_expected, coverage_received,
                 prev_composite, delta, created_at
                 UNIQUE(run_id, employee_id)

pulse_notes      id, run_id, employee_id, bucket,
                 draft_text, edited_text, source ('llm' | 'template'),
                 status ('draft'|'approved'|'sent'|'skipped'|'failed'),
                 approved_by→employees, approved_at, sent_at, error,
                 created_at
                 UNIQUE(run_id, employee_id)
```

Configuration and recipients reuse the existing `site_settings` key/value table:

- `pulse_config` — weights, both cut-line pairs, `min_reviews`, `window_cycles`, feature flags.
- `pulse_recipients` — `["at@build3.org", "br@build3.org"]`.

Storing `config` on the run and `components` on each score is what makes a disputed bucket answerable six months later. Without them, changing a weight silently rewrites the history of every past run.

---

## 10. Interfaces

### 10.1 API

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/cron/pulse` | `Bearer CRON_SECRET` | The run. Modes below. |
| `GET /api/admin/pulse` | `requireAdmin()` | Latest run, or `?run=<id>`: scores, buckets, notes. |
| `POST /api/admin/pulse/send` | `requireAdmin()` | `{ noteIds[], edits? }` → DM each, mark `sent`. |
| `POST /api/admin/pulse/skip` | `requireAdmin()` | Mark notes `skipped`. |
| `POST /api/admin/pulse/redraft` | `requireAdmin()` | Re-run drafting for one note. |
| `GET/PATCH /api/admin/pulse/config` | `requireAdmin()` | Weights, cut lines, recipients. |

Cron modes, mirroring the `?force` / `?dry` convention `build3-self-reminder` already uses:

| Mode | Persists | Sends | LLM |
| --- | --- | --- | --- |
| *(default)* | yes | report to configured recipients | yes |
| `?dry=true` | no | nothing — returns JSON | no |
| `?preview=<email>` | no | report to that address only | yes |
| `?force=true` | — | bypasses the day gate; combines with the above | — |

`?preview=` is the staging path: it exercises real Chat delivery and real formatting against real data with zero blast radius.

`/api/cron/pulse` is middleware-exempt automatically — `src/middleware.ts` exempts the entire `/api/cron/` prefix, the structural fix adopted after a hand-maintained allow-list silently 401'd two crons for nine days (`docs/incident-birthday-cron-2026-05-31.md`).

### 10.2 Admin UI

New `pulse` tab in `src/app/admin/page.tsx` (extend the `Tab` union and `TABS`; `?tab=` deep-linking already works), implemented as `src/components/admin/PulseReview.tsx` on the existing `BrandPanel` / `SectionHeading` / `SegmentedControl` primitives.

- **Run header** — cycle, window, bucket counts, when the report went out.
- **Four collapsible bucket groups.** Each row: name, composite, movement arrow, individual review scores, component breakdown, coverage, and probation end date where relevant.
- **Each row expands** to the draft note in an editable textarea with **Send** / **Skip** / **Redraft**, plus a per-bucket "send all".
- **Config panel** — weights, both cut-line pairs, `min_reviews`, `window_cycles`, and the recipient list. Sliders in the style of `RiskScan`, but persisted to `site_settings` instead of held in local state.
- **Sent notes render read-only** with a timestamp and the approver's name. The page is the audit trail.

### 10.3 Test support

`vitest.config.ts` maps the `@/` path alias and stubs `server-only`, which is a
Next build-time marker with no standalone package. Without both, any test whose
import graph reaches a server module fails at collection — which is why the
tests predating this work all use relative imports and avoid `src/lib/server`.

### 10.4 Scheduling

`vercel.json` was removed in `82df7f6` during the Vercel → Coolify migration; cron schedules now live outside the repo as Coolify scheduled tasks. Following the pattern of every other cron here, the schedule is a plain daily hit and the route decides whether today is the day:

```
30 3 * * *   →   curl -H "Authorization: Bearer $CRON_SECRET" \
                   https://mutualfeedback.build3.online/api/cron/pulse
```

03:30 UTC = 09:00 IST. `isPulseDay()` returns true only when today in IST is the day after a 2nd Tuesday.

> **This schedule must be registered by hand in Coolify after deploy.** It is the one step no code change can perform, and the direct cause of the nine-day silent cron outage recorded in `docs/incident-birthday-cron-2026-05-31.md`.

---

## 11. Verification

1. **Unit tests.** `npm run test` and `npm run test:tz`. The timezone sweep is not optional: `isPulseDay()` is date logic with IST semantics running on a UTC host, precisely the class of bug `cycles.ts` exists to prevent. Scoring tests cover missing-component renormalisation, the `min_reviews` gate, both cohorts' cut lines, reviewer de-duplication, and empty input.
2. **Dry run against real data.**
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     "http://localhost:3000/api/cron/pulse?dry=true&force=true" | jq
   ```
   Nothing written, nothing sent, no LLM call. Check every bucket by eye against `/admin?tab=risk` and `/insights`. **Tune the weights and cut lines here**, before any persistence exists.
3. **Chat delivery test.**
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://mutualfeedback.build3.online/api/cron/pulse?preview=rk@build3.org&force=true"
   ```
   Confirms real delivery and that `*bold*` and bare-URL formatting render correctly in a DM. Still writes nothing.
4. **Full run with notes held.** A real run with `pulse_recipients` temporarily set to a single test address. Confirm `pulse_runs` / `pulse_scores` / `pulse_notes` rows exist and **every note is `draft`** — no employee has been messaged.
5. **Approval path.** Open `/admin?tab=pulse`, edit a draft, send it to the test address, confirm delivery and the `sent` transition.
6. **Idempotency.** Re-run the cron for the same cycle; confirm one run row, no duplicate notes, no second report.
7. Only then set `pulse_recipients` to `at@build3.org` and `br@build3.org`, and register the Coolify schedule.

**Result of the first real run (14 Sep 2026, cycle `2026-08-11`):** 30 people
scored from 190 reviews — 12 doing well, 1 on the fence, 1 needing a
conversation, 16 without enough signal. 30 notes drafted, zero template
fallbacks. Ten probation records found lapsed. Re-running correctly skipped.

---

## 12. Implementation

### 12.1 New files

```
src/lib/pulse-scoring.ts             pure: normalise, weight, composite, bucket.
                                     No I/O — the whole model is unit-testable.
src/lib/pulse-scoring.test.ts
src/lib/server/pulse.ts              buildPulseRun(), persistRun(),
                                     buildReportText(), loadConfig()
src/lib/server/pulse-notes.ts        draftNote() — model call, template fallback,
                                     and the anonymity filters from §8.3
src/app/api/cron/pulse/route.ts
src/app/api/admin/pulse/route.ts
src/app/api/admin/pulse/send/route.ts
src/app/api/admin/pulse/skip/route.ts
src/app/api/admin/pulse/redraft/route.ts
src/app/api/admin/pulse/config/route.ts
src/components/admin/PulseReview.tsx
supabase/pulse-tables.sql            new tables, mirrored to live Supabase
docs/PULSE-SPEC.md                   this document
```

### 12.2 Modified files

```
src/app/admin/page.tsx               add the pulse tab
src/components/admin/RiskScan.tsx    "intern" → "on probation" in copy (§2)
src/lib/cycles.ts                    add isDayAfterSecondTuesdayIst(), beside
                                     the existing isSecondTuesdayIst()
```

### 12.3 Reused as-is

Most of the surface area already exists. Nothing below is rewritten:

| What | Where |
| --- | --- |
| `sendDirectMessage()`, `isGoogleChatConfigured()`, `isNotificationsEnabled()` | `src/lib/server/google-chat.ts` |
| `cycleFor()`, `shiftCycle()`, `resolveWindow()`, `formatSessionDateLabel()`, `istParts()` | `src/lib/cycles.ts` |
| `fetchDashboardData()` — paged 1000-row reads | `src/lib/server/fetch-dashboard-data.ts` |
| `parseNumericAnswer()`, `contributionToNumber()`, `CONTRIBUTION_KEY_TO_LABEL`, `selectedValueTitles()` | `src/lib/insights-helpers.ts` |
| `submittersInCycle()`, the `NON_SUBSTANTIVE` answer filter | `period-gate.ts`, `mod-queue.ts` |
| `requireAdmin()` | `src/lib/server/require-admin.ts` |
| `getProbationOverview()` — probation end dates | `src/lib/server/probation.ts` |
| The cron auth block, verbatim | `src/app/api/cron/session-reminder/route.ts` |

### 12.4 Phasing

| Phase | Ships | Estimate |
| --- | --- | --- |
| 1 | `pulse-scoring.ts` + tests + `?dry=true` cron. Buckets readable as JSON; nothing sent. | ~4 h |
| 2 | Tables, persistence, report text, `?preview=` delivery. | ~3 h |
| 3 | Note drafting with template fallback and the §8.3 anonymity filters. | ~2 h |
| 4 | Admin tab: review, edit, approve, send, config. | ~5 h |
| 5 | Timezone tests, dry runs against live data, calibration, Coolify schedule. | ~2 h |

**≈ 2 focused days.**

Phase 1 is worth landing on its own. It answers "who is on the fence" the day it merges, with no messages sent to anyone and no schema change to roll back.

---

## 13. Risks and open items

| Risk | Handling |
| --- | --- |
| Thresholds mis-calibrated on first run, bucketing someone wrongly | Phases 1–2 produce buckets with nothing sent. Calibration happens against real data before any delivery path is enabled, and the human approval gate (R8) is the backstop after that. |
| A note identifies its reviewer in a team this size | The two-reviewer theme gate and the no-verbatim rule in §8.3, enforced in code on both model input and output, not by prompt instruction. |
| Employees' written feedback leaves our infrastructure for OpenAI | True whenever `send_verbatim_to_llm` is on (default). Flagged here for an explicit decision at review; the flag exists so it can be turned off, at some cost to note quality. |
| `isNotificationsEnabled()` **fails open** — any Supabase error returns `true` and messages send | Acceptable for a birthday card, worth revisiting now that the same switch gates performance-related notes. Flagged, not changed, in this spec. |
| `submitFeedback()` has no period check, so a double POST double-counts a reviewer | Scoring de-duplicates to the latest submission per `(reviewer, subject, cycle)` as a defence. The underlying gap remains open and is out of scope here. |
| A cycle with very little feedback produces mostly "not enough signal" | That is the correct output, and arguably the most useful one the system can produce in that state. The report surfaces it as a coverage problem rather than as an absence of results. |

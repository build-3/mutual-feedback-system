# Feedback leaderboard — engineering spec

**Status:** proposed · **Target:** `mutualfeedback.build3.online` (this repo)

---

## 1. Context

The platform now reads feedback well. Pulse sorts everyone into actionable groups each cycle and tells leadership who needs attention. But every conclusion it draws is only as good as the feedback underneath it, and the supply of that feedback is thin and badly distributed.

Measured over the trailing period on the live data:

| Fact | Value |
| --- | --- |
| Active people who could give peer feedback | 31 |
| Peer submissions in the period | 339 |
| People who gave **nothing at all** | 6 |
| Share of all feedback from the top 5 givers | **45%** |
| Share from the top 10 | 68% |
| Distinct givers in a given month | 12–22 of 31 |
| People Pulse could not score for want of reviewers | 8 of 30 |

The last two lines are the same problem seen from both ends. In any given month roughly half the roster gives no feedback, and as a direct consequence a quarter of the roster cannot be assessed at all. Pulse's *not enough signal* bucket is not a scoring quirk — it is the downstream symptom of a participation gap.

**This is a supply problem, and it is the binding constraint on everything the feedback system produces.** A leaderboard is worth building because it attacks that constraint directly and cheaply, using data already collected.

### The finding that shaped the design

The obvious objection to ranking feedback volume is that it trades quality for quantity. That objection was tested against the live data before committing to a design:

| Giver band | People | Feedback given | Avg characters written per answer |
| --- | --- | --- | --- |
| Heavy (20+) | 5 | 152 | **209** |
| Steady (10–19) | 10 | 137 | 169 |
| Light (4–9) | 7 | 43 | 149 |
| Rare (1–3) | 3 | 7 | **60** |

The correlation runs the *opposite* way to the fear: the people who give the most also write the most per review, by a factor of three and a half over the rare givers. Over 93% of submissions in every band carry written text.

Two consequences:

1. The quantity-vs-quality tradeoff is **not present today**, so the design does not need to be contorted around it.
2. It could still be *introduced* by a badly-chosen ranking. So the guard is a measured tripwire with a defined kill condition (§7), not a constraint baked into the scoring.

### What the ranking must not do

Raw volume is the wrong thing to rank on, for a reason the data makes concrete. Five people produce 45% of all feedback. If the board ranks raw counts, those five occupy the top five places every month forever. A leaderboard whose result is a foregone conclusion stops being motivating after the second month, and it motivates precisely the people who least need motivating.

---

## 2. Goals

- **G1** Increase the number of *distinct people* giving feedback each cycle, from the current 12–22 toward the full active roster.
- **G2** Shrink the group Pulse cannot score for want of reviewers, currently 8 of 30.
- **G3** Make participation visible and a little bit fun, without making it a stick.
- **G4** Preserve feedback quality: the written depth per review must not fall as volume rises.

### Non-goals

- Ranking, scoring or exposing the *content* or *favourability* of anyone's feedback. This board counts acts of giving, never what was said or what score was given.
- Ranking people by feedback **received**. Received is shown, never ranked — §4.
- Replacing Pulse. Pulse judges how someone is doing; this board counts whether the studio is feeding it.
- Performance management. Nothing here enters a probation, promotion or pay decision, and the spec says so in the product copy.
- Kudos. Kudos keeps its own separate leaderboard; the two are not merged or traded off against each other.

---

## 3. Decisions

| Decision | Chosen |
| --- | --- |
| Who can see it | Everyone on the active roster |
| Ranked on | Distinct teammates given substantive feedback **this cycle** |
| Delivery | A page in the app, plus a private nudge to people who reviewed nobody |
| Scope | Peer feedback only; kudos excluded |
| Received column | Displayed, never ranked |

---

## 4. What gets counted

### The ranked metric: teammates reviewed this cycle

A person's score for a cycle is **the number of distinct active teammates they gave at least one substantive peer review to during that cycle.**

Four properties, each of which is the reason it was chosen over raw count:

- **Bounded.** The ceiling is the roster minus yourself. Nobody can run away with it, and the top of the board is reachable.
- **Unfarmable.** Reviewing the same person five times scores 1, not 5. The observed repeat factor is already 1.54 (worst case 2.5), so this changes few numbers today — it closes the hole before the board creates a reason to exploit it.
- **Resets.** Each cycle starts level. A teammate who joined last month can top the board in their first full cycle.
- **Aligned with the actual goal.** G2 is about coverage breadth. This metric *is* coverage breadth.

### Substantive only

A submission counts only if it carries real content. This is the single most important anti-gaming measure.

The codebase already holds **two different and unrelated** notions of "substantive", and the leaderboard needs both:

1. **Not a ghost form** — the submission has at least one `feedback_answers` row. This is `period-gate.ts`'s rule (`hasAnswers`), and it is what `fetch-dashboard-data.ts` already applies when building its `givenSubmissions` array.
2. **Not answered with junk** — at least one written answer that is not in the `NON_SUBSTANTIVE` set (`"", "na", "n/a", "-", ".", "none", "nothing", "no", "nope", "yes", "all good"`), which lives in `mod-queue.ts`.

Rule 1 alone would let a form answered entirely with "na" score. Rule 2 alone would let a slider-only submission through. A review counts when it passes both.

`NON_SUBSTANTIVE` and its `isSubstantive()` helper are currently **module-private in `mod-queue.ts`**. Export them rather than copying the list — two divergent copies of "what counts as a real answer" is exactly the kind of drift the `resolveWindow` consolidation was done to prevent.

### The received column

Shown next to each name, never ranked and never sorted on.

Received is not an achievement. Nobody controls how many colleagues choose to review them, and the bottom of a "received" ranking is, by construction, exactly the 8 people Pulse already flags as unmeasured. Publishing that as a rank would publicly penalise people for other people's inaction — the opposite of the intended effect.

Instead, low received counts are inverted into the board's most useful output: a **"needs feedback"** call-out listing teammates nobody has reviewed this cycle, framed as an opportunity rather than a deficit. The people at the bottom of a received ranking become the reason for everyone else to act.

### Not counted

- Self-reflections and `build3` org feedback — real and valuable, but not acts of reviewing a colleague. Shown as a separate "reflections filed" tick, not part of the rank.
- Feedback given to or received from teammates no longer on the roster.
- Kudos.

---

## 5. The board

One page, visible to everyone signed in on the roster.

### Views

`SegmentedControl` for the range and `CycleStepper` for walking backwards, composed exactly as `/insights` already does it (`insights/page.tsx:394–427`). `CycleStepper` was built for this and has no other caller worth copying.

- **This cycle** (default) — the live race. Resets with the feedback cycle.
- **Last 3 cycles** — smooths a quiet month.
- **All time** — context rather than competition. Note that the data only reaches back ~6 months, so "all time" is currently a short history and should not be framed as a hall of fame yet.

Stepping never goes past the live cycle, and the cycle list comes from `listCyclesSince()` — an exported helper with no production caller yet, which is precisely what it was written for.

### Row contents

| Column | Contents | Sortable |
| --- | --- | --- |
| Rank | Position this cycle; joint ranks share a position | — |
| Name | Avatar + name, using the existing avatar helpers | — |
| Reviewed | Distinct teammates reviewed this cycle, with a small bar against the reachable maximum | **Sort key** |
| Streak | Consecutive cycles with at least one review given | No |
| Received | Reviews received this cycle, plain number | **No — deliberately not sortable** |
| Reflections | Whether they filed their self + studio reflections this cycle | No |

### Streaks

A consecutive-cycle streak is the part that rewards the behaviour actually wanted: showing up every cycle. It gives people who will never out-volume the top five a ladder of their own, and it is the metric most resistant to a one-off blitz.

### The "needs feedback" call-out

Above the table, permanently: the teammates with zero reviews this cycle, as a prompt. One click goes to the feedback form pre-targeted at that person. This is the single highest-leverage element on the page — it converts the board from a scoreboard into a queue of useful work, and it is the direct mechanism for G2.

### Tone

Copy stays light and non-punitive throughout, in the studio's lowercase voice. No trophies for the top, no red for the bottom, and one line of standing text stating plainly that this board counts participation only and is not part of any performance decision.

---

## 6. The nudge

A private Chat DM to anyone who reviewed nobody in the cycle just closed, sent once per cycle.

**It must not read as surveillance**, which is the live risk with this kind of message. The resolution is framing: the nudge does not say "you gave nothing". It says who still needs feedback and invites them to help. Same action requested, no accusation, and it carries information the recipient actually wants.

Shape:

> hi [name] — three teammates haven't had any feedback this cycle yet.
>
> if you have ten minutes, you'd be the first person to give them something to work with: [link]
>
> no pressure, and this is just a nudge — nothing about it is tracked against you.

Rules:
- Sent only to people with **zero** reviews in the closed cycle, never to light givers.
- At most one per cycle per person.
- Skipped entirely for anyone in their first two weeks on the roster.
- Suppressed if there is nobody actually short of feedback — the nudge exists to fill a gap, not to hit a quota.
- Reuses `sendDirectMessage()` and the existing cron auth pattern.

Whether this sends automatically or waits for approval the way Pulse notes do is the one open question in §11.

---

## 7. Anti-gaming and the quality tripwire

| Risk | Guard |
| --- | --- |
| Padding the count with empty submissions | Substantive filter (§4), reusing the existing rule |
| Reviewing one person repeatedly | Distinct people, not submissions |
| Rushing many thin reviews near cycle end | The quality tripwire, below |
| The same few people always winning | Bounded metric + cycle reset + streaks |
| Feeling like a performance rank | Received never ranked; standing copy; nothing feeds probation or Pulse scoring |

### The tripwire

The §1 table is the **pre-launch baseline**: heavy givers 209 characters, steady 169, light 149, rare 60. The same query runs each cycle after launch and the result is recorded.

**Kill condition, agreed in advance:** if the heavy band's average written length falls by more than a third from baseline, or converges to within 20% of the rare band's, the ranking has begun rewarding the wrong behaviour. The response is to switch the sort to a depth-weighted metric or withdraw the board — not to argue about whether it is really happening.

Stating the number now is what makes that decision possible later.

---

## 8. Implementation

### Data

No new tables are required for the core board. Every input already exists in `feedback_submissions`, `feedback_answers` and `employees`, and cycle boundaries come from `src/lib/cycles.ts`.

A small `leaderboard_nudges` table records which nudge went to whom in which cycle, so the once-per-cycle rule survives a retry. The alternative — inferring it from Chat — is not queryable.

Streaks are computed, not stored: cycles are cheap to enumerate with `listCyclesSince()` and the whole roster is ~31 people.

### Modules

- `src/lib/leaderboard.ts` — pure: given submissions, answers, roster and a cycle window, produce ranked rows. No I/O, fully unit-testable, mirroring how `pulse-scoring.ts` is structured.
- `src/lib/server/leaderboard.ts` — the reads and the aggregation.
- `src/app/api/leaderboard/route.ts` — GET, gated to any signed-in roster member.
- `src/app/leaderboard/page.tsx` + a client component for the table.
- `src/app/api/cron/leaderboard-nudge/route.ts` — the per-cycle nudge, following the existing cron auth block.

### Reuse, not reinvention

**The model to copy is `buildPulseRun` (`src/lib/server/pulse.ts:163`)**, not the kudos leaderboard. It already does cycle-windowed, whole-roster, per-person aggregation correctly: paged reads, `is_active` filtering on both the author and the subject, and — directly relevant — it already distinguishes `reviewCount` from `distinctReviewers`, which is the same distinction this board is ranked on.

- **Every read goes through `fetchPaged` / `fetchPagedByIds`** (`src/lib/server/paged-query.ts`). Not optional. An all-time view spans far more than 1,000 `feedback_answers` rows, and an unpaginated select returns a silent partial result — the fault that produced a wrong Pulse report and a wrong probation dashboard. Note that both `getTopRecipients` (kudos) and `submittersInCycle` (period-gate) predate the helper and still use bare selects; **do not copy their query shape.**
- Cycle maths: `cycleFor`, `shiftCycle`, `listCyclesSince`, `cycleKeyOf`, `resolveWindow`, `formatSessionDateLabel`.
- Auth: **`requireAuth()`**, matching `/api/insights/data` and `/api/kudos/leaderboard`. A roster-wide page is the established pattern here — `/insights` already shows every person's feedback to everyone signed in — so this needs no new access model.
- The "given" semantic already exists in `fetch-dashboard-data.ts`: `hasAnswers && type !== "self" && type !== "build3"`. Reuse that definition, adding the `feedback_for_id != null` condition it omits.
- Chat delivery: `sendDirectMessage`, `isGoogleChatConfigured`, `isNotificationsEnabled`, and the cron auth block from `session-reminder/route.ts`.
- UI: `BrandPanel`, `SectionHeading`, `SegmentedControl`, `CycleStepper`, `StatPill`, `EmptyState`; avatars are hand-rolled from `getAvatarColor` / `getInitials` (`insights-helpers.ts`) — there is no avatar component. `RiskScan.tsx:262–305` is the closest ranked-table markup; `employees/page.tsx:298–354` is the table skeleton, including the `hidden sm:table-cell` pattern for narrow screens.
- Rows link to `/insights?employee=<id>`, as the employees table already does.

### Two fiddly bits

**Navigation.** The mobile tab bar in `Navbar.tsx` is already full at five items and a sixth will crowd it. A new link also needs a case in `NavIcon` and an entry in `LINK_ACCENTS`, or it silently falls back to the insights accent. Recommendation: replace the `quick note` nav item with the leaderboard, or accept a desktop-only nav entry and reach it from `/insights` on mobile. This is a genuine product call, not a detail.

**Accent.** `SCREEN_ACCENTS` has no leaderboard key. Add one rather than borrowing `kudos`'s yellow, so the two boards stay visually distinct.

### A dead field worth knowing about

`buildInsightsPayload` already computes `participationByEmployee` — but despite the name it is a *received* count, and nothing in the codebase reads it. Either repurpose it or leave it alone; do not build the leaderboard on top of `buildInsightsPayload`, whose payload carries every submission, answer and response in the org.

### Timezone

Cycle boundaries are IST and the host runs UTC. Any date logic added here joins the `npm run test:tz` sweep, which exists because that exact discrepancy has already caused a production bug.

---

## 9. Verification

1. **Unit tests** on the pure module: substantive filtering, distinct-people counting, joint ranks, streak calculation across a gap, empty cycle, a person who joined mid-window, a departed teammate excluded from both numerator and denominator.
2. **Reconcile against SQL.** The board's numbers must match a direct query for the same window — the check that caught the truncation bug last time, and the only one that would catch it again.
3. **Paging proof.** Run the all-time view against live data and confirm the totals match SQL exactly, not approximately.
4. **Timezone sweep** — `npm run test:tz`.
5. **Nudge dry run** — a `?dry=true` mode returning who *would* be nudged and why, sending nothing, before any message goes out.
6. **Baseline capture** — record the §7 quality numbers on the day of launch.

---

## 10. Phasing

| Phase | Ships | Estimate |
| --- | --- | --- |
| 1 | Pure ranking module + tests + an API returning the current cycle | ~3 h |
| 2 | The page: this-cycle view, ranked table, "needs feedback" call-out | ~4 h |
| 3 | Streaks and the all-time view | ~2 h |
| 4 | The nudge cron, dry-run first | ~2 h |
| 5 | Tripwire query recorded, TZ tests, reconciliation against SQL | ~2 h |

**≈ 1.5 focused days.**

Phase 2 is the whole product. Phases 3–4 are what make it stick, and phase 5 is what tells us whether it worked.

---

## 11. Open questions

1. **Does the nudge send automatically, or wait for approval?** Pulse holds every note for a human. This message is far lighter and non-judgemental, so auto-send is defensible — but it is the one thing here that reaches people unprompted, and the precedent in this codebase is to gate that.
2. **Should the board show people on probation alongside full-timers, or split them?** Pulse scores the two cohorts separately because they are not comparable. Giving feedback, unlike receiving it, arguably is comparable across both — but a single list does put newer teammates against people with years of context.
3. **Does a zero-review cycle for a specific person ever reach leadership?** Recommendation: no. The moment participation data appears in a management report, the board stops being a game and starts being a metric, and the copy promising otherwise becomes false.
4. **Which nav slot does it take?** The mobile tab bar is full at five. Either `quick note` gives up its place, or the board is desktop-nav plus an entry point from `/insights`.

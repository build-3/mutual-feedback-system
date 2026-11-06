"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import FormattedAnswer from "@/components/FormattedAnswer"
import { BrandPanel, EmptyState, SectionHeading, badgeClasses } from "@/components/ui/brand"
import { SCREEN_ACCENTS } from "@/lib/brand"
import { contributionKeyToLabel, getAvatarColor, getInitials } from "@/lib/insights-helpers"
import { daysBetweenIso, todayIso } from "@/lib/probation-dates"
import {
  probationMonth,
  probationProgress,
  probationStage,
  type ProbationStage,
} from "@/lib/probation-stage"
import { REVIEW_GAP_CONFIG } from "@/lib/review-gap"

type FeedbackEntry = {
  submission_id: string
  submitted_by_name: string
  submitted_by_full_time: boolean
  feedback_date: string
  contribution_level: string | null
  recommend_rating: number | null
  answers: { question_key: string; question_text: string; answer_value: string }[]
}

type Review = {
  id: string
  reviewer_name: string
  contribution_level: string
  backing_score: number
  created_at: string
}

type Item = {
  id: string
  employee_id: string
  employee_name: string
  employee_email: string | null
  start_date: string
  end_date: string
  duration_months: number
  status: string
  extended_at: string | null
  promoted_at: string | null
  signal: string | null
  total_feedback_count: number
  avg_recommend_rating: number | null
  contribution_summary: { counts: Record<string, number>; most_common: string | null }
  reviews: Review[]
  feedback_history: FeedbackEntry[]
  sponsor_id: string | null
  sponsor_name: string | null
  buddy_id: string | null
  buddy_name: string | null
  full_time_reviewers: number
}

type Payload = { probations: Item[]; totalActive: number; canAct: boolean; canEditDates: boolean }

type Summary = { text?: string; loading?: boolean; error?: string; reviews?: number }

const accent = SCREEN_ACCENTS.probation

// Needs-attention first: that is the column someone opens this page to find.
const SECTIONS: { stage: ProbationStage; title: string; hint: string }[] = [
  { stage: "eligible_for_review", title: "eligible for review", hint: "final month, or past the end date" },
  { stage: "under_probation", title: "under probation", hint: "more than a month to go" },
  { stage: "full_time", title: "confirmed full time", hint: "confirmed in the last 90 days" },
]

const INK = "text-ink"
const WARN = "text-[#d35b52]"

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function signalAccent(signal: string): "sage" | "peach" | "lavender" {
  if (signal.includes("High Signal") || signal.includes("Promoted")) return "sage"
  if (signal.includes("Needs Team Review")) return "peach"
  return "lavender"
}

function timeLeftText(daysLeft: number): string {
  if (daysLeft > 0) return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
  if (daysLeft === 0) return "ends today"
  return `${-daysLeft} day${daysLeft === -1 ? "" : "s"} over`
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ backgroundColor: getAvatarColor(name), width: size, height: size }}
    >
      {getInitials(name)}
    </span>
  )
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white/70 px-4 py-3">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tracking-[-0.03em] ${warn ? WARN : INK}`}>{value}</div>
      {sub && <div className={`text-[11px] ${warn ? WARN : "text-muted"}`}>{sub}</div>}
    </div>
  )
}

/** A thin line from joining to the end date, with today marked. */
function ProgressLine({ item, today }: { item: Item; today: string }) {
  const { percent, overdue } = probationProgress({
    startDate: item.start_date,
    endDate: item.end_date,
    today,
  })
  const done = item.status === "promoted"
  return (
    <div>
      <div className="relative h-2 rounded-full bg-black/[0.07]">
        <div
          className="h-2 rounded-full"
          style={{
            width: `${done ? 100 : percent}%`,
            backgroundColor: overdue && !done ? "#d35b52" : "#6aa88a",
          }}
        />
        {!done && percent > 0 && percent < 100 && (
          <span
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink shadow"
            style={{ left: `${percent}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        <span>joined {formatDate(item.start_date)}</span>
        <span>ends {formatDate(item.end_date)}</span>
      </div>
    </div>
  )
}

function ListRow({
  item,
  selected,
  today,
  onSelect,
}: {
  item: Item
  selected: boolean
  today: string
  onSelect: () => void
}) {
  const isOpen = item.status === "active" || item.status === "extended"
  const daysLeft = daysBetweenIso(today, item.end_date)
  const { month, of } = probationMonth({ startDate: item.start_date, today, durationMonths: item.duration_months })
  const { percent, overdue } = probationProgress({ startDate: item.start_date, endDate: item.end_date, today })

  return (
    <button
      type="button"
      data-person={item.employee_id}
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.99] ${
        selected ? "border-ink bg-white shadow-[var(--shadow-soft)]" : "border-line bg-white/60 hover:border-ink/25"
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={item.employee_name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{item.employee_name}</div>
          <div className="truncate text-[11px] text-muted">
            {isOpen ? `month ${month} of ${of} · ${timeLeftText(daysLeft)}` : "confirmed full time"}
          </div>
          <div className={`truncate text-[11px] ${item.sponsor_name ? "text-muted" : WARN}`}>
            {item.sponsor_name ? `sponsor: ${item.sponsor_name}` : "no sponsor yet"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {isOpen && overdue && <span {...badgeClasses({ accent: "pink", tone: "soft" })}>overdue</span>}
          <span className="text-[11px] tabular-nums text-muted">{item.total_feedback_count} feedback</span>
        </div>
      </div>
      {isOpen && (
        <div className="mt-2 h-1 rounded-full bg-black/[0.07]">
          <div
            className="h-1 rounded-full"
            style={{ width: `${percent}%`, backgroundColor: overdue ? "#d35b52" : "#6aa88a" }}
          />
        </div>
      )}
    </button>
  )
}

function Detail({
  item,
  today,
  data,
  summary,
  onSummarise,
  onBack,
}: {
  item: Item
  today: string
  data: Payload
  summary: Summary | undefined
  onSummarise: () => void
  onBack: () => void
}) {
  const [openEntry, setOpenEntry] = useState<string | null>(null)
  const isOpen = item.status === "active" || item.status === "extended"
  const daysLeft = daysBetweenIso(today, item.end_date)
  const { month, of } = probationMonth({
    startDate: item.start_date,
    today,
    durationMonths: item.duration_months,
  })
  const thin = isOpen && item.full_time_reviewers < REVIEW_GAP_CONFIG.minFullTimers

  return (
    <BrandPanel accent={accent} tone="soft" className="p-5 sm:p-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-xs font-semibold text-muted hover:text-ink lg:hidden"
      >
        ← back to the list
      </button>

      {/* Who */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={item.employee_name} size={48} />
          <div>
            <h2 className="text-xl font-bold tracking-[-0.04em] text-ink">{item.employee_name}</h2>
            {item.employee_email && <p className="text-xs text-muted">{item.employee_email}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span {...badgeClasses({ accent: item.status === "promoted" ? "sage" : "lavender", tone: "soft" })}>
            {item.status === "promoted" ? "confirmed full time" : item.status}
          </span>
          {isOpen && daysLeft < 0 && <span {...badgeClasses({ accent: "pink", tone: "soft" })}>overdue</span>}
          {isOpen && !item.sponsor_id && (
            <span {...badgeClasses({ accent: "peach", tone: "soft" })}>no sponsor</span>
          )}
          {item.signal && (
            <span {...badgeClasses({ accent: signalAccent(item.signal), tone: "soft" })}>{item.signal}</span>
          )}
        </div>
      </div>

      {/* Where they are */}
      <div className="mt-6">
        <ProgressLine item={item} today={today} />
        {isOpen && (
          <p className="mt-2 text-sm text-ink">
            <span className="font-semibold">
              month {month} of {of}
            </span>
            <span className={daysLeft <= 14 ? ` ${WARN}` : " text-muted"}> · {timeLeftText(daysLeft)}</span>
          </p>
        )}
      </div>

      {/* The numbers */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="feedback received" value={String(item.total_feedback_count)} />
        <Tile
          label="from full-timers"
          value={`${item.full_time_reviewers} of ${REVIEW_GAP_CONFIG.minFullTimers}`}
          sub={thin ? "not enough yet" : "enough to go on"}
          warn={thin}
        />
        <Tile
          label="team score"
          value={item.avg_recommend_rating !== null ? `${item.avg_recommend_rating}/5` : "none yet"}
          sub={item.avg_recommend_rating !== null ? "ready for full time" : undefined}
          warn={item.avg_recommend_rating !== null && item.avg_recommend_rating <= 3}
        />
        <Tile label="period" value={`${item.duration_months} months`} sub={item.status === "extended" ? "extended" : undefined} />
      </div>

      {/* Sponsor and buddy */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white/70 px-4 py-3">
          <div className="text-[11px] font-medium text-muted">sponsor · owns the probation conversation</div>
          <div className={`mt-0.5 text-sm font-semibold ${item.sponsor_name ? INK : WARN}`}>
            {item.sponsor_name ?? "nobody yet"}
          </div>
          {data.canEditDates && (
            <Link href="/admin?tab=sponsors" className="text-[11px] font-semibold text-ink underline">
              {item.sponsor_name ? "change" : "assign a sponsor"}
            </Link>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-white/70 px-4 py-3">
          <div className="text-[11px] font-medium text-muted">buddy · helps them settle in</div>
          <div className="mt-0.5 text-sm font-semibold text-ink">{item.buddy_name ?? "nobody yet"}</div>
        </div>
      </div>

      {/* How they are seen */}
      {Object.keys(item.contribution_summary.counts).length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-medium text-muted">how the team sees them</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(item.contribution_summary.counts)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-white/80 px-2.5 py-1 text-xs"
                >
                  <span className="font-medium text-ink">{contributionKeyToLabel(k)}</span>
                  <span className="text-muted">×{v}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* AI summary */}
      <div className="mt-5 rounded-2xl border border-line bg-white/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-medium text-muted">
            ai summary of their written feedback
            {summary?.reviews !== undefined ? ` · ${summary.reviews} review${summary.reviews === 1 ? "" : "s"}` : ""}
          </div>
          <button
            type="button"
            disabled={summary?.loading || item.total_feedback_count === 0}
            onClick={onSummarise}
            className="text-xs font-semibold text-ink underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            {summary?.loading ? "summarising…" : summary?.text ? "redo" : "summarise"}
          </button>
        </div>
        {summary?.text && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink">{summary.text}</p>}
        {summary?.error && <p className={`mt-2 text-xs ${WARN}`}>{summary.error}</p>}
        {!summary && (
          <p className="mt-2 text-xs text-muted">
            {item.total_feedback_count === 0
              ? "no feedback to summarise yet."
              : "made when you ask, from their written answers. reviewer names are never sent."}
          </p>
        )}
      </div>

      {/* Everything they have been told, newest first */}
      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-bold tracking-[-0.02em] text-ink">feedback history</h3>
          <span className="text-[11px] text-muted">newest first · tap one to read it</span>
        </div>
        {item.feedback_history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
            nobody has given them feedback during this probation.
          </p>
        ) : (
          <ul className="space-y-2">
            {item.feedback_history.map((f) => {
              const expanded = openEntry === f.submission_id
              const readable = f.answers.length > 0
              return (
                <li key={f.submission_id} className="rounded-2xl border border-line bg-white/80">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    disabled={!readable}
                    onClick={() => setOpenEntry(expanded ? null : f.submission_id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left disabled:cursor-default"
                  >
                    <span className="text-sm font-semibold text-ink">{f.submitted_by_name}</span>
                    {f.submitted_by_full_time && (
                      <span {...badgeClasses({ accent: "sage", tone: "soft" })}>full-timer</span>
                    )}
                    <span className="text-[11px] text-muted">{formatTimestamp(f.feedback_date)}</span>
                    <span className="ml-auto flex items-center gap-2 text-xs">
                      {f.contribution_level && (
                        <span className="text-muted">{contributionKeyToLabel(f.contribution_level)}</span>
                      )}
                      {f.recommend_rating !== null && (
                        <span className={`font-semibold ${f.recommend_rating > 3 ? "text-[#4a8c6f]" : WARN}`}>
                          {f.recommend_rating}/5
                        </span>
                      )}
                      {readable && <span className="text-muted">{expanded ? "−" : "+"}</span>}
                    </span>
                  </button>
                  {expanded && (
                    <div className="space-y-3 border-t border-line px-4 py-3">
                      {f.answers.map((a) => (
                        <div key={a.question_key} className="text-xs">
                          <div className="text-muted">{a.question_text}</div>
                          <div className="mt-0.5 border-l-2 border-line pl-2 text-ink">
                            <FormattedAnswer questionKey={a.question_key} value={a.answer_value} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {item.feedback_history.length > 10 && (
          <p className="mt-2 text-center text-[11px] text-muted">
            the newest 10 can be opened here. open the full card for the rest.
          </p>
        )}
      </div>

      {/* Reviewer assessments */}
      {item.reviews.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-bold tracking-[-0.02em] text-ink">reviewer assessments</h3>
          <ul className="space-y-2">
            {item.reviews.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-line bg-white/80 px-4 py-2.5 text-xs"
              >
                <span className="font-semibold text-ink">{r.reviewer_name}</span>
                <span className="text-muted">
                  role: {r.contribution_level === "leader" ? "leader" : "independent contributor"}
                </span>
                <span className="text-muted">
                  readiness:{" "}
                  <span className={r.backing_score > 3 ? "text-[#4a8c6f]" : WARN}>{r.backing_score}/5</span>
                </span>
                <span className="ml-auto text-muted/70">{formatTimestamp(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Where to act */}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Link
          href={`/insights?employee=${item.employee_id}`}
          className="text-sm font-semibold text-ink underline"
        >
          open the full card{data.canAct && isOpen ? " to promote or extend" : ""} →
        </Link>
      </div>
    </BrandPanel>
  )
}

export default function ProbationPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [denied, setDenied] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<Record<string, Summary>>({})

  const today = todayIso()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/admin/probation", { cache: "no-store" })
        if (cancelled) return
        if (res.status === 401 || res.status === 403) {
          setDenied(true)
          return
        }
        if (!res.ok) throw new Error("could not load the probation board")
        setData(await res.json())
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "could not load")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const items = (data?.probations ?? []).filter(
      (p) =>
        q === "" ||
        p.employee_name.toLowerCase().includes(q) ||
        (p.sponsor_name ?? "").toLowerCase().includes(q)
    )
    return SECTIONS.map((s) => ({
      ...s,
      items: items.filter(
        (p) =>
          probationStage({ status: p.status, endDate: p.end_date, promotedAt: p.promoted_at, today }) ===
          s.stage
      ),
    }))
  }, [data, query, today])

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])

  const select = useCallback((employeeId: string | null) => {
    setSelectedId(employeeId)
    try {
      const url = new URL(window.location.href)
      if (employeeId) url.searchParams.set("person", employeeId)
      else url.searchParams.delete("person")
      window.history.replaceState(null, "", url)
    } catch {
      // the address bar is a convenience; selection works without it
    }
  }, [])

  // Open the person named in the link, or on a wide screen the first one who
  // needs attention. On a phone nothing is preselected: the list comes first.
  useEffect(() => {
    if (!data || selectedId) return
    const wanted = new URLSearchParams(window.location.search).get("person")
    const fromLink = wanted && data.probations.find((p) => p.employee_id === wanted)
    if (fromLink) {
      setSelectedId(fromLink.employee_id)
      return
    }
    if (window.matchMedia("(min-width: 1024px)").matches && flat[0]) select(flat[0].employee_id)
  }, [data, selectedId, flat, select])

  const selected = data?.probations.find((p) => p.employee_id === selectedId) ?? null

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    if (flat.length === 0) return
    e.preventDefault()
    const i = flat.findIndex((p) => p.employee_id === selectedId)
    const next = e.key === "ArrowDown" ? Math.min(flat.length - 1, i + 1) : Math.max(0, i === -1 ? 0 : i - 1)
    const target = flat[next]
    select(target.employee_id)
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-person="${target.employee_id}"]`)?.focus()
    )
  }

  async function summarise(item: Item) {
    setSummaries((s) => ({ ...s, [item.id]: { loading: true } }))
    try {
      const res = await fetch("/api/admin/probation/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probationId: item.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSummaries((s) => ({ ...s, [item.id]: { error: body.error ?? "could not summarise" } }))
        return
      }
      setSummaries((s) => ({ ...s, [item.id]: { text: body.summary, reviews: body.basedOn?.reviews } }))
    } catch {
      setSummaries((s) => ({ ...s, [item.id]: { error: "network error" } }))
    }
  }

  const noSponsor = (data?.probations ?? []).filter(
    (p) => (p.status === "active" || p.status === "extended") && !p.sponsor_id
  ).length

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 sm:py-12 sm:pb-12">
        <SectionHeading
          accent={accent}
          eyebrow="probation"
          title="everyone on probation"
          description="pick a person to see their whole story: where they are, who has given them feedback, what it said, and who owns the conversation."
        />

        {loading && <p className="py-12 text-center text-sm text-muted">loading…</p>}

        {denied && (
          <div className="mt-6">
            <EmptyState
              accent={accent}
              title="this page is for sponsors and the people who decide"
              description="you will see it here once you are set as someone's sponsor."
            />
          </div>
        )}

        {error && (
          <BrandPanel accent="pink" tone="washed" className="mt-6 p-6 text-sm text-[#d35b52]">
            {error}
          </BrandPanel>
        )}

        {data && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            {/* The list: hidden on a phone once someone is picked */}
            <div
              className={`${selected ? "hidden lg:block" : "block"} lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1`}
            >
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="find a person or sponsor"
                aria-label="find a person or sponsor"
                className="w-full rounded-full border border-line bg-white px-4 py-2 text-sm text-ink"
              />
              <p className="mt-3 text-xs text-muted">
                <span className="font-semibold text-ink">{data.totalActive}</span> on probation
                {noSponsor > 0 && (
                  <>
                    {" · "}
                    <span className={`font-semibold ${WARN}`}>{noSponsor}</span> with no sponsor
                  </>
                )}
                {data.canEditDates && (
                  <>
                    {" · "}
                    <Link href="/admin?tab=sponsors" className="font-semibold text-ink underline">
                      assign sponsors
                    </Link>
                  </>
                )}
              </p>

              <div className="mt-4 space-y-6" onKeyDown={onListKeyDown}>
                {sections.map((s) => (
                  <section key={s.stage} aria-label={s.title}>
                    <div className="mb-2 flex items-baseline justify-between">
                      <h2 className="text-sm font-bold tracking-[-0.02em] text-ink">{s.title}</h2>
                      <span className="text-xs text-muted">{s.items.length}</span>
                    </div>
                    <p className="-mt-1 mb-2 text-[11px] text-muted">{s.hint}</p>
                    <div className="space-y-2">
                      {s.items.length === 0 && (
                        <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-center text-xs text-muted">
                          nobody here
                        </p>
                      )}
                      {s.items.map((p) => (
                        <ListRow
                          key={p.id}
                          item={p}
                          today={today}
                          selected={p.employee_id === selectedId}
                          onSelect={() => select(p.employee_id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            {/* The picked person */}
            <div className={selected ? "block" : "hidden lg:block"}>
              {selected ? (
                <Detail
                  key={selected.id}
                  item={selected}
                  today={today}
                  data={data}
                  summary={summaries[selected.id]}
                  onSummarise={() => summarise(selected)}
                  onBack={() => select(null)}
                />
              ) : (
                <EmptyState
                  accent={accent}
                  title="pick someone on the left"
                  description="you will see their dates, every piece of feedback they have been given, and their sponsor and buddy."
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

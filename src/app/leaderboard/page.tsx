"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import {
  BrandPanel,
  EmptyState,
  SectionHeading,
  SegmentedControl,
} from "@/components/ui/brand"
import { SCREEN_ACCENTS, DATE_RANGE_LABELS, type DateRange } from "@/lib/brand"
import { getAvatarColor, getInitials } from "@/lib/insights-helpers"
import { denseRanks } from "@/lib/leaderboard"

type Row = {
  employeeId: string
  name: string
  cohort: "full_timer" | "probation"
  reviewed: number
  submissions: number
  reachable: number
  received: number
  streak: number
  reflectionsFiled: boolean
  rank: number
}

type Payload = {
  range: DateRange
  windowLabel: string
  /** The live cycle's label — differs from windowLabel while last cycle is shown. */
  liveWindowLabel: string
  showingPrevious: boolean
  rows: Row[]
  needsFeedback: { employeeId: string; name: string }[]
  totals: { people: number; reviewsCounted: number; activeGivers: number; noFeedbackYet: number }
}

const accent = SCREEN_ACCENTS.leaderboard

const RANGES: { key: DateRange; label: string }[] = [
  { key: "cycle", label: DATE_RANGE_LABELS.cycle },
  { key: "3cycles", label: DATE_RANGE_LABELS["3cycles"] },
  { key: "all", label: DATE_RANGE_LABELS.all },
]

type CohortFilter = "everyone" | "full_timer" | "probation"

const COHORTS: { key: CohortFilter; label: string }[] = [
  { key: "everyone", label: "everyone" },
  { key: "full_timer", label: "full-timers" },
  { key: "probation", label: "on probation" },
]

// Gold, silver, bronze — soft enough to sit on the page's pastel palette.
const MEDALS: Record<number, string> = { 1: "#ecc86a", 2: "#cfd3da", 3: "#dba77c" }

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {getInitials(name)}
    </span>
  )
}

function RankBadge({ rank, reviewed }: { rank: number; reviewed: number }) {
  // Nobody at zero has a position worth showing: the server hands the whole tied
  // group rank 1, which on an empty board reads as thirty people all winning.
  if (reviewed === 0) {
    return <span className="flex h-9 w-9 shrink-0 items-center justify-center text-muted/50">–</span>
  }
  const medal = MEDALS[rank]
  return (
    <span
      aria-label={`rank ${rank}`}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
        medal ? "text-ink" : "text-muted"
      }`}
      style={medal ? { backgroundColor: medal } : undefined}
    >
      {rank}
    </span>
  )
}

/** The small print under a name: only what is true of this person. */
function detailFor(row: Row): string {
  const parts = [row.cohort === "probation" ? "on probation" : "full-timer"]
  if (row.streak > 1) parts.push(`${row.streak} cycles in a row`)
  if (row.received > 0) parts.push(`reviewed by ${row.received}`)
  if (row.reflectionsFiled) parts.push("reflections filed")
  return parts.join(" · ")
}

export default function LeaderboardPage() {
  const [range, setRange] = useState<DateRange>("cycle")
  const [cohort, setCohort] = useState<CohortFilter>("everyone")
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showGap, setShowGap] = useState(false)

  const load = useCallback(async (next: DateRange) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leaderboard?range=${next}`, { cache: "no-store" })
      if (!res.ok) throw new Error("could not load the leaderboard")
      setData(await res.json())
      setError("")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "something went wrong")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(range)
  }, [load, range])

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => cohort === "everyone" || r.cohort === cohort),
    [data, cohort]
  )
  const giving = useMemo(() => rows.filter((r) => r.reviewed > 0), [rows])
  // Numbered over the rows on screen, not taken from the server: its positions
  // skip after a tie and span the whole roster, so a cohort filter left holes
  // (1, 2, 5) that read as missing people.
  const positions = useMemo(() => denseRanks(giving.map((r) => r.reviewed)), [giving])
  // The summary and the "no feedback" box describe the people on screen, so they
  // follow the cohort filter instead of quietly staying roster-wide.
  const reviewsCounted = useMemo(() => rows.reduce((sum, r) => sum + r.submissions, 0), [rows])
  const needsFeedback = useMemo(() => {
    const visible = new Set(rows.map((r) => r.employeeId))
    return (data?.needsFeedback ?? []).filter((p) => visible.has(p.employeeId))
  }, [data, rows])
  const who = cohort === "full_timer" ? "full-timers" : cohort === "probation" ? "people on probation" : "teammates"
  const notYet = useMemo(() => rows.filter((r) => r.reviewed === 0), [rows])

  const when = data?.showingPrevious ? "last cycle" : "yet"

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-6 pb-28 sm:px-6 sm:py-12 sm:pb-12">
        <SectionHeading
          accent={accent}
          eyebrow="leaderboard"
          title="who's giving feedback"
          description="ranked by how many different teammates you've given real feedback to. it's a participation board — nothing here is part of any performance decision."
        />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <SegmentedControl ariaLabel="time range" options={RANGES} value={range} onChange={setRange} />
          <SegmentedControl ariaLabel="cohort" options={COHORTS} value={cohort} onChange={setCohort} />
        </div>

        {error && (
          <BrandPanel accent="pink" tone="washed" className="mt-6 p-6 text-sm text-[#d35b52]">
            {error}
          </BrandPanel>
        )}

        {loading && !data && (
          <p className="py-12 text-center text-sm text-muted">loading the leaderboard…</p>
        )}

        {data && (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {data.showingPrevious && (
              <BrandPanel accent={accent} tone="washed" className="mt-6 p-4 sm:p-5">
                <p className="text-sm font-semibold text-ink">a new cycle just started</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  nobody has given feedback in {data.liveWindowLabel} yet, so this is last cycle
                  ({data.windowLabel}). it switches over by itself when the first review lands.
                </p>
              </BrandPanel>
            )}

            <p className="mt-6 text-sm leading-6 text-muted">
              <span className="font-semibold text-ink">
                {giving.length} of {rows.length}
              </span>{" "}
              {who} have given feedback ·{" "}
              <span className="font-semibold text-ink">{reviewsCounted}</span>{" "}
              {reviewsCounted === 1 ? "review" : "reviews"} counted ·{" "}
              {data.windowLabel}
            </p>

            {needsFeedback.length > 0 && (
              <BrandPanel accent="peach" tone="washed" className="mt-5 p-4 sm:p-5">
                <button
                  type="button"
                  aria-expanded={showGap}
                  onClick={() => setShowGap((open) => !open)}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {needsFeedback.length}{" "}
                      {needsFeedback.length === 1 ? "teammate hasn't" : "teammates haven't"} had
                      any feedback {when}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      be the first to give them something to work with.
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-muted">
                    {showGap ? "hide" : "show who"}
                  </span>
                </button>
                {showGap && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {needsFeedback.map((person) => (
                      <Link
                        key={person.employeeId}
                        href={`/feedback?for=${person.employeeId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/80 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-white"
                      >
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{ backgroundColor: getAvatarColor(person.name) }}
                        >
                          {getInitials(person.name)}
                        </span>
                        {person.name}
                      </Link>
                    ))}
                  </div>
                )}
              </BrandPanel>
            )}

            {rows.length === 0 && (
              <div className="mt-6">
                <EmptyState
                  accent={accent}
                  title="nobody here yet"
                  description="no feedback has been given in this window."
                />
              </div>
            )}

            {giving.length > 0 && (
              <div className="mt-6">
                <p className="pb-1.5 pr-4 text-right text-[10px] font-semibold tracking-[0.08em] text-muted sm:pr-5">
                  teammates reviewed
                </p>
                <ol className="divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-white">
                  {giving.map((row, index) => {
                    const pct =
                      row.reachable > 0 ? Math.round((row.reviewed / row.reachable) * 100) : 0
                    return (
                      <li key={row.employeeId}>
                        <Link
                          href={`/insights?employee=${row.employeeId}`}
                          className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[rgba(188,173,204,0.10)] sm:gap-4 sm:px-5"
                        >
                          <RankBadge rank={positions[index]} reviewed={row.reviewed} />
                          <Avatar name={row.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold leading-snug text-ink">{row.name}</span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                              {detailFor(row)}
                            </span>
                            <span
                              aria-hidden
                              className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/[0.06]"
                            >
                              <span
                                className="block h-full rounded-full bg-[#bcadcc]"
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                          </span>
                          <span className="w-12 shrink-0 text-right">
                            <span className="block text-xl font-bold leading-none tracking-[-0.03em] text-ink">
                              {row.reviewed}
                            </span>
                            <span className="mt-1 block text-[11px] text-muted">of {row.reachable}</span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}

            {notYet.length > 0 && (
              <section className="mt-6" aria-label="not yet given feedback">
                <h3 className="text-xs font-semibold tracking-[0.08em] text-muted">
                  {notYet.length} haven&rsquo;t given feedback {when}
                </h3>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {notYet.map((row) => (
                    <span
                      key={row.employeeId}
                      className="rounded-full border border-line bg-white/70 px-3 py-1 text-xs text-ink"
                    >
                      {row.name}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <p className="mt-8 text-xs leading-6 text-muted">
              only feedback that actually says something counts — an empty or “na” form doesn’t —
              and reviewing the same person twice counts once. people on the same number share a position.
              “reviewed by” is shown but never ranked, because nobody chooses how many teammates review them.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

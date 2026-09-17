"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import {
  BrandPanel,
  Eyebrow,
  EmptyState,
  SectionHeading,
  SegmentedControl,
  StatPill,
} from "@/components/ui/brand"
import { SCREEN_ACCENTS, DATE_RANGE_LABELS, type DateRange } from "@/lib/brand"
import { getAvatarColor, getInitials } from "@/lib/insights-helpers"

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

export default function LeaderboardPage() {
  const [range, setRange] = useState<DateRange>("cycle")
  const [cohort, setCohort] = useState<CohortFilter>("everyone")
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async (next: DateRange) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leaderboard?range=${next}`, { cache: "no-store" })
      if (!res.ok) throw new Error("could not load the board")
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

  // Ranks come from the server over the whole roster, so filtering to a cohort
  // shows each person's real position rather than renumbering them 1..n.
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => cohort === "everyone" || r.cohort === cohort),
    [data, cohort]
  )

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-12 sm:pb-12">
        <SectionHeading
          accent={accent}
          eyebrow="leaderboard"
          title="who's giving feedback"
          description="counts how many teammates you've given feedback to. it's a participation board — nothing here is part of any performance decision."
        />

        <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <SegmentedControl ariaLabel="time range" options={RANGES} value={range} onChange={setRange} />
          <SegmentedControl ariaLabel="cohort" options={COHORTS} value={cohort} onChange={setCohort} />
        </div>

        {error && (
          <BrandPanel accent="pink" tone="washed" className="mt-6 p-6 text-sm text-[#d35b52]">
            {error}
          </BrandPanel>
        )}

        {loading && !data && (
          <p className="py-12 text-center text-sm text-muted">loading the board…</p>
        )}

        {data && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatPill accent={accent} label="window" value={data.windowLabel} />
              <StatPill accent={accent} label="people giving" value={`${data.totals.activeGivers}/${data.totals.people}`} />
              <StatPill accent={accent} label="reviews counted" value={data.totals.reviewsCounted} />
              <StatPill accent={accent} label="still need feedback" value={data.totals.noFeedbackYet} />
            </div>

            {data.needsFeedback.length > 0 && (
              <BrandPanel accent="peach" tone="washed" className="mt-6 p-5">
                <Eyebrow accent="peach">nobody has reviewed these teammates yet</Eyebrow>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.needsFeedback.map((person) => (
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
                <p className="mt-3 text-xs text-muted">
                  be the first to give them something to work with.
                </p>
              </BrandPanel>
            )}

            {rows.length === 0 ? (
              <EmptyState
                accent={accent}
                title="nobody here yet"
                description="no feedback has been given in this window."
              />
            ) : (
              <div className="mt-6 overflow-x-auto rounded-[22px] border border-line bg-white">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-black/[0.02] text-left text-[11px] font-semibold tracking-[0.08em] text-muted">
                      <th className="border-b border-line px-4 py-3 sm:px-6">#</th>
                      <th className="border-b border-line px-4 py-3 sm:px-6">name</th>
                      <th className="border-b border-line px-4 py-3 sm:px-6">teammates reviewed</th>
                      <th className="hidden border-b border-line px-4 py-3 sm:table-cell sm:px-6">streak</th>
                      <th className="hidden border-b border-line px-4 py-3 sm:table-cell sm:px-6">received</th>
                      <th className="hidden border-b border-line px-4 py-3 sm:table-cell sm:px-6">own reflections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.employeeId} className="transition-colors hover:bg-[rgba(188,173,204,0.10)]">
                        <td className="border-b border-line px-4 py-3 text-muted sm:px-6">{row.rank}</td>
                        <td className="border-b border-line px-4 py-3 sm:px-6">
                          <Link href={`/insights?employee=${row.employeeId}`} className="flex items-center gap-2.5">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ backgroundColor: getAvatarColor(row.name) }}
                            >
                              {getInitials(row.name)}
                            </span>
                            <span>
                              <span className="block font-semibold text-ink">{row.name}</span>
                              <span className="block text-[11px] text-muted">
                                {row.cohort === "probation" ? "on probation" : "full-timer"}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="border-b border-line px-4 py-3 sm:px-6">
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 text-lg font-bold tracking-[-0.03em] text-ink">{row.reviewed}</span>
                            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-black/[0.06]">
                              <span
                                className="block h-full rounded-full bg-[#bcadcc]"
                                style={{
                                  width: `${row.reachable > 0 ? Math.round((row.reviewed / row.reachable) * 100) : 0}%`,
                                }}
                              />
                            </span>
                            <span className="text-[11px] text-muted">of {row.reachable}</span>
                          </div>
                        </td>
                        <td className="hidden border-b border-line px-4 py-3 text-muted sm:table-cell sm:px-6">
                          {row.streak > 0 ? `${row.streak} cycle${row.streak === 1 ? "" : "s"}` : "—"}
                        </td>
                        <td className="hidden border-b border-line px-4 py-3 text-muted sm:table-cell sm:px-6">
                          {row.received}
                        </td>
                        <td className="hidden border-b border-line px-4 py-3 text-muted sm:table-cell sm:px-6">
                          {row.reflectionsFiled ? "filed" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 text-xs text-muted">
              only feedback that actually says something counts — an empty or “na” form doesn’t.
              reviewing the same person twice counts once. “received” is shown but never ranked,
              because nobody chooses how many teammates review them.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

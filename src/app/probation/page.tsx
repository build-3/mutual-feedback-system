"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Navbar from "@/components/Navbar"
import { BrandPanel, EmptyState, SectionHeading, badgeClasses } from "@/components/ui/brand"
import { SCREEN_ACCENTS } from "@/lib/brand"
import { contributionKeyToLabel, getAvatarColor, getInitials } from "@/lib/insights-helpers"
import { daysBetweenIso, todayIso } from "@/lib/probation-dates"
import { probationMonth, probationStage, type ProbationStage } from "@/lib/probation-stage"
import { REVIEW_GAP_CONFIG } from "@/lib/review-gap"

type Item = {
  id: string
  employee_id: string
  employee_name: string
  employee_email: string | null
  start_date: string
  end_date: string
  duration_months: number
  status: string
  promoted_at: string | null
  signal: string | null
  total_feedback_count: number
  avg_recommend_rating: number | null
  contribution_summary: { counts: Record<string, number>; most_common: string | null }
  sponsor_id: string | null
  sponsor_name: string | null
  buddy_id: string | null
  buddy_name: string | null
  full_time_reviewers: number
}

type Payload = { probations: Item[]; totalActive: number; canAct: boolean; canEditDates: boolean }

type Summary = { text?: string; loading?: boolean; error?: string; basedOn?: { reviews: number } }

const accent = SCREEN_ACCENTS.probation

const COLUMNS: { stage: ProbationStage; title: string; hint: string }[] = [
  { stage: "under_probation", title: "under probation", hint: "more than a month to go" },
  { stage: "eligible_for_review", title: "eligible for review", hint: "final month, or past the end date" },
  { stage: "full_time", title: "confirmed full time", hint: "confirmed in the last 90 days" },
]

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

function signalAccent(signal: string): "sage" | "peach" | "lavender" {
  if (signal.includes("High Signal") || signal.includes("Promoted")) return "sage"
  if (signal.includes("Needs Team Review")) return "peach"
  return "lavender"
}

function Stat({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={`text-sm font-semibold ${warn ? "text-[#d35b52]" : "text-ink"}`}>{children}</div>
    </div>
  )
}

export default function ProbationPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [denied, setDenied] = useState(false)
  const [query, setQuery] = useState("")
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

  async function summarise(probationId: string) {
    setSummaries((s) => ({ ...s, [probationId]: { loading: true } }))
    try {
      const res = await fetch("/api/admin/probation/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probationId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSummaries((s) => ({ ...s, [probationId]: { error: body.error ?? "could not summarise" } }))
        return
      }
      setSummaries((s) => ({
        ...s,
        [probationId]: { text: body.summary, basedOn: body.basedOn },
      }))
    } catch {
      setSummaries((s) => ({ ...s, [probationId]: { error: "network error" } }))
    }
  }

  const columns = useMemo(() => {
    const q = query.trim().toLowerCase()
    const items = (data?.probations ?? []).filter(
      (p) =>
        q === "" ||
        p.employee_name.toLowerCase().includes(q) ||
        (p.sponsor_name ?? "").toLowerCase().includes(q)
    )
    return COLUMNS.map((c) => ({
      ...c,
      items: items.filter(
        (p) =>
          probationStage({
            status: p.status,
            endDate: p.end_date,
            promotedAt: p.promoted_at,
            today,
          }) === c.stage
      ),
    }))
  }, [data, query, today])

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
          description="start and end dates, how far in, who has given feedback, how it reads, and who owns the conversation. the sponsor owns the probation conversation."
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
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="find a person or sponsor"
                aria-label="find a person or sponsor"
                className="w-full rounded-full border border-line bg-white px-4 py-2 text-sm text-ink sm:w-72"
              />
              <p className="text-sm text-muted">
                <span className="font-semibold text-ink">{data.totalActive}</span> on probation
                {noSponsor > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-[#d35b52]">{noSponsor}</span> with no sponsor
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
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {columns.map((col) => (
                <section key={col.stage} aria-label={col.title}>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-sm font-bold tracking-[-0.02em] text-ink">{col.title}</h2>
                    <span className="text-xs text-muted">{col.items.length}</span>
                  </div>
                  <p className="-mt-2 mb-3 text-[11px] text-muted">{col.hint}</p>

                  <div className="space-y-3">
                    {col.items.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                        nobody here
                      </p>
                    )}
                    {col.items.map((p) => {
                      const isOpen = p.status === "active" || p.status === "extended"
                      const daysLeft = daysBetweenIso(today, p.end_date)
                      const { month, of } = probationMonth({
                        startDate: p.start_date,
                        today,
                        durationMonths: p.duration_months,
                      })
                      const thin = isOpen && p.full_time_reviewers < REVIEW_GAP_CONFIG.minFullTimers
                      const summary = summaries[p.id]

                      return (
                        <BrandPanel key={p.id} accent={accent} tone="soft" className="p-4">
                          <div className="flex items-start gap-3">
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                              style={{ backgroundColor: getAvatarColor(p.employee_name) }}
                            >
                              {getInitials(p.employee_name)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-ink">{p.employee_name}</div>
                              {p.employee_email && (
                                <div className="truncate text-[11px] text-muted">{p.employee_email}</div>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {p.status === "extended" && (
                              <span {...badgeClasses({ accent: "peach", tone: "soft" })}>extended</span>
                            )}
                            {isOpen && daysLeft < 0 && (
                              <span {...badgeClasses({ accent: "pink", tone: "soft" })}>overdue</span>
                            )}
                            {isOpen && !p.sponsor_id && (
                              <span {...badgeClasses({ accent: "peach", tone: "soft" })}>no sponsor</span>
                            )}
                            {p.signal && (
                              <span {...badgeClasses({ accent: signalAccent(p.signal), tone: "soft" })}>
                                {p.signal}
                              </span>
                            )}
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <Stat label="started">{formatDate(p.start_date)}</Stat>
                            <Stat label="ends">{formatDate(p.end_date)}</Stat>
                            {isOpen && (
                              <Stat label="how far in">
                                month {month} of {of}
                              </Stat>
                            )}
                            {isOpen && (
                              <Stat label="time left" warn={daysLeft <= 14}>
                                {daysLeft > 0
                                  ? `${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                                  : daysLeft === 0
                                  ? "ends today"
                                  : `${-daysLeft} day${daysLeft === -1 ? "" : "s"} over`}
                              </Stat>
                            )}
                            <Stat label="feedback received">{p.total_feedback_count}</Stat>
                            <Stat label="from full-timers" warn={thin}>
                              {p.full_time_reviewers} of {REVIEW_GAP_CONFIG.minFullTimers}
                              {thin ? " needed" : ""}
                            </Stat>
                            <Stat label="team score">
                              {p.avg_recommend_rating !== null ? `${p.avg_recommend_rating}/5` : "no score yet"}
                            </Stat>
                          </div>

                          {Object.keys(p.contribution_summary.counts).length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-muted">seen as:</span>
                              {Object.entries(p.contribution_summary.counts)
                                .sort((a, b) => b[1] - a[1])
                                .map(([k, v]) => (
                                  <span
                                    key={k}
                                    className="inline-flex items-center gap-1 rounded-full border border-line bg-white/80 px-2 py-0.5 text-[11px]"
                                  >
                                    <span className="font-medium text-ink">{contributionKeyToLabel(k)}</span>
                                    <span className="text-muted">×{v}</span>
                                  </span>
                                ))}
                            </div>
                          )}

                          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line/60 pt-3">
                            <Stat label="sponsor">{p.sponsor_name ?? "none yet"}</Stat>
                            <Stat label="buddy">{p.buddy_name ?? "none yet"}</Stat>
                          </div>

                          <div className="mt-3 border-t border-line/60 pt-3">
                            {summary?.text ? (
                              <div className="rounded-xl bg-white/70 p-3">
                                <div className="mb-1 text-[11px] font-medium text-muted">
                                  ai summary · {summary.basedOn?.reviews ?? 0}{" "}
                                  review{summary.basedOn?.reviews === 1 ? "" : "s"}
                                </div>
                                <p className="whitespace-pre-line text-xs leading-5 text-ink">{summary.text}</p>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={summary?.loading || p.total_feedback_count === 0}
                                onClick={() => summarise(p.id)}
                                className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {summary?.loading
                                  ? "summarising…"
                                  : p.total_feedback_count === 0
                                  ? "no feedback to summarise"
                                  : "summarise their feedback"}
                              </button>
                            )}
                            {summary?.error && (
                              <p className="mt-1 text-[11px] text-[#d35b52]">{summary.error}</p>
                            )}
                          </div>

                          <div className="mt-3">
                            <Link
                              href={`/insights?employee=${p.employee_id}`}
                              className="text-xs font-semibold text-ink underline"
                            >
                              open the full card →
                            </Link>
                            <span className="ml-1 text-[11px] text-muted">
                              {data.canAct && isOpen ? "(promote or extend there)" : ""}
                            </span>
                          </div>
                        </BrandPanel>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

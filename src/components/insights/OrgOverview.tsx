"use client"

import { memo, useState } from "react"
import { timeAgo } from "@/lib/date-utils"
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts"
import { SubmissionWithDetails } from "@/app/insights/types"
import { OrgMetrics } from "@/hooks/useOrgInsights"
import { Employee } from "@/lib/types"
import { CHART_COLORS, getAccentTheme, type Accent } from "@/lib/brand"
import { getScoreColor } from "@/lib/insights-helpers"
import {
  BrandPanel,
  EmptyState,
  Eyebrow,
  SectionHeading,
  StatPill,
  buttonClasses,
} from "@/components/ui/brand"
import ChartContainer from "./ChartContainer"
import FeedbackTimeline from "./FeedbackTimeline"
import type { FeedbackResponse } from "@/lib/types"

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid rgba(29, 29, 27, 0.08)",
  borderRadius: "18px",
  fontSize: "12px",
}

interface Props {
  orgMetrics: OrgMetrics
  build3Submissions?: SubmissionWithDetails[]
  employees?: Employee[]
  responsesByAnswer?: Record<string, (FeedbackResponse & { responderName: string })[]>
  currentUser?: { id: string; name: string } | null
  onResponseSaved?: () => void
  /** e.g. "14 jul – 10 aug". null when viewing all time. */
  cycleLabel?: string | null
  onViewPreviousCycle?: () => void
}

function NpsBar({
  promoters,
  passives,
  detractors,
}: {
  promoters: number
  passives: number
  detractors: number
}) {
  const total = promoters + passives + detractors
  if (total === 0) {
    return <div className="h-3 rounded-full bg-black/[0.06]" />
  }

  const detractorPct = (detractors / total) * 100
  const passivePct = (passives / total) * 100
  const promoterPct = (promoters / total) * 100

  return (
    <div className="mt-3 flex h-3 overflow-hidden rounded-full">
      {detractorPct > 0 && (
        <div style={{ width: `${detractorPct}%`, backgroundColor: CHART_COLORS.danger }} />
      )}
      {passivePct > 0 && (
        <div style={{ width: `${passivePct}%`, backgroundColor: CHART_COLORS.secondary }} />
      )}
      {promoterPct > 0 && (
        <div style={{ width: `${promoterPct}%`, backgroundColor: CHART_COLORS.success }} />
      )}
    </div>
  )
}

// Attribution names are shown via title= (hover) which is unreachable on touch.
// NpsSegmentLabel adds a tap-to-toggle popover alongside the hover tooltip so
// touch users can also see who's in each segment.
function NpsSegmentLabel({
  segmentKey,
  names,
  label,
  openSegment,
  setOpenSegment,
}: {
  segmentKey: string
  names: string[]
  label: string
  openSegment: string | null
  setOpenSegment: (key: string | null) => void
}) {
  const isOpen = openSegment === segmentKey

  return (
    <span
      title={names.join(", ") || "no one"}
      className="relative cursor-help"
      onClick={(e) => {
        e.stopPropagation()
        setOpenSegment(isOpen ? null : segmentKey)
      }}
    >
      {label}
      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[10rem] rounded-lg border border-black/[0.06] bg-white px-3 py-2 shadow-lg">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {label}
          </p>
          {names.length > 0 ? (
            names.map((name, i) => (
              <p key={i} className="text-xs font-medium text-ink">
                {name}
              </p>
            ))
          ) : (
            <p className="text-xs font-medium text-ink">no one</p>
          )}
        </div>
      )}
    </span>
  )
}

function getContributionRows(distribution: Record<string, number>) {
  const rows = [
    { label: "finding their feet", match: ["a", "finding"], color: CHART_COLORS.neutral },
    { label: "reliable support", match: ["b", "reliable"], color: CHART_COLORS.primary },
    { label: "independent contributor", match: ["c", "independent"], color: CHART_COLORS.success },
    { label: "leader", match: ["d", "leader"], color: CHART_COLORS.secondary },
  ]

  return rows
    .map((row) => {
      let value = 0
      for (const [key, count] of Object.entries(distribution)) {
        const normalized = key.toLowerCase()
        if (row.match.some((token) => normalized.includes(token))) value += count
      }

      return { ...row, value }
    })
    .filter((row) => row.value > 0)
}

export default memo(function OrgOverview({
  orgMetrics,
  build3Submissions = [],
  employees = [],
  responsesByAnswer = {},
  currentUser = null,
  onResponseSaved,
  cycleLabel = null,
  onViewPreviousCycle,
}: Props) {
  const employeeNameMap = new Map(employees.map((e) => [e.id, e.name]))
  const [openNpsSegment, setOpenNpsSegment] = useState<string | null>(null)
  const [openContributionRow, setOpenContributionRow] = useState<string | null>(null)
  const {
    totalEmployees,
    totalSubmissions,
    avgTrustBattery,
    avgPurposeAlignment,
    contributionDistribution,
    employeesWithFeedback,
    recentActivity,
    tealAvg,
    npsBreakdown,
    valueStrengthCounts,
    valueImprovementCounts,
    feedbackByType,
    avgMetricsMap,
  } = orgMetrics

  const adhocCount = feedbackByType["adhoc"] || 0
  const adhocAvg = avgMetricsMap["adhoc_rating"] ?? null

  const participationPct =
    totalEmployees > 0
      ? Math.round((employeesWithFeedback / totalEmployees) * 100)
      : 0

  const { promoters, passives, detractors, npsScore } = npsBreakdown

  // Computed once. This expression used to be duplicated verbatim in the stat
  // pill and the hero panel, which is how the page ended up rendering NPS twice.
  const npsLabel =
    npsScore === null ? "n/a" : npsScore > 0 ? `+${npsScore}` : String(npsScore)

  const contributionRows = getContributionRows(contributionDistribution)
  // Hoisted — this was recomputed inside the row .map on every row.
  const contributionTotal = contributionRows.reduce((sum, item) => sum + item.value, 0)
  const contributionByLevel = orgMetrics.contributionAttribution?.byLevel ?? {}

  const allValueKeys = Array.from(
    new Set([
      ...Object.keys(valueStrengthCounts),
      ...Object.keys(valueImprovementCounts),
    ])
  ).sort()

  const valueAlignmentData = allValueKeys
    .map((key) => ({
      name: key,
      strength: valueStrengthCounts[key] || 0,
      improvement: valueImprovementCounts[key] || 0,
    }))
    .filter((row) => row.strength > 0 || row.improvement > 0)

  // Lifted out of an inline IIFE in the JSX — the only one in the file.
  const teamActivityItems = recentActivity.filter(
    (item) => item.submission.feedback_type !== "build3"
  )

  return (
    <div
      className="space-y-6"
      onClick={() => {
        setOpenNpsSegment(null)
        setOpenContributionRow(null)
      }}
    >
      {/* §A — the window first, because with cycles the honest answer is
          sometimes "nothing yet". Absorbs the old participation pill. */}
      <SectionHeading
        accent="sky"
        eyebrow={cycleLabel ? `org overview · ${cycleLabel}` : "org overview · all time"}
        title="what the team is telling us"
        description={
          totalSubmissions === 0
            ? "a broad read across participation, health, and the notes people are actually leaving behind."
            : `${totalSubmissions} submissions · ${employeesWithFeedback} of ${totalEmployees} people gave build3 feedback (${participationPct}%).`
        }
      />

      {/* An empty cycle is expected, not a collapse: the window opens on the
          session Tuesday and fills up afterwards. Say that once, with a way
          back, instead of rendering a heading over a row of n/a and five
          sections that each silently vanish. */}
      {totalSubmissions === 0 ? (
        <EmptyState
          accent="sky"
          title={cycleLabel ? "this cycle is still empty" : "no feedback recorded yet"}
          description={
            cycleLabel
              ? `nothing has landed in ${cycleLabel} yet. that's expected — a cycle opens on the second tuesday and fills up as people submit.`
              : "once people start submitting feedback, the org picture will build up here."
          }
          action={
            onViewPreviousCycle && cycleLabel ? (
              <button
                type="button"
                onClick={onViewPreviousCycle}
                {...buttonClasses({ accent: "sky", variant: "solid", size: "sm" })}
              >
                look at the previous cycle
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
      {/* §B — signal row. NPS moved out (it has a hero panel below, and this
          pill rendered the identical number); purpose alignment moved into
          "how the team is doing" beside evolutionary purpose, where the two
          can be told apart. */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 sm:grid-cols-3">
        <StatPill
          accent="sage"
          label="trust battery"
          value={avgTrustBattery !== null ? Math.round(avgTrustBattery) : "n/a"}
          detail={avgTrustBattery !== null ? "average out of 100" : "not enough data yet"}
        />
        <StatPill
          accent="lavender"
          label="participation"
          value={`${participationPct}%`}
          detail={`${employeesWithFeedback} of ${totalEmployees} gave build3 feedback`}
        />
        {adhocCount > 0 && (
          <StatPill
            accent="pink"
            label="adhoc notes"
            value={adhocCount}
            detail={adhocAvg !== null ? `avg score ${adhocAvg.toFixed(1)} / 5` : `${adhocCount} quick notes`}
          />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <BrandPanel accent="sky" tone="soft" className="brand-lines p-5 sm:p-6">
          <Eyebrow accent="sky">nps pulse</Eyebrow>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div
                className="text-4xl sm:text-6xl font-bold tracking-[-0.09em]"
                style={{
                  color:
                    npsScore === null
                      ? CHART_COLORS.neutral
                      : npsScore >= 30
                      ? CHART_COLORS.success
                      : npsScore >= 0
                      ? CHART_COLORS.secondary
                      : CHART_COLORS.danger,
                }}
              >
                {npsLabel}
              </div>
              <div className="mt-1 text-sm text-muted">
                {npsScore !== null ? "team recommendation score." : "not enough data yet"}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <NpsBar
                promoters={promoters}
                passives={passives}
                detractors={detractors}
              />
              <div className="mt-3 flex flex-wrap gap-4 text-xs tracking-[0.08em] text-muted">
                {npsScore !== null ? (
                  <>
                    <NpsSegmentLabel
                      segmentKey="detractors"
                      names={npsBreakdown.detractorNames}
                      label={`${detractors} detractors`}
                      openSegment={openNpsSegment}
                      setOpenSegment={setOpenNpsSegment}
                    />
                    <NpsSegmentLabel
                      segmentKey="passives"
                      names={npsBreakdown.passiveNames}
                      label={`${passives} passives`}
                      openSegment={openNpsSegment}
                      setOpenSegment={setOpenNpsSegment}
                    />
                    <NpsSegmentLabel
                      segmentKey="promoters"
                      names={npsBreakdown.promoterNames}
                      label={`${promoters} promoters`}
                      openSegment={openNpsSegment}
                      setOpenSegment={setOpenNpsSegment}
                    />
                  </>
                ) : (
                  <span>n/a</span>
                )}
              </div>
            </div>
          </div>
        </BrandPanel>

        {/* §D — "purpose fit" (people → build3) used to be a stat pill two rows
            above "evolutionary purpose" (build3's own direction). Both are out
            of 5 and the labels read almost identically, so they were routinely
            mistaken for each other. Side by side with a stated direction, the
            difference is legible. */}
        {(tealAvg.selfManagement !== null ||
          tealAvg.wholeness !== null ||
          tealAvg.purpose !== null ||
          avgPurposeAlignment !== null) && (
          <BrandPanel accent="sage" tone="soft" className="brand-lines p-5 sm:p-6">
            <Eyebrow accent="sage">team health</Eyebrow>
            <h3 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-ink">
              how the team is doing
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              averages out of 5, from peer reviews and org feedback.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
              {[
                {
                  label: "self-management",
                  hint: "owns outcomes without waiting for permission",
                  value: tealAvg.selfManagement,
                  accent: "sage" as Accent,
                },
                {
                  label: "wholeness",
                  hint: "brings their whole self to work",
                  value: tealAvg.wholeness,
                  accent: "lavender" as Accent,
                },
                {
                  label: "purpose fit",
                  hint: "how well build3 matches people's own sense of purpose",
                  value: avgPurposeAlignment,
                  accent: "peach" as Accent,
                },
                {
                  label: "evolutionary purpose",
                  hint: "how well people move with where build3 is heading",
                  value: tealAvg.purpose,
                  accent: "sky" as Accent,
                },
              ].map((item) => {
                const theme = getAccentTheme(item.accent)

                return (
                  <div
                    key={item.label}
                    title={item.hint}
                    className="rounded-[16px] sm:rounded-[22px] border p-3 sm:p-4 text-center"
                    style={{ backgroundColor: theme.soft, borderColor: theme.border }}
                  >
                    <div
                      className="text-2xl sm:text-3xl font-bold tracking-[-0.08em]"
                      style={{
                        color:
                          item.value !== null
                            ? getScoreColor(item.value, "1-5")
                            : CHART_COLORS.neutral,
                      }}
                    >
                      {item.value !== null ? item.value.toFixed(1) : "n/a"}
                    </div>
                    <div className="mt-1 text-xs tracking-[0.08em] text-muted leading-snug">
                      {item.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </BrandPanel>
        )}
      </div>

      {valueAlignmentData.length > 0 && (
        <BrandPanel accent="peach" tone="soft" className="brand-lines p-5 sm:p-6">
          <Eyebrow accent="peach">value mentions</Eyebrow>
          <h3 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-ink">
            what people call out most
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            strength mentions vs. improvement mentions across the build3 values.
          </p>
          {/* The wrapper owns height; ChartContainer defaults to 100% of it.
              Previously both declared it, and the explicit height="100%" was
              just restating the default. */}
          <div className="mt-5 h-[200px] sm:h-[240px]">
            <ChartContainer>
              <BarChart
                data={valueAlignmentData}
                margin={{ top: 0, right: 8, left: -20, bottom: 0 }}
                layout="vertical"
              >
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#9d9b9a" }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: "#1d1d1b" }} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="strength" name="strength" fill={CHART_COLORS.success} radius={[0, 8, 8, 0]} barSize={10} />
                <Bar dataKey="improvement" name="improvement" fill={CHART_COLORS.secondary} radius={[0, 8, 8, 0]} barSize={10} />
              </BarChart>
            </ChartContainer>
          </div>
        </BrandPanel>
      )}

      {/* §F — the verbatim behind the chart above. Aggregate, then raw: the
          value-mentions chart says *which* values get called out, and this is
          what people actually wrote. A peer-review metric used to sit between
          the two. */}
      {build3Submissions.length > 0 && (
        <FeedbackTimeline
          submissions={build3Submissions}
          title="feedback to build3"
          responsesByAnswer={responsesByAnswer}
          currentUser={currentUser}
          onResponseSaved={onResponseSaved}
        />
      )}

      {/* §G — supporting context, not headline: this is a peer-review metric on
          a page about what the team is telling build3. */}
      {contributionRows.length > 0 && (
        <BrandPanel accent="lavender" tone="soft" className="brand-lines p-5 sm:p-6">
          <Eyebrow accent="lavender">contribution spread</Eyebrow>
          <h3 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-ink">
            where people are in their growth
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            how peers rated each other&apos;s level of contribution. tap a row to see who rated whom.
          </p>
          <div className="mt-5 space-y-4">
            {contributionRows.map((row) => {
              const pct = contributionTotal > 0 ? Math.round((row.value / contributionTotal) * 100) : 0
              const attribution = contributionByLevel[row.label] ?? []
              const tooltip = attribution
                .map((a) => `${a.raterName} → ${a.targetName}`)
                .join("\n")
              const isOpen = openContributionRow === row.label

              return (
                <div
                  key={row.label}
                  className="relative"
                  title={tooltip || undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenContributionRow(isOpen ? null : row.label)
                  }}
                >
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold capitalize text-ink">{row.label}</span>
                    <span className="text-muted">
                      {row.value} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: row.color }}
                    />
                  </div>
                  {isOpen && attribution.length > 0 && (
                    <div className="absolute left-0 top-full z-10 mt-1 max-w-xs rounded-lg border border-black/[0.06] bg-white px-3 py-2 shadow-lg">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        rated by
                      </p>
                      {attribution.map((a, i) => (
                        <p key={i} className="text-xs font-medium text-ink">
                          {a.raterName} → {a.targetName}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </BrandPanel>
      )}

      {/* §H — team activity. Wrapped in a panel so it stops being the only bare
          div on the page. */}
      {teamActivityItems.length > 0 && (
          <BrandPanel accent="sky" tone="washed" className="p-5 sm:p-6">
            <Eyebrow accent="sky">team activity</Eyebrow>
            <p className="mt-2 text-sm leading-6 text-muted">
              the most recent peer notes, self reflections, and quick notes.
            </p>
            <div className="mt-4 divide-y divide-line/60">
              {teamActivityItems.map((item) => {
                const type = item.submission.feedback_type
                const forId = item.submission.feedback_for_id
                const forName = forId ? employeeNameMap.get(forId) : null

                let action: string
                if (type === "self") {
                  action = "logged a self reflection"
                } else if (type === "adhoc" && forName) {
                  action = `left a quick note on ${forName}`
                } else if (forName) {
                  action = `gave feedback on ${forName}`
                } else {
                  action = "submitted feedback"
                }

                return (
                  <div
                    key={item.submission.id}
                    className="flex items-center justify-between py-3"
                  >
                    <p className="text-sm text-ink">
                      <span className="font-semibold">{item.submitterName}</span>
                      <span className="text-muted"> {action}</span>
                    </p>
                    <span className="shrink-0 text-xs tracking-[0.06em] text-muted/60">
                      {timeAgo(new Date(item.submission.created_at))}
                    </span>
                  </div>
                )
              })}
            </div>
          </BrandPanel>
      )}
        </>
      )}
    </div>
  )
})

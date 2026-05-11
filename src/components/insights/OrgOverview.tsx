"use client"

import { memo } from "react"
import { timeAgo } from "@/lib/date-utils"
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts"
import { SubmissionWithDetails } from "@/app/insights/types"
import { OrgMetrics } from "@/hooks/useOrgInsights"
import { Employee } from "@/lib/types"
import { CHART_COLORS } from "@/lib/brand"
import { getScoreColor } from "@/lib/insights-helpers"
import {
  BrandPanel,
  Eyebrow,
  SectionHeading,
  StatPill,

} from "@/components/ui/brand"
import ChartContainer from "./ChartContainer"

const ACCENT_COLORS: Record<string, { bg: string; border: string }> = {
  sage: { bg: "rgba(121, 192, 166, 0.18)", border: "rgba(121, 192, 166, 0.35)" },
  lavender: { bg: "rgba(188, 173, 204, 0.2)", border: "rgba(188, 173, 204, 0.38)" },
  sky: { bg: "rgba(198, 229, 248, 0.25)", border: "rgba(198, 229, 248, 0.45)" },
}

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
  onSelectBuild3Submission?: (submissionId: string) => void
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
  onSelectBuild3Submission,
}: Props) {
  const employeeNameMap = new Map(employees.map((e) => [e.id, e.name]))
  const {
    totalEmployees,
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
  const contributionRows = getContributionRows(contributionDistribution)
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

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="sky"
        eyebrow="org overview"
        title="what the team is telling us"
        description="a broad read across participation, health, and the notes people are actually leaving behind."
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <StatPill
          accent="sky"
          label="nps"
          value={npsScore > 0 ? `+${npsScore}` : npsScore}
          detail={`${promoters} promoters, ${passives} passives, ${detractors} detractors`}
        />
        <StatPill
          accent="sage"
          label="trust battery"
          value={avgTrustBattery !== null ? Math.round(avgTrustBattery) : "n/a"}
          detail={avgTrustBattery !== null ? "average out of 100" : "not enough data yet"}
        />
        <StatPill
          accent="peach"
          label="purpose alignment"
          value={avgPurposeAlignment !== null ? avgPurposeAlignment.toFixed(1) : "n/a"}
          detail={avgPurposeAlignment !== null ? "average out of 5" : "not enough data yet"}
        />
        <StatPill
          accent="lavender"
          label="participation"
          value={`${participationPct}%`}
          detail={`${employeesWithFeedback} of ${totalEmployees} people gave build3 feedback`}
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
                    npsScore >= 30
                      ? CHART_COLORS.success
                      : npsScore >= 0
                      ? CHART_COLORS.secondary
                      : CHART_COLORS.danger,
                }}
              >
                {npsScore > 0 ? `+${npsScore}` : npsScore}
              </div>
              <div className="mt-1 text-sm text-muted">team recommendation score.</div>
            </div>
            <div className="min-w-0 flex-1">
              <NpsBar
                promoters={promoters}
                passives={passives}
                detractors={detractors}
              />
              <div className="mt-3 flex flex-wrap gap-4 text-xs tracking-[0.08em] text-muted">
                <span
                  title={npsBreakdown.detractorNames.join(", ") || "no one"}
                  className="cursor-help"
                >
                  {detractors} detractors
                </span>
                <span
                  title={npsBreakdown.passiveNames.join(", ") || "no one"}
                  className="cursor-help"
                >
                  {passives} passives
                </span>
                <span
                  title={npsBreakdown.promoterNames.join(", ") || "no one"}
                  className="cursor-help"
                >
                  {promoters} promoters
                </span>
              </div>
              {(npsBreakdown.promoterNames.length +
                npsBreakdown.passiveNames.length +
                npsBreakdown.detractorNames.length) > 0 && (
                <div className="mt-4 space-y-2 text-xs">
                  {npsBreakdown.promoterNames.length > 0 && (
                    <div>
                      <span className="font-semibold text-ink">promoters:</span>{" "}
                      <span className="text-muted">{npsBreakdown.promoterNames.join(", ")}</span>
                    </div>
                  )}
                  {npsBreakdown.passiveNames.length > 0 && (
                    <div>
                      <span className="font-semibold text-ink">passives:</span>{" "}
                      <span className="text-muted">{npsBreakdown.passiveNames.join(", ")}</span>
                    </div>
                  )}
                  {npsBreakdown.detractorNames.length > 0 && (
                    <div>
                      <span className="font-semibold text-ink">detractors:</span>{" "}
                      <span className="text-muted">{npsBreakdown.detractorNames.join(", ")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </BrandPanel>

        {(tealAvg.selfManagement !== null ||
          tealAvg.wholeness !== null ||
          tealAvg.purpose !== null) && (
          <BrandPanel accent="sage" tone="soft" className="brand-lines p-5 sm:p-6">
            <Eyebrow accent="sage">team health</Eyebrow>
            <div className="mt-5 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3 sm:gap-3">
              {[
                {
                  label: "self-management",
                  value: tealAvg.selfManagement,
                  accent: "sage" as const,
                },
                {
                  label: "wholeness",
                  value: tealAvg.wholeness,
                  accent: "lavender" as const,
                },
                {
                  label: "evolutionary purpose",
                  value: tealAvg.purpose,
                  accent: "sky" as const,
                },
              ].map((item) => {
                const palette = ACCENT_COLORS[item.accent]

                return (
                  <div
                    key={item.label}
                    className="rounded-[16px] sm:rounded-[22px] border p-3 sm:p-4 text-center"
                    style={{ backgroundColor: palette.bg, borderColor: palette.border }}
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
                    <div className="mt-1 text-xs tracking-[0.08em] text-muted">
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
          <div className="mt-5 h-[200px] sm:h-[240px]">
            <ChartContainer height="100%">
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

      {contributionRows.length > 0 && (
        <BrandPanel accent="lavender" tone="soft" className="brand-lines p-5 sm:p-6">
          <Eyebrow accent="lavender">contribution spread</Eyebrow>
          <div className="mt-5 space-y-4">
            {contributionRows.map((row) => {
              const total = contributionRows.reduce((sum, item) => sum + item.value, 0)
              const pct = total > 0 ? Math.round((row.value / total) * 100) : 0
              const attribution = contributionByLevel[row.label] ?? []

              return (
                <div key={row.label}>
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
                  {attribution.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-[11px] leading-5 text-muted">
                      {attribution.map((a, idx) => (
                        <li key={`${row.label}-${idx}`}>
                          <span className="text-ink">{a.raterName}</span>
                          <span> → </span>
                          <span>{a.targetName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </BrandPanel>
      )}

      {/* ── org activity (build3 feedback) ── */}
      {build3Submissions.length > 0 && (
        <div className="mt-2">
          <Eyebrow accent="peach">org activity</Eyebrow>
          <div className="mt-4 divide-y divide-line/60">
            {build3Submissions.slice(0, 10).map((item) => {
              const clickable = !!onSelectBuild3Submission
              const content = (
                <>
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{item.submitterName}</span>
                    <span className="text-muted"> gave feedback to build3</span>
                  </p>
                  <span className="shrink-0 text-xs tracking-[0.06em] text-muted/60">
                    {timeAgo(new Date(item.submission.created_at))}
                  </span>
                </>
              )
              if (clickable) {
                return (
                  <button
                    key={item.submission.id}
                    type="button"
                    onClick={() => onSelectBuild3Submission?.(item.submission.id)}
                    className="flex w-full items-center justify-between py-3 text-left transition-colors hover:bg-black/[0.03]"
                  >
                    {content}
                  </button>
                )
              }
              return (
                <div
                  key={item.submission.id}
                  className="flex items-center justify-between py-3"
                >
                  {content}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── team activity (peer, self, adhoc) ── */}
      {(() => {
        const teamItems = recentActivity.filter(
          (item) => item.submission.feedback_type !== "build3"
        )
        if (teamItems.length === 0) return null

        return (
          <div className="mt-2">
            <Eyebrow accent="sky">team activity</Eyebrow>
            <div className="mt-4 divide-y divide-line/60">
              {teamItems.map((item) => {
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
          </div>
        )
      })()}
    </div>
  )
})

"use client"

import { memo } from "react"
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
} from "recharts"
import { NumericMetric } from "@/hooks/useEmployeeInsights"
import { CHART_COLORS } from "@/lib/brand"
import { getScoreColor } from "@/lib/insights-helpers"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"
import ChartContainer from "./ChartContainer"

interface Props {
  metrics: Record<string, NumericMetric>
  orgAvgMetrics?: Record<string, number>
}

const DIMENSIONS = [
  { key: "teal_self_management", label: "Self-Management" },
  { key: "teal_wholeness", label: "Wholeness" },
  { key: "teal_evolutionary_purpose", label: "Evo. Purpose" },
  { key: "itp_humble", label: "Humble" },
  { key: "itp_hungry", label: "Hungry" },
  { key: "itp_smart", label: "People-Smart" },
]

export default memo(function CompetencyRadar({ metrics, orgAvgMetrics }: Props) {
  // Only show dimensions that have actual data — full_timer only has teal,
  // interns have both teal + ITP
  const activeDimensions = DIMENSIONS.filter((d) => metrics[d.key]?.count > 0)
  if (activeDimensions.length === 0) return null

  const data = activeDimensions.map((dimension) => ({
    dimension: dimension.label,
    score: metrics[dimension.key]?.avg ?? 0,
    benchmark: 5,
    orgAvg: orgAvgMetrics?.[dimension.key] ?? null,
  }))

  return (
    <BrandPanel accent="sky" tone="soft" className="brand-lines p-4 sm:p-5">
      <Eyebrow accent="sky">competency map</Eyebrow>

      <h3 className="mt-2 text-lg font-bold tracking-[-0.04em] text-ink">
        how this person shows up
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        a quick read on core teal and team-player signals.
      </p>

      <div className="mt-4 h-[260px]">
        <ChartContainer height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="73%">
            <PolarGrid stroke="rgba(29, 29, 27, 0.1)" />
            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "#5f5b58" }} />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{ fontSize: 10, fill: "#9d9b9a" }}
              tickCount={6}
            />
            <Radar
              name="cap"
              dataKey="benchmark"
              stroke="rgba(29, 29, 27, 0.18)"
              fill="transparent"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            {orgAvgMetrics && (
              <Radar
                name="team avg"
                dataKey="orgAvg"
                stroke={CHART_COLORS.primary}
                fill={CHART_COLORS.primary}
                fillOpacity={0.16}
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}
            <Radar
              name="score"
              dataKey="score"
              stroke={CHART_COLORS.secondary}
              fill={CHART_COLORS.secondary}
              fillOpacity={0.34}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid rgba(29, 29, 27, 0.08)",
                borderRadius: "18px",
                fontSize: "13px",
              }}
              formatter={(value) => [Number(value).toFixed(2), "average"]}
            />
          </RadarChart>
        </ChartContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {data
          .filter((dimension) => dimension.score > 0)
          .map((dimension) => (
            <span
              key={dimension.dimension}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: "rgba(198, 229, 248, 0.16)",
                borderColor: "rgba(198, 229, 248, 0.5)",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getScoreColor(dimension.score, "1-5") }}
              />
              <span className="text-muted">{dimension.dimension}</span>
              <span className="text-ink">{dimension.score.toFixed(1)}</span>
            </span>
          ))}
      </div>
    </BrandPanel>
  )
})

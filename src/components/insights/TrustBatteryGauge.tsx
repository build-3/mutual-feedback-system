"use client"

import { memo } from "react"
import { Cell, Pie, PieChart } from "recharts"
import { NumericMetric } from "@/hooks/useEmployeeInsights"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"
import { getScoreColor } from "@/lib/insights-helpers"
import ChartContainer from "./ChartContainer"

interface Props {
  metrics: Record<string, NumericMetric>
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "strong"
  if (score >= 60) return "healthy"
  if (score >= 40) return "neutral"
  if (score >= 20) return "low"
  return "critical"
}

export default memo(function TrustBatteryGauge({ metrics }: Props) {
  const metric = metrics["trust_battery"]
  if (!metric || metric.count === 0) return null

  const score = Math.round(metric.avg)
  const color = getScoreColor(score, "0-100")

  // Show the actual score fill, the baseline marker at 50, and empty remainder
  const data = [
    { value: score, color },
    { value: 100 - score, color: "rgba(29, 29, 27, 0.06)" },
  ]

  // Direction indicator
  const direction = score > 50 ? "above" : score < 50 ? "below" : "at"

  return (
    <BrandPanel accent="sage" tone="soft" className="brand-lines p-5 sm:p-6">
      <Eyebrow accent="sage">trust battery</Eyebrow>

      <h3 className="mt-2 text-lg font-bold tracking-[-0.04em] text-ink">
        current charge
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        everyone starts at 50. moves with each interaction.
      </p>

      <div className="relative mt-4 h-[160px] sm:h-[180px]">
        <ChartContainer height="100%">
          <PieChart>
            <Pie
              data={data}
              startAngle={180}
              endAngle={0}
              cx="50%"
              cy="82%"
              innerRadius="60%"
              outerRadius="88%"
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        {/* Tick marks with labels */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 200 210">
          {[25, 50, 75].map((pct) => {
            const angle = (180 - pct * 1.8) * (Math.PI / 180)
            const centerX = 100
            const centerY = 172
            const outerRadius = 82
            const innerRadius = 65
            const x1 = centerX + outerRadius * Math.cos(angle)
            const y1 = centerY - outerRadius * Math.sin(angle)
            const x2 = centerX + innerRadius * Math.cos(angle)
            const y2 = centerY - innerRadius * Math.sin(angle)
            const isMidpoint = pct === 50

            // Label position — further out
            const labelRadius = 92
            const lx = centerX + labelRadius * Math.cos(angle)
            const ly = centerY - labelRadius * Math.sin(angle)

            return (
              <g key={pct}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isMidpoint ? "rgba(29, 29, 27, 0.5)" : "rgba(29, 29, 27, 0.2)"}
                  strokeWidth={isMidpoint ? 2 : 1}
                  strokeDasharray={isMidpoint ? "4 2" : "none"}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isMidpoint ? "rgba(29, 29, 27, 0.55)" : "rgba(29, 29, 27, 0.3)"}
                  fontSize={isMidpoint ? 11 : 9}
                  fontWeight={isMidpoint ? 600 : 400}
                >
                  {pct}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-end pb-6">
          <span className="text-5xl font-bold tracking-[-0.08em]" style={{ color }}>
            {score}
          </span>
          <span className="mt-0.5 text-[11px] font-semibold tracking-[0.06em]" style={{ color }}>
            {getScoreLabel(score)} · {direction} baseline
          </span>
        </div>
      </div>

      <div className="text-sm text-muted">
        averaged across {metric.count} {metric.count === 1 ? "reviewer" : "reviewers"}.
      </div>
    </BrandPanel>
  )
})

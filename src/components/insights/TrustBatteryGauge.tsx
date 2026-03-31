"use client"

import { Cell, Pie, PieChart } from "recharts"
import { NumericMetric } from "@/hooks/useEmployeeInsights"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"
import { getScoreColor } from "@/lib/insights-helpers"
import ChartContainer from "./ChartContainer"

interface Props {
  metrics: Record<string, NumericMetric>
}

export default function TrustBatteryGauge({ metrics }: Props) {
  const metric = metrics["trust_battery"]
  if (!metric || metric.count === 0) return null

  const score = Math.round(metric.avg)
  const color = getScoreColor(score, "0-100")
  const data = [
    { value: score, color },
    { value: 100 - score, color: "rgba(29, 29, 27, 0.08)" },
  ]

  return (
    <BrandPanel accent="sage" tone="soft" className="brand-lines p-4 sm:p-5">
      <Eyebrow accent="sage">trust battery</Eyebrow>

      <h3 className="mt-2 text-lg font-bold tracking-[-0.04em] text-ink">
        current charge
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        Trust starts in the middle and moves with each interaction.
      </p>

      <div className="relative mt-4 h-[180px]">
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

        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 200 210">
          {[25, 50, 75].map((pct) => {
            const angle = (180 - pct * 1.8) * (Math.PI / 180)
            const centerX = 100
            const centerY = 172
            const outerRadius = 78
            const innerRadius = 69
            const x1 = centerX + outerRadius * Math.cos(angle)
            const y1 = centerY - outerRadius * Math.sin(angle)
            const x2 = centerX + innerRadius * Math.cos(angle)
            const y2 = centerY - innerRadius * Math.sin(angle)

            return (
              <line
                key={pct}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(29, 29, 27, 0.25)"
                strokeWidth="1.5"
              />
            )
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-end pb-6">
          <span className="text-5xl font-bold tracking-[-0.08em]" style={{ color }}>
            {score}
          </span>
          <span className="text-xs font-semibold tracking-[0.08em] text-muted">
            out of 100
          </span>
        </div>
      </div>

      <div className="text-sm text-muted">
        Averaged across {metric.count} {metric.count === 1 ? "reviewer" : "reviewers"}.
      </div>
    </BrandPanel>
  )
}

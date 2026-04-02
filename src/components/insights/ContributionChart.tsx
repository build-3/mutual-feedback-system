"use client"

import { memo } from "react"
import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"
import ChartContainer from "./ChartContainer"

interface Props {
  contributionCounts: Record<string, number>
}

const KEY_TO_LEVEL: Record<string, number> = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
}

const LEVELS = [
  {
    label: "finding feet",
    fullLabel: "finding their feet",
    color: "#9d9b9a",
  },
  {
    label: "reliable",
    fullLabel: "reliable support",
    color: "#c6e5f8",
  },
  {
    label: "independent",
    fullLabel: "independent contributor",
    color: "#79c0a6",
  },
  {
    label: "leader",
    fullLabel: "leader",
    color: "#f5bb9f",
  },
]

const LABEL_KEYWORDS = ["finding", "reliable", "independent", "leader"]

function resolveIndex(value: string) {
  const normalized = value.toLowerCase().trim()

  if (KEY_TO_LEVEL[normalized] !== undefined) return KEY_TO_LEVEL[normalized]

  for (let index = 0; index < LABEL_KEYWORDS.length; index += 1) {
    if (normalized.includes(LABEL_KEYWORDS[index])) return index
  }

  return null
}

export default memo(function ContributionChart({ contributionCounts }: Props) {
  if (Object.keys(contributionCounts).length === 0) return null

  const data = LEVELS.map((level, index) => {
    let count = 0

    for (const [key, value] of Object.entries(contributionCounts)) {
      if (resolveIndex(key) === index) count += value
    }

    return {
      name: level.label,
      fullName: level.fullLabel,
      count,
      color: level.color,
    }
  })

  if (data.every((entry) => entry.count === 0)) return null

  return (
    <BrandPanel accent="lavender" tone="soft" className="brand-lines p-5 sm:p-6">
      <Eyebrow accent="lavender">contribution view</Eyebrow>
      <h3 className="mt-2 text-lg font-bold tracking-[-0.04em] text-ink">
        how peers rate contribution
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        this shows the shape of peer feedback, not a single final verdict.
      </p>

      <div className="mt-4 h-[175px] sm:h-[190px]">
        <ChartContainer height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#9d9b9a" }} />
            <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11, fill: "#5f5b58" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid rgba(29, 29, 27, 0.08)",
                borderRadius: "18px",
                fontSize: "13px",
              }}
              formatter={(value, _name, props) => {
                const count = Number(value)
                const fullName = (props as { payload?: { fullName?: string } }).payload?.fullName ?? ""
                return [`${count} ${count === 1 ? "review" : "reviews"}`, fullName]
              }}
            />
            <Bar dataKey="count" radius={[0, 10, 10, 0]} barSize={22}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </BrandPanel>
  )
})

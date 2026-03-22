"use client"

import { ITP_BADGE_COLORS, ITP_DESCRIPTIONS } from "@/lib/insights-helpers"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"

interface Props {
  archetypeCounts: Record<string, number>
}

export default function ITPArchetypeBadge({ archetypeCounts }: Props) {
  const entries = Object.entries(archetypeCounts)
  if (entries.length === 0) return null

  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const topArchetype = sorted[0][0]
  const description = ITP_DESCRIPTIONS[topArchetype] || ""
  const badgeColor = ITP_BADGE_COLORS[topArchetype] || "bg-gray-100 text-gray-800"

  return (
    <BrandPanel accent="yellow" tone="soft" className="brand-lines p-5 sm:p-6">
      <Eyebrow accent="yellow">archetype</Eyebrow>
      <h3 className="mt-3 text-2xl font-bold tracking-[-0.05em] text-ink">
        ideal team player read
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        the most common archetype based on the scores submitted in this range.
      </p>

      <div className="mt-6 text-center">
        <span className={`inline-flex rounded-full px-5 py-3 text-lg font-semibold ${badgeColor}`}>
          {topArchetype}
        </span>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-muted">
          {description}
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {sorted.map(([name, count]) => (
            <span
              key={name}
              className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${ITP_BADGE_COLORS[name] || "bg-gray-100 text-gray-700"}`}
            >
              {name} x{count}
            </span>
          ))}
        </div>
      </div>
    </BrandPanel>
  )
}

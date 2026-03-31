"use client"

import { memo } from "react"
import { NumericMetric } from "@/hooks/useEmployeeInsights"
import { getContributionLabel as formatContributionLevel } from "@/lib/brand"
import { getScoreColor } from "@/lib/insights-helpers"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"

interface Props {
  metrics: Record<string, NumericMetric>
  contributionCounts?: Record<string, number>
  orgAvgMetrics?: Record<string, number>
}

interface CardConfig {
  key: string
  label: string
  scale: "1-5" | "0-100"
  suffix: string
  accent: "sky" | "peach" | "sage" | "lavender" | "pink"
  isContribution?: boolean
}

const CARD_CONFIGS: CardConfig[] = [
  {
    key: "recommend_rating",
    label: "full-time backing",
    scale: "1-5",
    suffix: "/5",
    accent: "sky",
  },
  {
    key: "purpose_alignment",
    label: "purpose alignment",
    scale: "1-5",
    suffix: "/5",
    accent: "peach",
  },
  {
    key: "trust_battery",
    label: "trust battery",
    scale: "0-100",
    suffix: "/100",
    accent: "sage",
  },
  {
    key: "contribution_level",
    label: "contribution level",
    scale: "1-5",
    suffix: "",
    accent: "lavender",
    isContribution: true,
  },
  {
    key: "adhoc_rating",
    label: "adhoc score",
    scale: "1-5",
    suffix: "/5",
    accent: "pink",
  },
]

function getContributionMode(counts: Record<string, number>) {
  let winner = ""
  let highest = 0

  for (const [key, count] of Object.entries(counts)) {
    if (count > highest) {
      highest = count
      winner = key
    }
  }

  return formatContributionLevel(winner)
}

export default memo(function ScoreCardRow({
  metrics,
  contributionCounts,
  orgAvgMetrics,
}: Props) {
  const cards = CARD_CONFIGS.filter((card) => {
    if (card.isContribution) {
      return contributionCounts && Object.keys(contributionCounts).length > 0
    }

    return metrics[card.key] && metrics[card.key].count > 0
  })

  if (cards.length === 0) return null

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        if (card.isContribution && contributionCounts) {
          const totalReviews = Object.values(contributionCounts).reduce(
            (sum, value) => sum + value,
            0
          )

          return (
            <BrandPanel
              key={card.key}
              accent={card.accent}
              tone="washed"
              className="brand-lines p-4"
            >
              <Eyebrow accent={card.accent}>{card.label}</Eyebrow>
              <div className="mt-3 text-xl font-bold tracking-[-0.05em] capitalize text-ink">
                {getContributionMode(contributionCounts)}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                Most common view across {totalReviews}{" "}
                {totalReviews === 1 ? "review" : "reviews"}.
              </p>
            </BrandPanel>
          )
        }

        const metric = metrics[card.key]
        if (!metric) return null

        const maxValue = card.scale === "0-100" ? 100 : 5
        const percentage = (metric.avg / maxValue) * 100
        const color = getScoreColor(metric.avg, card.scale)

        return (
          <BrandPanel
            key={card.key}
            accent={card.accent}
            tone="soft"
            className="brand-lines p-4"
          >
            <Eyebrow accent={card.accent}>{card.label}</Eyebrow>

            <div className="mt-3 flex items-end gap-1">
              <span
                className="text-3xl font-bold tracking-[-0.08em]"
                style={{ color }}
              >
                {metric.avg.toFixed(1)}
              </span>
              {card.suffix && (
                <span className="pb-0.5 text-xs font-semibold text-muted">
                  {card.suffix}
                </span>
              )}
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${percentage}%`, backgroundColor: color }}
              />
            </div>

            <div className="mt-2 text-xs text-muted">
              Based on {metric.count} {metric.count === 1 ? "review" : "reviews"}.
            </div>

            {orgAvgMetrics && orgAvgMetrics[card.key] !== undefined && (
              <div className="mt-1 text-[11px] tracking-[0.08em] text-muted">
                team avg {orgAvgMetrics[card.key].toFixed(1)}
              </div>
            )}
          </BrandPanel>
        )
      })}
    </div>
  )
})

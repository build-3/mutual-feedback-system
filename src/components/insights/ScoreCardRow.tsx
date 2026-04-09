"use client"

import { memo } from "react"
import { NumericMetric } from "@/hooks/useEmployeeInsights"
import { getScoreColor } from "@/lib/insights-helpers"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"

interface Props {
  metrics: Record<string, NumericMetric>
  orgAvgMetrics?: Record<string, number>
}

interface CardConfig {
  key: string
  label: string
  scale: "1-5" | "0-100"
  suffix: string
  accent: "sky" | "peach" | "sage" | "pink"
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
    key: "adhoc_rating",
    label: "adhoc score",
    scale: "1-5",
    suffix: "/5",
    accent: "pink",
  },
]

export default memo(function ScoreCardRow({
  metrics,
  orgAvgMetrics,
}: Props) {
  const cards = CARD_CONFIGS.filter((card) => {
    return metrics[card.key] && metrics[card.key].count > 0
  })

  if (cards.length === 0) return null

  const colClass =
    cards.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : cards.length === 3
        ? "grid-cols-2 lg:grid-cols-3"
        : "grid-cols-2 lg:grid-cols-4"

  return (
    <div className={`grid gap-3 sm:gap-4 ${colClass}`}>
      {cards.map((card) => {
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
              based on {metric.count} {metric.count === 1 ? "review" : "reviews"}.
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

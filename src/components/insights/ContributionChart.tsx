"use client"

import { memo } from "react"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"

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
    label: "leader",
    fullLabel: "leader",
    color: "#f5bb9f",
    bgColor: "rgba(245, 187, 159, 0.15)",
  },
  {
    label: "independent contributor",
    fullLabel: "independent contributor",
    color: "#79c0a6",
    bgColor: "rgba(121, 192, 166, 0.15)",
  },
  {
    label: "reliable support",
    fullLabel: "reliable support",
    color: "#c6e5f8",
    bgColor: "rgba(198, 229, 248, 0.15)",
  },
  {
    label: "finding their feet",
    fullLabel: "finding their feet",
    color: "#9d9b9a",
    bgColor: "rgba(157, 155, 154, 0.10)",
  },
]

// Original order: finding feet=0, reliable=1, independent=2, leader=3
// Display order (reversed): leader=3, independent=2, reliable=1, finding feet=0
const DISPLAY_TO_ORIGINAL = [3, 2, 1, 0]

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

  // Build counts in original order (finding feet=0, reliable=1, independent=2, leader=3)
  const originalCounts = [0, 0, 0, 0]

  for (const [key, value] of Object.entries(contributionCounts)) {
    const resolved = resolveIndex(key)
    if (resolved !== null) originalCounts[resolved] += value
  }

  const totalReviews = originalCounts.reduce((sum, c) => sum + c, 0)
  if (totalReviews === 0) return null

  const maxCount = Math.max(...originalCounts)

  // Build display data in reversed order (leader first)
  const rows = LEVELS.map((level, displayIndex) => {
    const originalIndex = DISPLAY_TO_ORIGINAL[displayIndex]
    const count = originalCounts[originalIndex]
    const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0

    return { ...level, count, percentage }
  })

  return (
    <BrandPanel accent="lavender" tone="soft" className="brand-lines p-4 sm:p-6">
      <Eyebrow accent="lavender">contribution view</Eyebrow>
      <h3 className="mt-1.5 sm:mt-2 text-base sm:text-lg font-bold tracking-[-0.04em] text-ink">
        how peers rate contribution
      </h3>
      <p className="mt-1 text-[11px] sm:text-xs leading-5 text-muted">
        distribution across {totalReviews}{" "}
        {totalReviews === 1 ? "review" : "reviews"}.
      </p>

      <div className="mt-4 sm:mt-5 space-y-2.5 sm:space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 sm:mb-1.5 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium tracking-[-0.01em] text-ink">
                {row.label}
              </span>
              <span
                className="min-w-[3rem] text-right text-xs sm:text-sm font-bold tabular-nums"
                style={{ color: row.count > 0 ? row.color : "#9d9b9a" }}
              >
                {row.count}{" "}
                <span className="text-[10px] sm:text-xs font-normal text-muted">
                  {row.count === 1 ? "peer" : "peers"}
                </span>
              </span>
            </div>
            <div className="h-2 sm:h-2.5 overflow-hidden rounded-full bg-black/[0.04]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${row.percentage}%`,
                  backgroundColor: row.count > 0 ? row.color : "transparent",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </BrandPanel>
  )
})

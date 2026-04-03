"use client"

import { memo } from "react"
import clsx from "clsx"
import { badgeClasses } from "@/components/ui/brand"

type MatrixRatingProps = {
  items: { key: string; label: string }[]
  values: Record<string, number>
  onChange: (key: string, val: number) => void
}

const BADGE = badgeClasses({ accent: "peach", tone: "soft" })

const MatrixRating = memo(function MatrixRating({
  items,
  values,
  onChange,
}: MatrixRatingProps) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-[24px] border border-line bg-white px-4 py-4 shadow-brand"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-ink sm:max-w-[18rem]">
            {item.label}
            </span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => onChange(item.key, score)}
                aria-pressed={score === values[item.key]}
                className={clsx(
                  "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition-all",
                  score === values[item.key]
                    ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                    : "border-line bg-white text-muted hover:-translate-y-0.5 hover:border-black/15"
                )}
              >
                {score}
              </button>
            ))}
          </div>
          {values[item.key] > 0 && (
            <span className={BADGE.className} style={BADGE.style}>
              {values[item.key]}/5
            </span>
          )}
          </div>
        </div>
      ))}
    </div>
  )
})

export default MatrixRating

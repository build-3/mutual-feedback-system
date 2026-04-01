"use client"

import clsx from "clsx"
import { badgeClasses } from "@/components/ui/brand"

type StarRatingProps = {
  value: number
  onChange: (val: number) => void
  max?: number
  label?: string
}

export default function StarRating({
  value,
  onChange,
  max = 5,
  label,
}: StarRatingProps) {
  return (
    <div className="space-y-3">
      {label && <p className="text-sm text-muted">{label}</p>}
      <div className="grid grid-cols-5 gap-2.5 sm:max-w-sm">
        {Array.from({ length: max }, (_, index) => index + 1).map((score) => {
          const selected = score <= value

          return (
          <button
            key={score}
            type="button"
            aria-label={`Rate ${score} out of ${max}`}
            onClick={() => onChange(score)}
            aria-pressed={selected}
            className={clsx(
              "rounded-[22px] border px-2 py-4 text-center text-base font-semibold transition-all",
              selected
                ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                : "border-line bg-white text-muted hover:-translate-y-0.5 hover:border-black/15"
            )}
          >
            {score}
          </button>
          )
        })}
      </div>
      {value > 0 && (() => {
        const badge = badgeClasses({ accent: "peach", tone: "soft" })
        return (
          <p>
            <span className={badge.className} style={badge.style}>
              {value} / {max}
            </span>
          </p>
        )
      })()}
    </div>
  )
}
